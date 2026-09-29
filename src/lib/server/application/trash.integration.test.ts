import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Trash with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('detaches relationships on deletion and restores objects without silently rebuilding them', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { deleteObject, restoreObject, purgeObject, InvalidTrashAction } =
			await import('./trash');
		const { listTrash } = await import('$lib/server/repositories/trash');
		const [project] = await db.insert(projects).values({ title: 'Trash project' }).returning();
		const [checkpoint] = await db
			.insert(checkpoints)
			.values({ projectId: project.id, title: 'Jalon', position: 0 })
			.returning();
		const [task] = await db
			.insert(tasks)
			.values({ projectId: project.id, checkpointId: checkpoint.id, position: 0, title: 'Action' })
			.returning();
		try {
			expect(await deleteObject('checkpoint', checkpoint.id)).toBe(true);
			expect(
				(await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].checkpointId
			).toBeNull();
			expect(await restoreObject('checkpoint', checkpoint.id)).toBe('restored');
			expect(
				(await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].checkpointId
			).toBeNull();
			expect(await deleteObject('project', project.id)).toBe(true);
			expect(await deleteObject('project', project.id)).toBe(false);
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0]).toMatchObject({
				projectId: null,
				checkpointId: null,
				position: null
			});
			expect(
				(await db.select().from(checkpoints).where(eq(checkpoints.id, checkpoint.id)))[0].deletedAt
			).toBeInstanceOf(Date);
			expect(await restoreObject('checkpoint', checkpoint.id)).toBe('parent_deleted');
			expect((await listTrash()).map((item) => item.id)).toContain(project.id);
			expect(await restoreObject('project', project.id)).toBe('restored');
			expect(await restoreObject('checkpoint', checkpoint.id)).toBe('restored');
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].projectId).toBeNull();
			await expect(purgeObject('checkpoint', checkpoint.id, 'PURGER')).resolves.toBe(false);
			await expect(purgeObject('checkpoint', checkpoint.id, '')).rejects.toBeInstanceOf(
				InvalidTrashAction
			);
			expect(await deleteObject('project', project.id)).toBe(true);
			expect(await purgeObject('project', project.id, 'PURGER')).toBe(true);
			expect(
				await db.select().from(checkpoints).where(eq(checkpoints.id, checkpoint.id))
			).toHaveLength(0);
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].projectId).toBeNull();
		} finally {
			await db.delete(tasks).where(eq(tasks.id, task.id));
			await db.delete(checkpoints).where(eq(checkpoints.id, checkpoint.id));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});

	it('purges linked Entries and expires objects after thirty days', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { deleteObject, purgeObject, restoreObject } = await import('./trash');
		const { expireTrash, listTrash } = await import('$lib/server/repositories/trash');
		const [task] = await db.insert(tasks).values({ title: 'Captured task' }).returning();
		const [entry] = await db
			.insert(entries)
			.values({
				rawContent: 'Captured task',
				classificationState: 'classified',
				classificationSource: 'manual',
				classifiedAt: new Date(),
				taskId: task.id
			})
			.returning();
		try {
			expect(await deleteObject('task', task.id)).toBe(true);
			expect(await restoreObject('task', task.id)).toBe('restored');
			expect(await deleteObject('task', task.id)).toBe(true);
			expect(await purgeObject('task', task.id, 'PURGER')).toBe(true);
			expect(await db.select().from(entries).where(eq(entries.id, entry.id))).toHaveLength(0);
			const [expired] = await db
				.insert(tasks)
				.values({ title: 'Expired task', deletedAt: new Date(Date.now() - 31 * 86400000) })
				.returning();
			try {
				expect((await listTrash()).some((item) => item.id === expired.id)).toBe(false);
				expect(await restoreObject('task', expired.id)).toBe('unavailable');
				await expireTrash();
				expect(await db.select().from(tasks).where(eq(tasks.id, expired.id))).toHaveLength(0);
			} finally {
				await db.delete(tasks).where(eq(tasks.id, expired.id));
			}
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			await db.delete(tasks).where(eq(tasks.id, task.id));
		}
	});
});
