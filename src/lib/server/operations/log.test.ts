import { afterEach, expect, it, vi } from 'vitest';
import { logEvent, requestContext, type LogEvent } from './log';

afterEach(() => vi.restoreAllMocks());

it('emits safe JSON fields and drops unexpected user content', () => {
	const sink = vi.spyOn(console, 'info').mockImplementation(() => {});
	logEvent('info', {
		event: 'jev_classification',
		entry_id: 'entry-id',
		raw_content: 'private text',
		title: 'private title'
	} as LogEvent);
	const logged = JSON.parse(sink.mock.calls[0][0]);
	expect(logged).toMatchObject({
		level: 'info',
		event: 'jev_classification',
		entry_id: 'entry-id'
	});
	expect(logged.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	expect(sink.mock.calls[0][0]).not.toContain('private');
});

it('keeps the originating request ID through detached asynchronous work', async () => {
	const sink = vi.spyOn(console, 'warn').mockImplementation(() => {});
	await Promise.all(
		['request-a', 'request-b'].map(
			(id) =>
				new Promise<void>((resolve) => {
					requestContext.run(id, () =>
						setImmediate(() => {
							logEvent('warn', { event: 'jev_classification', error: 'timeout' });
							resolve();
						})
					);
				})
		)
	);
	expect(sink.mock.calls.map(([line]) => JSON.parse(line).request_id).sort()).toEqual([
		'request-a',
		'request-b'
	]);
});
