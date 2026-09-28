import { fail } from '@sveltejs/kit';
import {
	confirmReview,
	correctReviewRelation,
	InvalidCapture,
	listReviewParentOptions
} from '$lib/server/application/captures';
import { listJevReviewEntries } from '$lib/server/repositories/captures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const onlyUnreviewed = url.searchParams.get('filter') === 'unreviewed';
	const [entries, parents] = await Promise.all([
		listJevReviewEntries(onlyUnreviewed),
		listReviewParentOptions()
	]);
	return { onlyUnreviewed, entries, parents };
};

export const actions = {
	confirm: async ({ request }) => {
		const form = await request.formData();
		try {
			if (!(await confirmReview(form.get('id'))))
				return fail(404, { error: 'Capture introuvable.' });
			return { saved: true };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Confirmation impossible. Réessaie.' });
		}
	},
	relation: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await correctReviewRelation(form.get('id'), form.get('relationId'));
			if (result === 'not_found') return fail(404, { error: 'Capture introuvable.' });
			if (result === 'object_unavailable') {
				return fail(409, { error: 'Objet supprimé ou indisponible.' });
			}
			if (result === 'checkpoint_conflict') {
				return fail(409, { error: 'Détache d’abord cette Task de son Checkpoint.' });
			}
			if (result === 'invalid_parent') {
				return fail(409, { error: 'Ce rattachement n’est plus disponible.' });
			}
			return { saved: true };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Correction impossible. Réessaie.' });
		}
	}
} satisfies Actions;
