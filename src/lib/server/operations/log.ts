import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<string>();

export type LogLevel = 'info' | 'warn' | 'error';

export type LogEvent = {
	event: 'http_request' | 'http_error' | 'jev_classification';
	request_id?: string;
	entry_id?: string;
	model?: string;
	duration_ms?: number;
	error?: string;
	status?: number;
	method?: string;
	path?: string;
	cost?: number;
};

export function logEvent(level: LogLevel, fields: LogEvent): void {
	const { event, entry_id, model, duration_ms, error, status, method, path, cost } = fields;
	const line = JSON.stringify({
		timestamp: new Date().toISOString(),
		level,
		event,
		request_id: fields.request_id ?? requestContext.getStore(),
		entry_id,
		model,
		duration_ms,
		error,
		status,
		method,
		path,
		cost
	});
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.info(line);
}
