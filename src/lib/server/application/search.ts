import { searchGlobal as searchRepository } from '$lib/server/repositories/search';

export function normalizeSearchQuery(value: string | null) {
	const query = value?.trim() ?? '';
	if (!query) return '';
	if (query.length > 200) throw new Error('Recherche limitée à 200 caractères.');
	return query;
}

export async function searchGlobal(value: string | null) {
	const query = normalizeSearchQuery(value);
	if (!query) return { tasks: [], projects: [], checkpoints: [] };
	return searchRepository(query);
}
