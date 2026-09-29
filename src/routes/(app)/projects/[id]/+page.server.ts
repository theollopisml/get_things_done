import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import {
	addCheckpoint,
	changeCheckpointStatus,
	editCheckpoint,
	InvalidCheckpoint,
	linkTaskCheckpoint,
	setCheckpointOrder
} from '$lib/server/application/checkpoints';
import { InvalidProject, changeProjectStatus, editProject } from '$lib/server/application/projects';
import {
	addProjectTask,
	InvalidProjectTask,
	moveTaskToProject,
	setProjectTaskOrder
} from '$lib/server/application/project-tasks';
import { getProjectDetail, listProjects } from '$lib/server/repositories/projects';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!z.uuid().safeParse(params.id).success) error(404, 'Project introuvable.');
	const [project, allProjects] = await Promise.all([getProjectDetail(params.id), listProjects()]);
	if (!project) error(404, 'Project introuvable.');
	return {
		project,
		taskCards: project.tasks.map((task) => ({
			...task,
			projectTitle: project.title,
			projectStatus: project.status
		})),
		projectOptions: allProjects.map(({ id, title }) => ({ id, title }))
	};
};

export const actions = {
	save: async ({ request, params }) => {
		try {
			const project = await editProject(params.id, Object.fromEntries(await request.formData()));
			return project ? { saved: true } : fail(404, { error: 'Project introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidProject) return fail(400, { error: cause.message });
			return fail(503, { error: 'Sauvegarde impossible. Réessaie.' });
		}
	},
	status: async ({ request, params }) => {
		try {
			const changed = await changeProjectStatus(
				params.id,
				(await request.formData()).get('status')
			);
			return changed
				? { saved: true, previousStatus: changed.previousStatus }
				: fail(404, { error: 'Project introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidProject) return fail(400, { error: cause.message });
			return fail(503, { error: 'Action impossible. Réessaie.' });
		}
	},
	createTask: async ({ request, params }) => {
		try {
			const task = await addProjectTask(params.id, (await request.formData()).get('title'));
			return task ? { id: task.id } : fail(404, { error: 'Project introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidProjectTask) return fail(400, { error: cause.message });
			return fail(503, { error: 'Création impossible. Réessaie.' });
		}
	},
	moveTask: async ({ request }) => {
		const form = await request.formData();
		try {
			const result = await moveTaskToProject(
				form.get('taskId'),
				form.get('projectId'),
				form.has('position') ? form.get('position') : undefined
			);
			return result ? result : fail(404, { error: 'Task introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidProjectTask) return fail(400, { error: cause.message });
			return fail(503, { error: 'Déplacement impossible. Réessaie.' });
		}
	},
	reorder: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const ordered = await setProjectTaskOrder(params.id, form.getAll('taskId'));
			return ordered ? { saved: true } : fail(404, { error: 'Project introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidProjectTask) return fail(400, { error: cause.message });
			return fail(503, { error: 'Réordonnancement impossible. Réessaie.' });
		}
	},
	createCheckpoint: async ({ request, params }) => {
		try {
			const checkpoint = await addCheckpoint(params.id, (await request.formData()).get('title'));
			return checkpoint ? { id: checkpoint.id } : fail(404, { error: 'Project introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidCheckpoint) return fail(400, { error: cause.message });
			return fail(503, { error: 'Création impossible. Réessaie.' });
		}
	},
	saveCheckpoint: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const checkpoint = await editCheckpoint(params.id, form.get('id'), Object.fromEntries(form));
			return checkpoint ? { saved: true } : fail(404, { error: 'Checkpoint introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidCheckpoint) return fail(400, { error: cause.message });
			return fail(503, { error: 'Sauvegarde impossible. Réessaie.' });
		}
	},
	checkpointStatus: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const checkpoint = await changeCheckpointStatus(
				params.id,
				form.get('id'),
				form.get('status')
			);
			return checkpoint ? { saved: true } : fail(404, { error: 'Checkpoint introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidCheckpoint) return fail(400, { error: cause.message });
			return fail(503, { error: 'Action impossible. Réessaie.' });
		}
	},
	reorderCheckpoints: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const ordered = await setCheckpointOrder(params.id, form.getAll('checkpointId'));
			return ordered ? { saved: true } : fail(404, { error: 'Project introuvable.' });
		} catch (cause) {
			if (cause instanceof InvalidCheckpoint) return fail(400, { error: cause.message });
			return fail(503, { error: 'Réordonnancement impossible. Réessaie.' });
		}
	},
	linkCheckpoint: async ({ request, params }) => {
		const form = await request.formData();
		try {
			const linked = await linkTaskCheckpoint(
				params.id,
				form.get('taskId'),
				form.get('checkpointId')
			);
			return linked ? { saved: true } : fail(404, { error: 'Task introuvable dans ce Project.' });
		} catch (cause) {
			if (cause instanceof InvalidCheckpoint) return fail(400, { error: cause.message });
			return fail(503, { error: 'Rattachement impossible. Réessaie.' });
		}
	}
} satisfies Actions;
