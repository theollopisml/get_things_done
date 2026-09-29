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
			taskForm.set('dueDate', '2026-10-15');
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
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].dueDate).toBe(
				'2026-10-15'
			);
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

	it('manages Checkpoints and Task links through the Project detail actions', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const detail = await import('./[id]/+page.server');
		const [project] = await db.insert(projects).values({ title: 'Projet avec jalons' }).returning();
		const [task] = await db
			.insert(tasks)
			.values({ title: 'Action', projectId: project.id })
			.returning();
		const createdIds: string[] = [];
		try {
			for (const title of ['Premier', 'Second']) {
				const form = new FormData();
				form.set('title', title);
				const result = await detail.actions.createCheckpoint({
					params: { id: project.id },
					request: new Request(`http://localhost/projects/${project.id}?/createCheckpoint`, {
						method: 'POST',
						body: form
					})
				} as Parameters<typeof detail.actions.createCheckpoint>[0]);
				if (!('id' in result)) throw new Error('Checkpoint creation failed');
				createdIds.push(result.id);
			}
			const [firstId, secondId] = createdIds;
			const edit = new FormData();
			for (const [name, value] of Object.entries({
				id: firstId,
				title: 'Premier modifié',
				description: 'Livrable',
				targetDate: '2026-10-10'
			}))
				edit.set(name, value);
			expect(
				await detail.actions.saveCheckpoint({
					params: { id: project.id },
					request: new Request(`http://localhost/projects/${project.id}?/saveCheckpoint`, {
						method: 'POST',
						body: edit
					})
				} as Parameters<typeof detail.actions.saveCheckpoint>[0])
			).toEqual({ saved: true });
			const status = new FormData();
			status.set('id', firstId);
			status.set('status', 'done');
			expect(
				await detail.actions.checkpointStatus({
					params: { id: project.id },
					request: new Request(`http://localhost/projects/${project.id}?/checkpointStatus`, {
						method: 'POST',
						body: status
					})
				} as Parameters<typeof detail.actions.checkpointStatus>[0])
			).toEqual({ saved: true });
			const order = new FormData();
			order.append('checkpointId', secondId);
			order.append('checkpointId', firstId);
			expect(
				await detail.actions.reorderCheckpoints({
					params: { id: project.id },
					request: new Request(`http://localhost/projects/${project.id}?/reorderCheckpoints`, {
						method: 'POST',
						body: order
					})
				} as Parameters<typeof detail.actions.reorderCheckpoints>[0])
			).toEqual({ saved: true });
			const link = new FormData();
			link.set('taskId', task.id);
			link.set('checkpointId', firstId);
			expect(
				await detail.actions.linkCheckpoint({
					params: { id: project.id },
					request: new Request(`http://localhost/projects/${project.id}?/linkCheckpoint`, {
						method: 'POST',
						body: link
					})
				} as Parameters<typeof detail.actions.linkCheckpoint>[0])
			).toEqual({ saved: true });
			const loaded = (await detail.load({ params: { id: project.id } } as Parameters<
				typeof detail.load
			>[0])) as {
				project: {
					checkpoints: { id: string; title: string; status: string }[];
					tasks: { checkpointId: string | null }[];
				};
			};
			expect(loaded.project.checkpoints.map((checkpoint) => checkpoint.id)).toEqual([
				secondId,
				firstId
			]);
			expect(loaded.project.checkpoints[1]).toMatchObject({
				title: 'Premier modifié',
				status: 'done'
			});
			expect(loaded.project.tasks[0].checkpointId).toBe(firstId);
		} finally {
			await db.delete(tasks).where(eq(tasks.id, task.id));
			for (const id of createdIds) await db.delete(checkpoints).where(eq(checkpoints.id, id));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});
});
