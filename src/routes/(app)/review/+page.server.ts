import { fail } from '@sveltejs/kit';
import {
	confirmReview,
	confirmReviews,
	correctReviewRelation,
	correctReviewType,
	InvalidCapture,
	listReviewParentOptions
} from '$lib/server/application/captures';
import { listJevReviewEntries } from '$lib/server/repositories/captures';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const onlyUnreviewed = url.searchParams.get('filter') !== 'all';
	const [entries, parents] = await Promise.all([
		listJevReviewEntries(onlyUnreviewed),
		listReviewParentOptions()
	]);
	return { onlyUnreviewed, entries, parents };
};

export const actions = {
	confirmAll: async ({ request }) => {
		const form = await request.formData();
		try {
			return { confirmed: await confirmReviews(form.getAll('ids')) };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Confirmation impossible. Réessaie.' });
		}
	},
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
	},
	type: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await correctReviewType(form.get('id'), form.get('kind'));
			if (result === 'not_found') return fail(404, { error: 'Capture introuvable.' });
			if (result === 'same_kind') return fail(400, { error: 'Choisis un autre type.' });
			if (result === 'object_unavailable') {
				return fail(409, { error: 'Objet supprimé ou indisponible.' });
			}
			if (result === 'children_conflict') {
				return fail(409, { error: 'Détache d’abord les objets enfants.' });
			}
			if (result === 'data_conflict') {
				return fail(409, {
					error: 'Retire d’abord le rattachement ou les champs propres à ce type.'
				});
			}
			return { saved: true };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Correction impossible. Réessaie.' });
		}
	}
} satisfies Actions;
