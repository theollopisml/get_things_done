import { json } from '@sveltejs/kit';
import { searchGlobal } from '$lib/server/application/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });
	try {
		return json(await searchGlobal(url.searchParams.get('q')), {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (cause) {
		if (cause instanceof Error && cause.message === 'Recherche limitée à 200 caractères.') {
			return json({ error: cause.message }, { status: 400 });
		}
		return json({ error: 'Recherche indisponible. Réessaie.' }, { status: 503 });
	}
};
