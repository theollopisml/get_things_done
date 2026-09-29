import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { checkpointStatusChange, type CheckpointStatus } from '$lib/domain/checkpoints';
import { db } from '$lib/server/db';
import { checkpoints, projects, tasks } from '$lib/server/db/schema';

export async function createCheckpoint(projectId: string, title: string) {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.for('update');
		if (!project) return null;
		const [last] = await tx
			.select({ position: sql<number>`coalesce(max(${checkpoints.position}), -1)::int` })
			.from(checkpoints)
			.where(and(eq(checkpoints.projectId, projectId), isNull(checkpoints.deletedAt)));
		const [checkpoint] = await tx
			.insert(checkpoints)
			.values({ projectId, title, position: last.position + 1 })
			.returning();
		return checkpoint;
	});
}

export async function saveCheckpoint(
	id: string,
	projectId: string,
	values: { title: string; description: string | null; targetDate: string | null }
) {
	const [checkpoint] = await db
		.update(checkpoints)
		.set({ ...values, updatedAt: new Date() })
		.where(
			and(
				eq(checkpoints.id, id),
				eq(checkpoints.projectId, projectId),
				isNull(checkpoints.deletedAt)
			)
		)
		.returning();
	return checkpoint ?? null;
}

export async function setCheckpointStatus(id: string, projectId: string, status: CheckpointStatus) {
	return db.transaction(async (tx) => {
		const [current] = await tx
			.select({ status: checkpoints.status })
			.from(checkpoints)
			.where(
				and(
					eq(checkpoints.id, id),
					eq(checkpoints.projectId, projectId),
					isNull(checkpoints.deletedAt)
				)
			)
			.for('update');
		if (!current) return { outcome: 'not_found' as const };
		const now = new Date();
		const change = checkpointStatusChange(current.status, status, now);
		if (!change) return { outcome: 'invalid_transition' as const };
		const [checkpoint] = await tx
			.update(checkpoints)
			.set({ ...change, updatedAt: now })
			.where(eq(checkpoints.id, id))
			.returning();
		return { outcome: 'updated' as const, checkpoint };
	});
}

export async function reorderCheckpoints(projectId: string, ids: string[]) {
	return db.transaction(async (tx) => {
		const [project] = await tx
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
			.for('update');
		if (!project) return 'not_found' as const;
		const current = await tx
			.select({ id: checkpoints.id })
			.from(checkpoints)
			.where(and(eq(checkpoints.projectId, projectId), isNull(checkpoints.deletedAt)))
			.orderBy(asc(checkpoints.position), asc(checkpoints.id))
			.for('update');
		if (
			current.length !== ids.length ||
			new Set(ids).size !== ids.length ||
			ids.some((id) => !current.some((item) => item.id === id))
		)
			return 'stale_order' as const;
		const now = new Date();
		for (const [position, id] of ids.entries()) {
			await tx.update(checkpoints).set({ position, updatedAt: now }).where(eq(checkpoints.id, id));
		}
		return 'reordered' as const;
	});
}

export async function setTaskCheckpoint(
	taskId: string,
	projectId: string,
	checkpointId: string | null
) {
	return db.transaction(async (tx) => {
		const [task] = await tx
			.select({ id: tasks.id, projectId: tasks.projectId })
			.from(tasks)
			.where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
			.for('update');
		if (!task || task.projectId !== projectId) return 'task_unavailable' as const;
		if (checkpointId) {
			const [checkpoint] = await tx
				.select({ id: checkpoints.id })
				.from(checkpoints)
				.where(
					and(
						eq(checkpoints.id, checkpointId),
						eq(checkpoints.projectId, projectId),
						isNull(checkpoints.deletedAt)
					)
				)
				.for('share');
			if (!checkpoint) return 'checkpoint_unavailable' as const;
		}
		await tx.update(tasks).set({ checkpointId, updatedAt: new Date() }).where(eq(tasks.id, taskId));
		return 'updated' as const;
	});
}
