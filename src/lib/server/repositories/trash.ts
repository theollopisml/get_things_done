import { and, asc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { checkpoints, entries, projects, tasks } from '$lib/server/db/schema';

export type TrashKind = 'task' | 'project' | 'checkpoint';
export const TRASH_RETENTION_DAYS = 30;
const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function availableAfter(deletedAt: Date) {
	return deletedAt.getTime() + retentionMs > Date.now();
}

export async function listTrash() {
	const [removedTasks, removedProjects, removedCheckpoints] = await Promise.all([
		db
			.select({ id: tasks.id, title: tasks.title, deletedAt: tasks.deletedAt })
			.from(tasks)
			.where(isNotNull(tasks.deletedAt)),
		db
			.select({ id: projects.id, title: projects.title, deletedAt: projects.deletedAt })
			.from(projects)
			.where(isNotNull(projects.deletedAt)),
		db
			.select({ id: checkpoints.id, title: checkpoints.title, deletedAt: checkpoints.deletedAt })
			.from(checkpoints)
			.where(isNotNull(checkpoints.deletedAt))
	]);
	return [
		...removedTasks.map((item) => ({ ...item, kind: 'task' as const })),
		...removedProjects.map((item) => ({ ...item, kind: 'project' as const })),
		...removedCheckpoints.map((item) => ({ ...item, kind: 'checkpoint' as const }))
	]
		.filter(
			(item): item is typeof item & { deletedAt: Date } =>
				Boolean(item.deletedAt) && availableAfter(item.deletedAt!)
		)
		.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}

export async function deleteTrashItem(kind: TrashKind, id: string) {
	return db.transaction(async (tx) => {
		const now = new Date();
		if (kind === 'task') {
			const [item] = await tx
				.update(tasks)
				.set({ deletedAt: now, updatedAt: now })
				.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
				.returning({ id: tasks.id });
			return Boolean(item);
		}
		if (kind === 'checkpoint') {
			const [item] = await tx
				.update(checkpoints)
				.set({ deletedAt: now, updatedAt: now })
				.where(and(eq(checkpoints.id, id), isNull(checkpoints.deletedAt)))
				.returning({ id: checkpoints.id });
			if (!item) return false;
			await tx
				.update(tasks)
				.set({ checkpointId: null, updatedAt: now })
				.where(eq(tasks.checkpointId, id));
			return true;
		}
		const [item] = await tx
			.update(projects)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(projects.id, id), isNull(projects.deletedAt)))
			.returning({ id: projects.id });
		if (!item) return false;
		await tx
			.update(tasks)
			.set({ projectId: null, checkpointId: null, position: null, updatedAt: now })
			.where(eq(tasks.projectId, id));
		await tx
			.update(checkpoints)
			.set({ deletedAt: now, updatedAt: now })
			.where(and(eq(checkpoints.projectId, id), isNull(checkpoints.deletedAt)));
		return true;
	});
}

export async function restoreTrashItem(kind: TrashKind, id: string) {
	return db.transaction(async (tx) => {
		const now = new Date();
		if (kind === 'task') {
			const [item] = await tx.select().from(tasks).where(eq(tasks.id, id)).for('update');
			if (!item?.deletedAt || !availableAfter(item.deletedAt)) return 'unavailable' as const;
			// A parent may have been removed after this Task was deleted.
			const [project] = item.projectId
				? await tx
						.select()
						.from(projects)
						.where(and(eq(projects.id, item.projectId), isNull(projects.deletedAt)))
				: [];
			const [checkpoint] = item.checkpointId
				? await tx
						.select()
						.from(checkpoints)
						.where(and(eq(checkpoints.id, item.checkpointId), isNull(checkpoints.deletedAt)))
				: [];
			await tx
				.update(tasks)
				.set({
					deletedAt: null,
					projectId: project ? item.projectId : null,
					checkpointId: project && checkpoint ? item.checkpointId : null,
					position: project ? item.position : null,
					updatedAt: now
				})
				.where(eq(tasks.id, id));
			return 'restored' as const;
		}
		if (kind === 'project') {
			const [item] = await tx.select().from(projects).where(eq(projects.id, id)).for('update');
			if (!item?.deletedAt || !availableAfter(item.deletedAt)) return 'unavailable' as const;
			await tx.update(projects).set({ deletedAt: null, updatedAt: now }).where(eq(projects.id, id));
			return 'restored' as const;
		}
		const [item] = await tx.select().from(checkpoints).where(eq(checkpoints.id, id)).for('update');
		if (!item?.deletedAt || !availableAfter(item.deletedAt)) return 'unavailable' as const;
		const [project] = await tx
			.select()
			.from(projects)
			.where(and(eq(projects.id, item.projectId), isNull(projects.deletedAt)));
		if (!project) return 'parent_deleted' as const;
		await tx
			.update(checkpoints)
			.set({ deletedAt: null, updatedAt: now })
			.where(eq(checkpoints.id, id));
		return 'restored' as const;
	});
}

