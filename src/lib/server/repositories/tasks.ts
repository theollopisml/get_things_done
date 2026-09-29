import { and, asc, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, tasks } from '$lib/server/db/schema';
import { taskStatusDates, type TaskStatus } from '$lib/domain/tasks';

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
	}
) {
	const [task] = await db
		.update(tasks)
		.set({ ...values, updatedAt: new Date() })
		.where(and(eq(tasks.id, id), isNull(tasks.deletedAt), isNull(tasks.recurrenceRule)))
		.returning();
	return task ?? null;
}

export async function setTaskStatus(id: string, status: TaskStatus) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: tasks.status })
			.from(tasks)
			.where(and(eq(tasks.id, id), isNull(tasks.deletedAt), isNull(tasks.recurrenceRule)))
			.for('update');
		if (!current) return null;
		const now = new Date();
		const [task] = await tx
			.update(tasks)
			.set({ status, ...taskStatusDates(status, now), updatedAt: now })
			.where(eq(tasks.id, id))
			.returning();
		return { task, previousStatus: current.status };
	});
}
