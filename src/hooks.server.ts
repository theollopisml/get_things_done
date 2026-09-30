import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth-schema';
import { logEvent, requestContext } from '$lib/server/operations/log';
import { and, eq } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';

const operationalPaths = new Set(['/health', '/ready']);

const handleRequest: Handle = async ({ event, resolve }) => {
	const requestId = requestContext.getStore();
	const startedAt = Date.now();
	const path = event.url.pathname;
	const isAuthRoute = path === '/api/auth' || path.startsWith('/api/auth/');
	const publicPath = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
	const isLoginRoute = publicPath === '/login';

	try {
		let response: Response | undefined;
		if (!isAuthRoute && !operationalPaths.has(publicPath)) {
			const current = await auth.api.getSession({ headers: event.request.headers });
			const ownerId = env.OWNER_GITHUB_ID;
			let isOwner = false;

			if (current && ownerId) {
				const matchingAccount = await db
					.select({ id: account.id })
					.from(account)
					.where(
						and(
							eq(account.userId, current.user.id),
							eq(account.providerId, 'github'),
							eq(account.accountId, ownerId)
						)
					)
					.limit(1);
				isOwner = matchingAccount.length > 0;
			}

			if ((!current || !isOwner) && !isLoginRoute) {
				if (event.request.method !== 'GET' || path.startsWith('/api/')) {
					response = new Response('Unauthorized', { status: 401 });
				} else {
					throw redirect(303, '/login');
				}
			}

			if (current && isOwner) {
				event.locals.user = current.user;
				event.locals.session = current.session;
			}
		}

		response ??= await svelteKitHandler({ event, resolve, auth, building });
		const headers = new Headers(response.headers);
		if (requestId) headers.set('x-request-id', requestId);
		response = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers
		});
		logEvent(response.status >= 500 ? 'error' : 'info', {
			event: 'http_request',
			request_id: requestId,
			method: event.request.method,
			path: event.route.id ?? 'unmatched',
			status: response.status,
			duration_ms: Date.now() - startedAt
		});
		return response;
	} catch (error) {
		const status =
			typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 500;
		logEvent(status < 500 ? 'info' : 'error', {
			event: 'http_request',
			request_id: requestId,
			method: event.request.method,
			path: event.route.id ?? 'unmatched',
			status,
			duration_ms: Date.now() - startedAt,
			...(status >= 500 ? { error: 'internal_error' } : {})
		});
		throw error;
	}
};

export const handle: Handle = (input) => {
	const requestId = crypto.randomUUID();
	input.event.locals.requestId = requestId;
	return requestContext.run(requestId, () => handleRequest(input));
};

export const handleError: HandleServerError = ({ event, status }) => {
	logEvent('error', {
		event: 'http_error',
		request_id: event.locals.requestId,
		path: event.route.id ?? 'unmatched',
		status,
		error: 'internal_error'
	});
	return { message: 'Une erreur serveur est survenue.' };
};
