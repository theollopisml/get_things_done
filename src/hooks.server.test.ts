import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn(async () => null) }));
vi.mock('$lib/server/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('$lib/server/db', () => ({ db: {} }));
vi.mock('better-auth/svelte-kit', () => ({
	svelteKitHandler: ({ event, resolve }: Parameters<Handle>[0]) => resolve(event)
}));
import { handle, handleError } from './hooks.server';

function input(path: string, method = 'GET') {
	return {
		event: {
			url: new URL(`http://localhost${path}`),
			request: new Request(`http://localhost${path}`, { method }),
			route: { id: new URL(`http://localhost${path}`).pathname },
			locals: {}
		},
		resolve: vi.fn(async () => new Response('response'))
	} as unknown as Parameters<Handle>[0];
}

describe('operational access and request logs', () => {
	afterEach(() => vi.restoreAllMocks());
	it.each(['/health', '/ready', '/health/', '/ready/'])(
		'allows %s without querying authentication',
		async (path) => {
			vi.spyOn(console, 'info').mockImplementation(() => {});
			getSession.mockClear();
			const response = await handle(input(path));
			expect(response.status).toBe(200);
			expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
			expect(getSession).not.toHaveBeenCalled();
		}
	);
	it('keeps private API routes protected and logs the denied response', async () => {
		const sink = vi.spyOn(console, 'info').mockImplementation(() => {});
		const response = await handle(input('/api/search?query=private', 'POST'));
		expect(response.status).toBe(401);
		expect(JSON.parse(sink.mock.calls[0][0])).toMatchObject({ status: 401, event: 'http_request' });
		expect(sink.mock.calls[0][0]).not.toContain('private');
	});
	it('logs thrown redirects as ordinary responses', async () => {
		const sink = vi.spyOn(console, 'info').mockImplementation(() => {});
		await expect(handle(input('/tasks'))).rejects.toMatchObject({ status: 303 });
		expect(JSON.parse(sink.mock.calls[0][0])).toMatchObject({ level: 'info', status: 303 });
	});
	it('adds a request ID to immutable OAuth redirect responses', async () => {
		vi.spyOn(console, 'info').mockImplementation(() => {});
		const request = input('/api/auth/sign-in/github');
		request.resolve = vi.fn(async () => Response.redirect('https://github.com/login', 302));
		const response = await handle(request);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('https://github.com/login');
		expect(response.headers.get('x-request-id')).toBeTruthy();
	});
	it('returns a generic application error and hides exception messages', () => {
		const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
		const result = handleError({
			event: input('/tasks').event,
			error: new Error('private title'),
			status: 500,
			message: 'private title'
		});
		expect(result).toEqual({ message: 'Une erreur serveur est survenue.' });
		expect(sink.mock.calls[0][0]).not.toContain('private');
	});
	it('preserves correlation when the framework reports an error after the request context ends', async () => {
		const sink = vi.spyOn(console, 'error').mockImplementation(() => {});
		getSession.mockRejectedValueOnce(new Error('private authentication failure'));
		const request = input('/tasks');
		await expect(handle(request)).rejects.toThrow('private authentication failure');
		handleError({
			event: request.event,
			error: new Error('private failure'),
			status: 500,
			message: 'private failure'
		});
		const records = sink.mock.calls.map(([line]) => JSON.parse(line));
		expect(records).toHaveLength(2);
		expect(records[0].request_id).toBeTruthy();
		expect(records[1].request_id).toBe(records[0].request_id);
		expect(JSON.stringify(records)).not.toContain('private');
	});
});
