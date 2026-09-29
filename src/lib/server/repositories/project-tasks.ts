import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects, tasks } from '$lib/server/db/schema';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createProjectTask(
	projectId: string,
	title: string,
	dueDate: string | null = null
) {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.for('share');
		if (!project) return null;
		const existing = await orderedTasks(tx, projectId);
		const [task] = await tx
			.insert(tasks)
			.values({ projectId, title, dueDate, position: existing.length })
			.returning();
		return task;
	});
}

async function orderedTasks(tx: Transaction, projectId: string) {
	return tx
		.select({ id: tasks.id })
		.from(tasks)
		.where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)))
		.orderBy(sql`${tasks.position} NULLS LAST`, asc(tasks.createdAt), asc(tasks.id))
		.for('update');
}

async function numberTasks(tx: Transaction, ids: string[]) {
	const now = new Date();
	for (const [position, id] of ids.entries()) {
		await tx.update(tasks).set({ position, updatedAt: now }).where(eq(tasks.id, id));
	}
}

export async function moveProjectTask(taskId: string, projectId: string | null, position?: number) {
	return db.transaction(async (tx) => {
		const [task] = await tx
			.select()
			.from(tasks)
			.where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
			.for('update');
		if (!task) return { outcome: 'not_found' as const };
		if (task.projectId === projectId) return { outcome: 'unchanged' as const };
		if (projectId) {
			const [project] = await tx
				.select({ id: projects.id })
				.from(projects)
				.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
				.for('share');
			if (!project) return { outcome: 'invalid_project' as const };
		}
		const previousProjectId = task.projectId;
		const previousPosition = task.position;
		await tx
			.update(tasks)
			.set({
				projectId,
				checkpointId: task.checkpointId && projectId !== task.projectId ? null : task.checkpointId,
				position: null,
				updatedAt: new Date()
			})
			.where(eq(tasks.id, taskId));
		if (previousProjectId) {
			await numberTasks(
				tx,
				(await orderedTasks(tx, previousProjectId)).map((item) => item.id)
			);
		}
		if (projectId) {
			const ids = (await orderedTasks(tx, projectId))
				.map((item) => item.id)
				.filter((id) => id !== taskId);
			ids.splice(Math.min(position ?? ids.length, ids.length), 0, taskId);
			await numberTasks(tx, ids);
		}
		return { outcome: 'moved' as const, previousProjectId, previousPosition };
	});
}

export async function reorderProjectTasks(projectId: string, ids: string[]) {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.for('update');
		if (!project) return 'not_found' as const;
		const current = await orderedTasks(tx, projectId);
		if (
			current.length !== ids.length ||
			new Set(ids).size !== ids.length ||
			ids.some((id) => !current.some((item) => item.id === id))
		)
			return 'stale_order' as const;
		await numberTasks(tx, ids);
		return 'reordered' as const;
	});
}
