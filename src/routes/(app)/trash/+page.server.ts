import { fail } from '@sveltejs/kit';
import {
	deleteObject,
	InvalidTrashAction,
	purgeObject,
	restoreObject
} from '$lib/server/application/trash';
import { expireTrash, listTrash, TRASH_RETENTION_DAYS } from '$lib/server/repositories/trash';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	await expireTrash();
	return { items: await listTrash(), retentionDays: TRASH_RETENTION_DAYS };
};

export const actions = {
	delete: async ({ request }) => {
		const form = await request.formData();
		try {
			return (await deleteObject(form.get('kind'), form.get('id')))
				? { deleted: true }
				: fail(404, { error: 'Objet introuvable.' });
		} catch (error) {
			if (error instanceof InvalidTrashAction) return fail(400, { error: error.message });
			return fail(503, { error: 'Suppression impossible. Réessaie.' });
		}
	},
	restore: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await restoreObject(form.get('kind'), form.get('id'));
			if (result === 'parent_deleted')
				return fail(409, { error: 'Restaure le Project avant ce Checkpoint.' });
			return result === 'restored'
				? { restored: true }
				: fail(404, { error: 'Objet indisponible.' });
		} catch (error) {
			if (error instanceof InvalidTrashAction) return fail(400, { error: error.message });
			return fail(503, { error: 'Restauration impossible. Réessaie.' });
		}
	},
	purge: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await purgeObject(form.get('kind'), form.get('id'), form.get('confirmation'));
			return result ? { purged: true } : fail(404, { error: 'Objet indisponible.' });
		} catch (error) {
			if (error instanceof InvalidTrashAction) return fail(400, { error: error.message });
			return fail(503, { error: 'Purge impossible. Réessaie.' });
		}
	}
} satisfies Actions;
