import { z } from 'zod';
import {
	createCheckpoint,
	reorderCheckpoints,
	saveCheckpoint,
	setCheckpointStatus,
	setTaskCheckpoint
} from '$lib/server/repositories/checkpoints';

export class InvalidCheckpoint extends Error {}

const id = z.uuid();
const title = z.string().trim().min(1).max(500);
const edit = z.object({
	title,
	description: z.string().max(100_000),
	targetDate: z.union([z.iso.date(), z.literal('')]).transform((value) => value || null)
});
const status = z.enum(['open', 'done', 'cancelled']);

export async function addCheckpoint(projectId: unknown, value: unknown) {
	const parsedId = id.safeParse(projectId);
	const parsedTitle = title.safeParse(value);
	if (!parsedId.success || !parsedTitle.success)
		throw new InvalidCheckpoint('Saisis un titre pour le Checkpoint.');
	return createCheckpoint(parsedId.data, parsedTitle.data);
}

export async function editCheckpoint(
	projectId: unknown,
	checkpointId: unknown,
	fields: Record<string, unknown>
) {
	const parsedProject = id.safeParse(projectId);
	const parsedId = id.safeParse(checkpointId);
	const parsed = edit.safeParse(fields);
	if (!parsedProject.success || !parsedId.success || !parsed.success)
		throw new InvalidCheckpoint('Champs de Checkpoint invalides.');
	return saveCheckpoint(parsedId.data, parsedProject.data, {
		...parsed.data,
		description: parsed.data.description || null
	});
}

export async function changeCheckpointStatus(
	projectId: unknown,
	checkpointId: unknown,
	nextStatus: unknown
) {
	const parsedProject = id.safeParse(projectId);
	const parsedId = id.safeParse(checkpointId);
	const parsedStatus = status.safeParse(nextStatus);
	if (!parsedProject.success || !parsedId.success || !parsedStatus.success)
		throw new InvalidCheckpoint('Statut de Checkpoint invalide.');
	const result = await setCheckpointStatus(parsedId.data, parsedProject.data, parsedStatus.data);
	if (result.outcome === 'invalid_transition')
		throw new InvalidCheckpoint('Transition de statut impossible.');
	return result.outcome === 'updated' ? result.checkpoint : null;
}

export async function setCheckpointOrder(projectId: unknown, values: unknown) {
	const parsedId = id.safeParse(projectId);
	const parsedValues = z.array(id).safeParse(values);
	if (!parsedId.success || !parsedValues.success)
		throw new InvalidCheckpoint('Ordre des Checkpoints invalide.');
	const result = await reorderCheckpoints(parsedId.data, parsedValues.data);
	if (result === 'stale_order')
		throw new InvalidCheckpoint('La liste a changé. Recharge la page puis réessaie.');
	return result === 'reordered';
}

export async function linkTaskCheckpoint(
	projectId: unknown,
	taskId: unknown,
	checkpointId: unknown
) {
	const parsedProject = id.safeParse(projectId);
	const parsedTask = id.safeParse(taskId);
	const parsedCheckpoint = z.union([id, z.literal('')]).safeParse(checkpointId);
	if (!parsedProject.success || !parsedTask.success || !parsedCheckpoint.success)
		throw new InvalidCheckpoint('Rattachement au Checkpoint invalide.');
	const result = await setTaskCheckpoint(
		parsedTask.data,
		parsedProject.data,
		parsedCheckpoint.data || null
	);
	if (result === 'checkpoint_unavailable')
		throw new InvalidCheckpoint('Ce Checkpoint n’appartient pas au Project.');
	return result === 'updated';
}
