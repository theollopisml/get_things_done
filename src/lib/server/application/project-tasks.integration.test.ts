import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Project Task relations', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('moves, detaches, restores and reorders Tasks within Projects', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { moveTaskToProject, setProjectTaskOrder, InvalidProjectTask } =
			await import('./project-tasks');
		const [source, target] = await db
			.insert(projects)
			.values([{ title: 'Source' }, { title: 'Cible' }])
			.returning();
		const [first, second] = await db
			.insert(tasks)
			.values([
				{ title: 'Première', projectId: source.id, position: 0 },
				{ title: 'Deuxième', projectId: source.id, position: 1 }
			])
			.returning();
		const [checkpoint] = await db
			.insert(checkpoints)
			.values({ title: 'Jalon', projectId: source.id, position: 0 })
			.returning();
		try {
			await db.update(tasks).set({ checkpointId: checkpoint.id }).where(eq(tasks.id, second.id));
			await setProjectTaskOrder(source.id, [second.id, first.id]);
			let rows = await db.select().from(tasks).where(eq(tasks.projectId, source.id));
			expect(rows.sort((a, b) => a.position! - b.position!).map((task) => task.id)).toEqual([
				second.id,
				first.id
			]);
			await expect(setProjectTaskOrder(source.id, [first.id, first.id])).rejects.toBeInstanceOf(
				InvalidProjectTask
			);
			const moved = await moveTaskToProject(second.id, target.id);
			expect(moved).toMatchObject({ previousProjectId: source.id, previousPosition: 0 });
			expect(
				(await db.select().from(tasks).where(eq(tasks.id, second.id)))[0].checkpointId
			).toBeNull();
			rows = await db.select().from(tasks).where(eq(tasks.projectId, source.id));
			expect(rows).toMatchObject([{ id: first.id, position: 0 }]);
			await moveTaskToProject(second.id, source.id, moved?.previousPosition ?? undefined);
			rows = await db.select().from(tasks).where(eq(tasks.projectId, source.id));
			expect(rows.sort((a, b) => a.position! - b.position!).map((task) => task.id)).toEqual([
				second.id,
				first.id
			]);
			await moveTaskToProject(second.id, '');
			const [detached] = await db.select().from(tasks).where(eq(tasks.id, second.id));
			expect(detached).toMatchObject({ projectId: null, position: null });
		} finally {
			await db.delete(tasks).where(eq(tasks.id, first.id));
			await db.delete(tasks).where(eq(tasks.id, second.id));
			await db.delete(checkpoints).where(eq(checkpoints.id, checkpoint.id));
			await db.delete(projects).where(eq(projects.id, source.id));
			await db.delete(projects).where(eq(projects.id, target.id));
		}
	});
});
