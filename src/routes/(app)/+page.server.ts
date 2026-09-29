import { fail } from '@sveltejs/kit';
import {
	getCollectorClassificationStatus,
	InvalidCapture,
	queueJevClassification,
	submitCollectorCapture
} from '$lib/server/application/captures';
import { changeTaskStatus, InvalidTask } from '$lib/server/application/tasks';
import { InvalidProjectTask, moveTaskToProject } from '$lib/server/application/project-tasks';
import { countReviewAttention } from '$lib/server/repositories/captures';
import { listProjects } from '$lib/server/repositories/projects';
import { listTasks } from '$lib/server/repositories/tasks';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [tasks, reviewAttention, projects] = await Promise.all([
		listTasks(false),
		countReviewAttention(),
		listProjects()
	]);
	return {
		tasks,
		reviewAttention,
		projectOptions: projects.map(({ id, title }) => ({ id, title }))
	};
};

export const actions = {
	capture: async ({ request }) => {
		const form = await request.formData();
		const rawContent = form.get('rawContent');
		const kind = form.get('kind');
		try {
			return await submitCollectorCapture(
				rawContent,
				kind,
				form.get('requestId') ?? crypto.randomUUID(),
				form.get('dueDate') ?? ''
			);
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Enregistrement impossible. Réessaie.' });
		}
	},
	retry: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await queueJevClassification(form.get('id'));
			return result ?? fail(404, { error: 'Capture introuvable.' });
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Relance impossible. Réessaie.' });
		}
	},
	status: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await getCollectorClassificationStatus(form.get('id'));
			return result ?? fail(404, { error: 'Capture introuvable.' });
		} catch (error) {
			if (error instanceof InvalidCapture) return fail(400, { error: error.message });
			return fail(503, { error: 'Statut indisponible. Réessaie.' });
		}
	},
	taskStatus: async ({ request }) => {
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
	},
	moveTask: async ({ request }) => {
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
