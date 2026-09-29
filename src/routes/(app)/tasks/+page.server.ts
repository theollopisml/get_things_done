import { fail } from '@sveltejs/kit';
import {
	addTask,
	changeTaskStatus,
	editTask,
	InvalidTask,
	undoTaskRecurrence
} from '$lib/server/application/tasks';
import { InvalidProjectTask, moveTaskToProject } from '$lib/server/application/project-tasks';
import { listProjects } from '$lib/server/repositories/projects';
import { listTasks } from '$lib/server/repositories/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const history = url.searchParams.get('view') === 'history';
	const [tasks, projects] = await Promise.all([listTasks(history), listProjects()]);
	return { tasks, history, projectOptions: projects.map(({ id, title }) => ({ id, title })) };
};

export const actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		try {
			const task = await addTask(form.get('title'), form.get('dueDate') ?? '');
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
			const changed = await changeTaskStatus(
				form.get('id'),
				form.get('status'),
				form.get('timezone') ?? 'UTC',
				form.get('expectedDate')
			);
			return changed
				? {
						saved: true,
						previousStatus: changed.previousStatus,
						previousScheduledDate: changed.previousScheduledDate,
						nextScheduledDate: changed.nextScheduledDate,
						expectedStatus: changed.expectedStatus
					}
				: fail(404, { error: 'Task introuvable.' });
		} catch (error) {
			if (error instanceof InvalidTask) return fail(400, { error: error.message });
			return fail(503, { error: 'Action impossible. Réessaie.' });
		}
	},
	undoRecurrence: async ({ request }) => {
		const form = await request.formData();
		try {
			const task = await undoTaskRecurrence(
				form.get('id'),
				form.get('previousDate'),
				form.get('expectedDate'),
				form.get('previousStatus'),
				form.get('expectedStatus')
			);
			return task
				? { saved: true }
				: fail(409, { error: 'Cette occurrence a changé. Impossible d’annuler.' });
		} catch (error) {
			if (error instanceof InvalidTask) return fail(400, { error: error.message });
			return fail(503, { error: 'Annulation impossible. Réessaie.' });
		}
	},
	move: async ({ request }) => {
		const form = await request.formData();
		try {
			const moved = await moveTaskToProject(
				form.get('id'),
				form.get('projectId'),
				form.has('position') ? form.get('position') : undefined
			);
			return moved ? moved : fail(404, { error: 'Task introuvable.' });
		} catch (error) {
			if (error instanceof InvalidProjectTask) return fail(400, { error: error.message });
			return fail(503, { error: 'Déplacement impossible. Réessaie.' });
		}
	}
} satisfies Actions;
