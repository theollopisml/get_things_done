import { z } from 'zod';
import { recurrenceRuleSchema } from '$lib/domain/recurrence';
import {
	createTask,
	InvalidRecurrenceChange,
	saveTask,
	setTaskStatus,
	undoRecurringTransition
} from '$lib/server/repositories/tasks';

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
	dueTime: optionalTime,
	recurrenceRule: z.string().default('')
});
const status = z.enum(['todo', 'in_progress', 'done', 'cancelled']);

export async function addTask(value: unknown, dueDateValue: unknown = '') {
	const parsed = title.safeParse(value);
	if (!parsed.success) throw new InvalidTask('Saisis un titre pour la Task.');
	const parsedDate = optionalDate.safeParse(dueDateValue);
	if (!parsedDate.success) throw new InvalidTask('Date d’échéance invalide.');
	return createTask(parsed.data, parsedDate.data);
}

export async function editTask(taskId: unknown, fields: Record<string, unknown>) {
	const parsedId = id.safeParse(taskId);
	const parsed = edit.safeParse(fields);
	if (!parsedId.success || !parsed.success) throw new InvalidTask('Champs de Task invalides.');
	const values = parsed.data;
	if ((values.scheduledTime && !values.scheduledDate) || (values.dueTime && !values.dueDate))
		throw new InvalidTask('Choisis une date avant de préciser une heure.');
	let recurrenceRule = null;
	if (values.recurrenceRule) {
		try {
			const parsedRule = recurrenceRuleSchema.safeParse(JSON.parse(values.recurrenceRule));
			if (!parsedRule.success) throw new Error('Invalid recurrence');
			recurrenceRule = parsedRule.data;
		} catch {
			throw new InvalidTask('Règle de récurrence invalide.');
		}
		if (!values.scheduledDate || values.dueDate || values.dueTime)
			throw new InvalidTask(
				'Une Task récurrente doit être planifiée et ne peut pas avoir d’échéance.'
			);
	}
	try {
		return await saveTask(parsedId.data, {
			...values,
			description: values.description || null,
			recurrenceRule
		});
	} catch (error) {
		if (error instanceof InvalidRecurrenceChange) throw new InvalidTask(error.message);
		throw error;
	}
}

export async function changeTaskStatus(
	taskId: unknown,
	nextStatus: unknown,
	timezone: unknown = 'UTC',
	expectedDate: unknown = null
) {
	const parsedId = id.safeParse(taskId);
	const parsedStatus = status.safeParse(nextStatus);
	const parsedTimezone = z.string().max(100).safeParse(timezone);
	if (!parsedId.success || !parsedStatus.success || !parsedTimezone.success)
		throw new InvalidTask('Statut de Task invalide.');
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: parsedTimezone.data });
	} catch {
		throw new InvalidTask('Fuseau horaire invalide.');
	}
	const parsedDate = z
		.union([z.iso.date(), z.null(), z.literal('')])
		.transform((value) => value || null)
		.safeParse(expectedDate);
	if (!parsedDate.success) throw new InvalidTask('Date de Task invalide.');
	return setTaskStatus(parsedId.data, parsedStatus.data, parsedTimezone.data, parsedDate.data);
}

export async function undoTaskRecurrence(
	taskId: unknown,
	previousDate: unknown,
	expectedDate: unknown,
	previousStatus: unknown,
	expectedStatus: unknown
) {
	const parsed = z
		.object({
			id: id,
			previousDate: z.iso.date(),
			expectedDate: z.iso.date(),
			previousStatus: z.enum(['todo', 'in_progress', 'cancelled']),
			expectedStatus: z.enum(['todo', 'cancelled'])
		})
		.safeParse({ id: taskId, previousDate, expectedDate, previousStatus, expectedStatus });
	if (!parsed.success) throw new InvalidTask('Annulation invalide.');
	return undoRecurringTransition(parsed.data);
}
