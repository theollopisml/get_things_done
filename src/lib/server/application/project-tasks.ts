import { z } from 'zod';
import {
	createProjectTask,
	moveProjectTask,
	reorderProjectTasks
} from '$lib/server/repositories/project-tasks';

export class InvalidProjectTask extends Error {}

const id = z.uuid();

export async function addProjectTask(projectId: unknown, title: unknown) {
	const parsedId = id.safeParse(projectId);
	const parsedTitle = z.string().trim().min(1).max(500).safeParse(title);
	if (!parsedId.success || !parsedTitle.success)
		throw new InvalidProjectTask('Saisis un titre pour la Task.');
	return createProjectTask(parsedId.data, parsedTitle.data);
}

export async function moveTaskToProject(taskId: unknown, projectId: unknown, position?: unknown) {
	const parsedTask = id.safeParse(taskId);
	const parsedProject = z.union([id, z.literal('')]).safeParse(projectId);
	const parsedPosition = z.coerce.number().int().nonnegative().optional().safeParse(position);
	if (!parsedTask.success || !parsedProject.success || !parsedPosition.success)
		throw new InvalidProjectTask('Déplacement de Task invalide.');
	const result = await moveProjectTask(
		parsedTask.data,
		parsedProject.data || null,
		parsedPosition.data
	);
	if (result.outcome === 'invalid_project') throw new InvalidProjectTask('Project introuvable.');
	return result.outcome === 'not_found' ? null : result;
}

export async function setProjectTaskOrder(projectId: unknown, values: unknown) {
	const parsedId = id.safeParse(projectId);
	const parsedValues = z.array(id).safeParse(values);
	if (!parsedId.success || !parsedValues.success)
		throw new InvalidProjectTask('Ordre des Tasks invalide.');
	const result = await reorderProjectTasks(parsedId.data, parsedValues.data);
	if (result === 'stale_order')
		throw new InvalidProjectTask('La liste a changé. Recharge la page puis réessaie.');
	return result === 'reordered';
}
