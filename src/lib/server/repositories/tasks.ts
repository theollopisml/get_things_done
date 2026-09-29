import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { db } from '$lib/server/db';
import { projects, tasks } from '$lib/server/db/schema';
import { taskStatusDates, type TaskStatus } from '$lib/domain/tasks';
import {
	getFirstRecurrenceDateAfter,
	getNextRecurrenceDate,
	matchesRecurrenceDate,
	type RecurrenceRule
} from '$lib/domain/recurrence';
import { Temporal } from '@js-temporal/polyfill';

export async function listTasks(history: boolean) {
	const rows = await db
		.select({ task: tasks, projectTitle: projects.title, projectStatus: projects.status })
		.from(tasks)
		.leftJoin(projects, eq(tasks.projectId, projects.id))
		.where(
			and(
				isNull(tasks.deletedAt),
				history
					? or(eq(tasks.status, 'done'), eq(tasks.status, 'cancelled'))
					: or(eq(tasks.status, 'todo'), eq(tasks.status, 'in_progress'))
			)
		)
		.orderBy(asc(tasks.scheduledDate), asc(tasks.dueDate), desc(tasks.createdAt));
	return rows
		.filter(({ task, projectStatus }) => {
			if (history) return true;
			if (projectStatus === 'done' || projectStatus === 'cancelled') return false;
			if (projectStatus === 'paused' && !task.scheduledDate && !task.dueDate) return false;
			return true;
		})
		.map(({ task, projectTitle, projectStatus }) => ({ ...task, projectTitle, projectStatus }));
}

export async function createTask(title: string, dueDate: string | null = null) {
	const [task] = await db.insert(tasks).values({ title, dueDate }).returning();
	return task;
}

export async function saveTask(
	id: string,
	values: {
		title: string;
		description: string | null;
		scheduledDate: string | null;
		scheduledTime: string | null;
		dueDate: string | null;
		dueTime: string | null;
		recurrenceRule: RecurrenceRule | null;
	}
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
			.for('update');
		if (!current) return null;
		const changedRule = !isDeepStrictEqual(current.recurrenceRule, values.recurrenceRule);
		const anchorDate = values.recurrenceRule
			? changedRule
				? values.scheduledDate
				: (current.recurrenceAnchorDate ?? values.scheduledDate)
			: null;
		if (
			values.recurrenceRule &&
			changedRule &&
			(current.status === 'done' || current.status === 'cancelled')
		)
			throw new InvalidRecurrenceChange('Rouvre la Task avant d’ajouter une récurrence.');
		if (
			values.recurrenceRule &&
			anchorDate &&
			values.scheduledDate &&
			changedRule &&
			!matchesRecurrenceDate(values.recurrenceRule, anchorDate, values.scheduledDate)
		) {
			throw new InvalidRecurrenceChange('La date planifiée doit correspondre à la règle.');
		}
		const [task] = await tx
			.update(tasks)
			.set({ ...values, recurrenceAnchorDate: anchorDate, updatedAt: new Date() })
			.where(eq(tasks.id, id))
			.returning();
		return task;
	});
}

export class InvalidRecurrenceChange extends Error {}

export async function setTaskStatus(
	id: string,
	status: TaskStatus,
	timezone: string,
	expectedDate?: string | null
) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
			.for('update');
		if (!current) return null;
		const now = new Date();
		const rule = current.recurrenceRule as RecurrenceRule | null;
		if (rule && expectedDate !== null && current.scheduledDate !== expectedDate) return null;
		if (rule && current.status === 'cancelled' && status !== 'todo' && status !== 'cancelled')
			return null;
		if (
			rule &&
			status === 'done' &&
			(current.status === 'cancelled' || current.scheduledDate !== expectedDate)
		)
			return null;
		if (rule && status === 'done' && current.status !== 'cancelled') {
			const today = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate().toString();
			const nextDate = getNextRecurrenceDate({
				rule,
				anchorDate: current.recurrenceAnchorDate ?? current.scheduledDate!,
				currentScheduledDate: current.scheduledDate!,
				completionDate: today
			});
			const [task] = await tx
				.update(tasks)
				.set({
					status: 'todo',
					scheduledDate: nextDate,
					completedAt: null,
					cancelledAt: null,
					updatedAt: now
				})
				.where(eq(tasks.id, id))
				.returning();
			return {
				task,
				previousStatus: current.status,
				previousScheduledDate: current.scheduledDate,
				nextScheduledDate: nextDate,
				expectedStatus: 'todo' as const
			};
		}
		if (rule && status === 'todo' && current.status === 'cancelled') {
			const today = Temporal.Now.zonedDateTimeISO(timezone).toPlainDate().toString();
			const nextDate = getFirstRecurrenceDateAfter(
				rule,
				current.recurrenceAnchorDate ?? current.scheduledDate!,
				today
			);
			const [task] = await tx
				.update(tasks)
				.set({
					status: 'todo',
					scheduledDate: nextDate,
					completedAt: null,
					cancelledAt: null,
					updatedAt: now
				})
				.where(eq(tasks.id, id))
				.returning();
			return {
				task,
				previousStatus: current.status,
				previousScheduledDate: current.scheduledDate,
				nextScheduledDate: nextDate,
				expectedStatus: 'todo' as const
			};
		}
		if (rule && status === 'cancelled' && current.status !== 'cancelled') {
			const [task] = await tx
				.update(tasks)
				.set({ status: 'cancelled', completedAt: null, cancelledAt: now, updatedAt: now })
				.where(eq(tasks.id, id))
				.returning();
			return {
				task,
				previousStatus: current.status,
				previousScheduledDate: current.scheduledDate,
				nextScheduledDate: current.scheduledDate,
				expectedStatus: 'cancelled' as const
			};
		}
		const [task] = await tx
			.update(tasks)
			.set({ status, ...taskStatusDates(status, now), updatedAt: now })
			.where(eq(tasks.id, id))
			.returning();
		return { task, previousStatus: current.status };
	});
}

export async function undoRecurringTransition({
	id,
	previousDate,
	expectedDate,
	previousStatus,
	expectedStatus
}: {
	id: string;
	previousDate: string;
	expectedDate: string;
	previousStatus: 'todo' | 'in_progress' | 'cancelled';
	expectedStatus: 'todo' | 'cancelled';
}) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
			.for('update');
		if (
			!current ||
			!current.recurrenceRule ||
			current.status !== expectedStatus ||
			current.scheduledDate !== expectedDate
		)
			return null;
		const [task] = await tx
			.update(tasks)
			.set({
				status: previousStatus,
				scheduledDate: previousDate,
				...taskStatusDates(previousStatus, new Date()),
				updatedAt: new Date()
			})
			.where(eq(tasks.id, id))
			.returning();
		return task;
	});
}
