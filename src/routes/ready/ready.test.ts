import { afterEach, describe, expect, it, vi } from 'vitest';

const { client } = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock('$lib/server/db', () => ({ client }));
import { GET } from './+server';
import { GET as health } from '../health/+server';

const event = {} as Parameters<typeof GET>[0];

describe('operational routes', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.resetAllMocks();
	});
	it('reports liveness without querying the database', async () => {
		const response = await health({} as Parameters<typeof health>[0]);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
		expect(client).not.toHaveBeenCalled();
	});
	it('reports readiness when PostgreSQL responds', async () => {
		client.mockReturnValue(Object.assign(Promise.resolve([]), { cancel: vi.fn() }));
		const response = await GET(event);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
	it('returns a generic 503 without exposing database errors', async () => {
		client.mockReturnValue(
			Object.assign(Promise.reject(new Error('secret connection string')), { cancel: vi.fn() })
		);
		const response = await GET(event);
		expect(response.status).toBe(503);
		expect(await response.text()).toBe('unavailable');
	});
	it('cancels a stalled probe after three seconds', async () => {
		vi.useFakeTimers();
		const cancel = vi.fn();
		client.mockReturnValue(Object.assign(new Promise(() => {}), { cancel }));
		const response = GET(event);
		await vi.advanceTimersByTimeAsync(3000);
		expect((await response).status).toBe(503);
		expect(cancel).toHaveBeenCalledOnce();
	});
});
