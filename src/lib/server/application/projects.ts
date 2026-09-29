import { z } from 'zod';
import { createProject, saveProject, setProjectStatus } from '$lib/server/repositories/projects';

export class InvalidProject extends Error {}

const id = z.uuid();
const title = z.string().trim().min(1).max(500);
const optionalDate = z.union([z.iso.date(), z.literal('')]).transform((value) => value || null);
const edit = z.object({
	title,
	description: z.string().max(100_000),
	startDate: optionalDate,
	dueDate: optionalDate
});
const status = z.enum(['planned', 'active', 'paused', 'done', 'cancelled']);

export async function addProject(value: unknown) {
	const parsed = title.safeParse(value);
	if (!parsed.success) throw new InvalidProject('Saisis un titre pour le Project.');
	return createProject(parsed.data);
}

export async function editProject(projectId: unknown, fields: Record<string, unknown>) {
	const parsedId = id.safeParse(projectId);
	const parsed = edit.safeParse(fields);
	if (!parsedId.success || !parsed.success)
		throw new InvalidProject('Champs de Project invalides.');
	return saveProject(parsedId.data, {
		...parsed.data,
		description: parsed.data.description || null
	});
}

export async function changeProjectStatus(projectId: unknown, nextStatus: unknown) {
	const parsedId = id.safeParse(projectId);
	const parsedStatus = status.safeParse(nextStatus);
	if (!parsedId.success || !parsedStatus.success)
		throw new InvalidProject('Statut de Project invalide.');
	const result = await setProjectStatus(parsedId.data, parsedStatus.data);
	if (result.outcome === 'invalid_transition')
		throw new InvalidProject('Transition de statut impossible.');
	return result.outcome === 'updated' ? result : null;
}
