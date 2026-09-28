import { fail } from '@sveltejs/kit';
import { addTask, changeTaskStatus, editTask, InvalidTask } from '$lib/server/application/tasks';
import { listTasks } from '$lib/server/repositories/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	tasks: await listTasks(url.searchParams.get('view') === 'history'),
	history: url.searchParams.get('view') === 'history'
});

export const actions = {
	create: async ({ request }) => {
		try {
			const task = await addTask((await request.formData()).get('title'));
			return { id: task.id };
		} catch (error) {
			if (error instanceof InvalidTask) return fail(400, { error: error.message });
			return fail(503, { error: 'Création impossible. Réessaie.' });
		}
	},
	save: async ({ request }) => {
		const form = await request.formData();
		try {
			const task = await editTask(form.get('id'), Object.fromEntries(form));
			return task ? { saved: true } : fail(404, { error: 'Task introuvable.' });
		} catch (error) {
			if (error instanceof InvalidTask) return fail(400, { error: error.message });
			return fail(503, { error: 'Sauvegarde impossible. Réessaie.' });
		}
	},
	status: async ({ request }) => {
		const form = await request.formData();
		try {
			const changed = await changeTaskStatus(form.get('id'), form.get('status'));
			return changed
				? { saved: true, previousStatus: changed.previousStatus }
				: fail(404, { error: 'Task introuvable.' });
		} catch (error) {
			if (error instanceof InvalidTask) return fail(400, { error: error.message });
			return fail(503, { error: 'Action impossible. Réessaie.' });
		}
	}
} satisfies Actions;
