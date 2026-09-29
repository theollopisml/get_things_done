import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('global search with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('searches all three types, ranks titles, bounds groups, and excludes deleted records', async () => {
		const { db } = await import('$lib/server/db');
		const { tasks, projects, checkpoints } = await import('$lib/server/db/schema');
		const { searchGlobal } = await import('./search');
		const { inArray } = await import('drizzle-orm');
		const prefix = `Search${crypto.randomUUID().slice(0, 8)}`;
		const createdProjects = await db
			.insert(projects)
			.values([
				{ title: `${prefix} project`, description: 'Description du chantier', status: 'done' },
				{ title: 'Parent de recherche', description: prefix },
				{ title: `${prefix} deleted project`, deletedAt: new Date() }
			])
			.returning({ id: projects.id });
		const createdTasks = await db
			.insert(tasks)
			.values([
				{ title: 'Description only', description: prefix, projectId: createdProjects[0].id },
				...Array.from({ length: 6 }, (_, index) => ({
					title: `${prefix} title ${index}`,
					status: 'done' as const,
					projectId: createdProjects[0].id
				})),
				{ title: `${prefix} deleted task`, deletedAt: new Date() }
			])
			.returning({ id: tasks.id });
		const createdCheckpoints = await db
			.insert(checkpoints)
			.values([
				{ title: `${prefix} checkpoint`, projectId: createdProjects[0].id, position: 0 },
				{
					title: 'Checkpoint description',
					description: prefix,
					projectId: createdProjects[0].id,
					position: 1
				},
				{ title: `${prefix} hidden checkpoint`, projectId: createdProjects[2].id, position: 0 }
			])
			.returning({ id: checkpoints.id });
		try {
			const results = await searchGlobal(prefix);
			expect(results.tasks).toHaveLength(5);
			expect(results.tasks.every((item) => item.title.includes(prefix))).toBe(true);
			expect(results.tasks.every((item) => item.status === 'done')).toBe(true);
			expect(results.projects.map((item) => item.id)).toContain(createdProjects[0].id);
			expect(results.projects.map((item) => item.id)).not.toContain(createdProjects[2].id);
			expect(results.checkpoints.map((item) => item.id)).toEqual([
				createdCheckpoints[0].id,
				createdCheckpoints[1].id
			]);
			expect(results.checkpoints[0].projectTitle).toBe(`${prefix} project`);
		} finally {
			await db.delete(tasks).where(
				inArray(
					tasks.id,
					createdTasks.map((item) => item.id)
				)
			);
			await db.delete(checkpoints).where(
				inArray(
					checkpoints.id,
					createdCheckpoints.map((item) => item.id)
				)
			);
			await db.delete(projects).where(
				inArray(
					projects.id,
					createdProjects.map((item) => item.id)
				)
			);
		}
	});

	it('treats ILIKE wildcards as literal characters', async () => {
		const { db } = await import('$lib/server/db');
		const { projects } = await import('$lib/server/db/schema');
		const { searchGlobal } = await import('./search');
		const { eq } = await import('drizzle-orm');
		const token = `literal${crypto.randomUUID().slice(0, 8)}`;
		const [project] = await db
			.insert(projects)
			.values({ title: `${token}%_!` })
			.returning();
		try {
			expect((await searchGlobal(`${token}%_!`)).projects.map((item) => item.id)).toContain(
				project.id
			);
			expect((await searchGlobal(`${token}%x`)).projects.map((item) => item.id)).not.toContain(
				project.id
			);
		} finally {
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});
});
