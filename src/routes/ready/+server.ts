import { client } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const query = client`select 1`;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			query,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => {
					query.cancel();
					reject(new Error('Readiness timeout'));
				}, 3000);
			})
		]);
		return new Response('ready', { status: 200, headers: { 'cache-control': 'no-store' } });
	} catch {
		return new Response('unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
	} finally {
		if (timer) clearTimeout(timer);
	}
};
