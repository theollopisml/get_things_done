import { z } from 'zod';
import { createTask, saveTask, setTaskStatus } from '$lib/server/repositories/tasks';

export class InvalidTask extends Error {}

const title = z.string().trim().min(1).max(500);
const optionalDate = z.union([z.iso.date(), z.literal('')]).transform((value) => value || null);
const optionalTime = z
	.union([z.iso.time({ precision: -1 }), z.literal('')])
	.transform((value) => value || null);
const id = z.uuid();
const edit = z.object({
	title,
	description: z.string().max(100_000),
	scheduledDate: optionalDate,
	scheduledTime: optionalTime,
	dueDate: optionalDate,
	dueTime: optionalTime
});
const status = z.enum(['todo', 'in_progress', 'done', 'cancelled']);

export async function addTask(value: unknown) {
	const parsed = title.safeParse(value);
	if (!parsed.success) throw new InvalidTask('Saisis un titre pour la Task.');
	return createTask(parsed.data);
}

export async function editTask(taskId: unknown, fields: Record<string, unknown>) {
	const parsedId = id.safeParse(taskId);
	const parsed = edit.safeParse(fields);
	if (!parsedId.success || !parsed.success) throw new InvalidTask('Champs de Task invalides.');
	const values = parsed.data;
	if ((values.scheduledTime && !values.scheduledDate) || (values.dueTime && !values.dueDate))
		throw new InvalidTask('Choisis une date avant de préciser une heure.');
	return saveTask(parsedId.data, {
		...values,
		description: values.description || null
	});
}

export async function changeTaskStatus(taskId: unknown, nextStatus: unknown) {
	const parsedId = id.safeParse(taskId);
	const parsedStatus = status.safeParse(nextStatus);
	if (!parsedId.success || !parsedStatus.success) throw new InvalidTask('Statut de Task invalide.');
	return setTaskStatus(parsedId.data, parsedStatus.data);
}
