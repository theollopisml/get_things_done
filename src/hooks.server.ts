import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth-schema';
import { and, eq } from 'drizzle-orm';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { redirect, type Handle } from '@sveltejs/kit';

const operationalPaths = new Set(['/health', '/ready']);

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isAuthRoute = path === '/api/auth' || path.startsWith('/api/auth/');
	const publicPath = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
	const isLoginRoute = publicPath === '/login';

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
				return new Response('Unauthorized', { status: 401 });
			}
			throw redirect(303, '/login');
		}

		if (current && isOwner) {
			event.locals.user = current.user;
			event.locals.session = current.session;
		}
	}

	return svelteKitHandler({ event, resolve, auth, building });
};
