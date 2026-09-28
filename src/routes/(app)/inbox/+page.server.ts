import { fail } from '@sveltejs/kit';
import {
	deleteEntry,
	editEntry,
	InvalidCapture,
	listEntries,
	parseEntryId,
	processEntry
} from '$lib/server/application/captures';
import type { Actions, PageServerLoad } from './$types';

const getId = (form: FormData) => {
	return parseEntryId(form.get('id'));
};

export const load: PageServerLoad = async () => ({ entries: await listEntries() });

export const actions = {
	update: async ({ request }) => {
		const form = await request.formData();
		const id = getId(form);
		const rawContent = form.get('rawContent');
		if (!id) return fail(400, { error: 'Capture invalide.' });
		try {
			if (!(await editEntry(id, rawContent))) return fail(404, { error: 'Capture introuvable.' });
			return { saved: true };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Sauvegarde impossible. Réessaie.' });
		}
	},
	classify: async ({ request }) => {
		const form = await request.formData();
		const id = getId(form);
		const kind = form.get('kind');
		if (!id) return fail(400, { error: 'Capture invalide.' });
		try {
			if (!(await processEntry(id, kind))) return fail(404, { error: 'Capture introuvable.' });
			return { saved: true };
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Classification impossible. Réessaie.' });
		}
	},
	delete: async ({ request }) => {
		const id = getId(await request.formData());
		if (!id) return fail(400, { error: 'Capture invalide.' });
		try {
			if (!(await deleteEntry(id))) return fail(404, { error: 'Capture introuvable.' });
			return { saved: true };
		} catch {
			return fail(503, { error: 'Suppression impossible. Réessaie.' });
		}
	}
} satisfies Actions;
