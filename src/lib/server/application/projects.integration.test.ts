import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Projects with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('creates, edits, completes and reopens a Project without changing its Tasks', async () => {
		const { db } = await import('$lib/server/db');
		const { projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { addProject, editProject, changeProjectStatus, InvalidProject } =
			await import('./projects');
		const project = await addProject('  Publier le portfolio  ');
		try {
			expect(project).toMatchObject({ title: 'Publier le portfolio', status: 'planned' });
			expect(project.startedAt).toBeNull();
			expect(project.completedAt).toBeNull();
			await expect(
				editProject(project.id, {
					title: 'Publier le portfolio',
					description: '',
					startDate: 'demain',
					dueDate: ''
				})
			).rejects.toBeInstanceOf(InvalidProject);
			const edited = await editProject(project.id, {
				title: 'Portfolio public',
				description: 'Vérifier la page d’accueil.',
				startDate: '2026-10-01',
				dueDate: '2026-10-31'
			});
			expect(edited).toMatchObject({
				title: 'Portfolio public',
				description: 'Vérifier la page d’accueil.',
				startDate: '2026-10-01',
				dueDate: '2026-10-31'
			});
			await expect(changeProjectStatus(project.id, 'paused')).rejects.toBeInstanceOf(
				InvalidProject
			);
			const active = await changeProjectStatus(project.id, 'active');
			expect(active?.project.startedAt).toBeInstanceOf(Date);
			const firstActivation = active?.project.startedAt;
			await changeProjectStatus(project.id, 'paused');
			const [task] = await db
				.insert(tasks)
				.values({ title: 'Tester les liens', projectId: project.id })
				.returning();
			try {
				const done = await changeProjectStatus(project.id, 'done');
				expect(done?.project.completedAt).toBeInstanceOf(Date);
				const [unchanged] = await db.select().from(tasks).where(eq(tasks.id, task.id));
				expect(unchanged.status).toBe('todo');
				const reopened = await changeProjectStatus(project.id, 'active');
				expect(reopened?.project.startedAt).toEqual(firstActivation);
				expect(reopened?.project.completedAt).toBeNull();
				await changeProjectStatus(project.id, 'cancelled');
				await expect(changeProjectStatus(project.id, 'active')).rejects.toBeInstanceOf(
					InvalidProject
				);
			} finally {
				await db.delete(tasks).where(eq(tasks.id, task.id));
			}
		} finally {
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});
});
