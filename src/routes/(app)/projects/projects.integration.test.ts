import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Project routes', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('creates a Project, shows TO_BUILD, adds a Task and keeps it after closure', async () => {
		const { db } = await import('$lib/server/db');
		const { projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const list = await import('./+page.server');
		const detail = await import('./[id]/+page.server');
		const createForm = new FormData();
		createForm.set('title', 'Projet de test');
		const created = await list.actions.create({
			request: new Request('http://localhost/projects?/create', {
				method: 'POST',
				body: createForm
			})
		} as Parameters<typeof list.actions.create>[0]);
		if (!('id' in created)) throw new Error('Project creation failed');
		const id = created.id;
		try {
			const initial = (await detail.load({ params: { id } } as Parameters<
				typeof detail.load
			>[0])) as {
				project: { toBuild: boolean; taskCount: number; status: string };
			};
			expect(initial.project.toBuild).toBe(true);
			const saveForm = new FormData();
			for (const [name, value] of Object.entries({
				title: 'Projet renommé',
				description: 'Contexte',
				startDate: '2026-10-01',
				dueDate: '2026-10-30'
			}))
				saveForm.set(name, value);
			expect(
				await detail.actions.save({
					params: { id },
					request: new Request(`http://localhost/projects/${id}?/save`, {
						method: 'POST',
						body: saveForm
					})
				} as Parameters<typeof detail.actions.save>[0])
			).toEqual({ saved: true });
			const taskForm = new FormData();
			taskForm.set('title', 'Première Task');
			const task = await detail.actions.createTask({
				params: { id },
				request: new Request(`http://localhost/projects/${id}?/createTask`, {
					method: 'POST',
					body: taskForm
				})
			} as Parameters<typeof detail.actions.createTask>[0]);
			if (!('id' in task)) throw new Error('Task creation failed');
			let current = (await detail.load({ params: { id } } as Parameters<
				typeof detail.load
			>[0])) as {
				project: { toBuild: boolean; taskCount: number; tasks: { id: string }[] };
			};
			expect(current.project.toBuild).toBe(false);
			expect(current.project.taskCount).toBe(1);
			expect(current.project.tasks[0].id).toBe(task.id);
			const statusForm = new FormData();
			statusForm.set('status', 'done');
			expect(
				await detail.actions.status({
					params: { id },
					request: new Request(`http://localhost/projects/${id}?/status`, {
						method: 'POST',
						body: statusForm
					})
				} as Parameters<typeof detail.actions.status>[0])
			).toMatchObject({ saved: true });
			current = (await detail.load({ params: { id } } as Parameters<
				typeof detail.load
			>[0])) as typeof current;
			expect(current.project.tasks).toHaveLength(1);
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].status).toBe('todo');
		} finally {
			await db.delete(tasks).where(eq(tasks.projectId, id));
			await db.delete(projects).where(eq(projects.id, id));
		}
	});

	it('removes TO_BUILD for a Checkpoint and restores it after soft deletion', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, projects } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { getProjectDetail, listProjects } = await import('$lib/server/repositories/projects');
		const [project] = await db.insert(projects).values({ title: 'Projet avec jalon' }).returning();
		const [checkpoint] = await db
			.insert(checkpoints)
			.values({ title: 'Premier jalon', projectId: project.id, position: 0 })
			.returning();
		try {
			expect((await getProjectDetail(project.id))?.toBuild).toBe(false);
			expect((await listProjects()).find((item) => item.id === project.id)?.toBuild).toBe(false);
			await db
				.update(checkpoints)
				.set({ deletedAt: new Date() })
				.where(eq(checkpoints.id, checkpoint.id));
			expect((await getProjectDetail(project.id))?.toBuild).toBe(true);
		} finally {
			await db.delete(checkpoints).where(eq(checkpoints.id, checkpoint.id));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});
});
