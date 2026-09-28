import { fail } from '@sveltejs/kit';
import { capture, InvalidCapture } from '$lib/server/application/captures';
import type { Actions } from './$types';

export const actions = {
	capture: async ({ request }) => {
		const form = await request.formData();
		const rawContent = form.get('rawContent');
		const kind = form.get('kind');
		try {
			await capture(rawContent, kind);
			return { saved: true };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Enregistrement impossible. Réessaie.' });
		}
	}
} satisfies Actions;