export async function purgeTrashItem(kind: TrashKind, id: string, expiredOnly = false) {
	return db.transaction(async (tx) => {
		const now = new Date();
		if (kind === 'task') {
			const [item] = await tx
				.select({ deletedAt: tasks.deletedAt })
				.from(tasks)
				.where(eq(tasks.id, id))
				.for('update');
			if (!item?.deletedAt || (expiredOnly && availableAfter(item.deletedAt))) return false;
			await tx.delete(entries).where(eq(entries.taskId, id));
			await tx.delete(tasks).where(eq(tasks.id, id));
			return true;
		}
		if (kind === 'checkpoint') {
			const [item] = await tx
				.select({ deletedAt: checkpoints.deletedAt })
				.from(checkpoints)
				.where(eq(checkpoints.id, id))
				.for('update');
			if (!item?.deletedAt || (expiredOnly && availableAfter(item.deletedAt))) return false;
			await tx
				.update(tasks)
				.set({ checkpointId: null, updatedAt: now })
				.where(eq(tasks.checkpointId, id));
			await tx.delete(checkpoints).where(eq(checkpoints.id, id));
			return true;
		}
		const [item] = await tx
			.select({ deletedAt: projects.deletedAt })
			.from(projects)
			.where(eq(projects.id, id))
			.for('update');
		if (!item?.deletedAt || (expiredOnly && availableAfter(item.deletedAt))) return false;
		await tx.delete(entries).where(eq(entries.projectId, id));
		await tx
			.update(tasks)
			.set({ projectId: null, checkpointId: null, position: null, updatedAt: now })
			.where(eq(tasks.projectId, id));
		const children = await tx
			.select({ id: checkpoints.id })
			.from(checkpoints)
			.where(eq(checkpoints.projectId, id));
		for (const child of children) {
			await tx
				.update(tasks)
				.set({ checkpointId: null, updatedAt: now })
				.where(eq(tasks.checkpointId, child.id));
		}
		await tx.delete(checkpoints).where(eq(checkpoints.projectId, id));
		await tx.delete(projects).where(eq(projects.id, id));
		return true;
	});
}

export async function expireTrash() {
	const cutoff = new Date(Date.now() - retentionMs);
	const [oldTasks, oldCheckpoints, oldProjects] = await Promise.all([
		db
			.select({ id: tasks.id })
			.from(tasks)
			.where(and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, cutoff)))
			.orderBy(asc(tasks.deletedAt)),
		db
			.select({ id: checkpoints.id })
			.from(checkpoints)
			.where(and(isNotNull(checkpoints.deletedAt), lt(checkpoints.deletedAt, cutoff)))
			.orderBy(asc(checkpoints.deletedAt)),
		db
			.select({ id: projects.id })
			.from(projects)
			.where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoff)))
			.orderBy(asc(projects.deletedAt))
	]);
	for (const item of oldTasks) await purgeTrashItem('task', item.id, true);
	for (const item of oldCheckpoints) await purgeTrashItem('checkpoint', item.id, true);
	for (const item of oldProjects) await purgeTrashItem('project', item.id, true);
	await db
		.delete(entries)
		.where(
			and(
				isNotNull(entries.deletedAt),
				lt(entries.deletedAt, cutoff),
				isNull(entries.taskId),
				isNull(entries.projectId)
			)
		);
}
