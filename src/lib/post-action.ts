import { deserialize } from '$app/forms';

export async function postAction(
	path: string,
	data: FormData
): Promise<{ ok: boolean; error?: string; data?: Record<string, unknown> }> {
	try {
		const response = await fetch(path, {
			method: 'POST',
			body: data,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		if (result.type === 'success') return { ok: true, data: result.data };
		if (result.type === 'failure' && typeof result.data?.error === 'string') {
			return { ok: false, error: result.data.error };
		}
		return { ok: false, error: 'Action impossible. Réessaie.' };
	} catch {
		return { ok: false, error: 'Connexion indisponible. Réessaie.' };
	}
}
