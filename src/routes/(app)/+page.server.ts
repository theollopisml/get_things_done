import { fail } from '@sveltejs/kit';
import {
	InvalidCapture,
	retryJevClassification,
	submitCollectorCapture
} from '$lib/server/application/captures';
import type { Actions } from './$types';

export const actions = {
	capture: async ({ request }) => {
		const form = await request.formData();
		const rawContent = form.get('rawContent');
		const kind = form.get('kind');
		try {
			return await submitCollectorCapture(
				rawContent,
				kind,
				form.get('requestId') ?? crypto.randomUUID()
			);
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Enregistrement impossible. Réessaie.' });
		}
	},
	retry: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await retryJevClassification(form.get('id'));
			return result ?? fail(404, { error: 'Capture introuvable.' });
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Relance impossible. Réessaie.' });
		}
	}
} satisfies Actions;
