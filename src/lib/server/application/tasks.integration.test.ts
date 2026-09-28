import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('one-off Tasks with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('creates, plans, completes, reopens, cancels, and lists a Task', async () => {
		const { db } = await import('$lib/server/db');
		const { tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { addTask, changeTaskStatus, editTask, InvalidTask } = await import('./tasks');
		const { listTasks } = await import('$lib/server/repositories/tasks');
		const created = await addTask('  Préparer le dossier  ');
		try {
			expect(created).toMatchObject({ title: 'Préparer le dossier', status: 'todo' });
			await expect(
				editTask(created.id, {
					title: 'Préparer le dossier',
					description: '',
					scheduledDate: '',
					scheduledTime: '14:30',
					dueDate: '',
					dueTime: ''
				})
			).rejects.toBeInstanceOf(InvalidTask);
			const saved = await editTask(created.id, {
				title: 'Préparer le dossier',
				description: 'Contexte',
				scheduledDate: '2026-10-01',
				scheduledTime: '14:30',
				dueDate: '2026-10-03',
				dueTime: '17:00'
			});
			expect(saved).toMatchObject({
				scheduledDate: '2026-10-01',
				dueDate: '2026-10-03',
				description: 'Contexte'
			});
			expect((await listTasks(false)).some((task) => task.id === created.id)).toBe(true);
			expect((await changeTaskStatus(created.id, 'done'))?.previousStatus).toBe('todo');
			let [current] = await db.select().from(tasks).where(eq(tasks.id, created.id));
			expect(current.completedAt).toBeInstanceOf(Date);
			expect(current.cancelledAt).toBeNull();
			expect((await listTasks(true)).some((task) => task.id === created.id)).toBe(true);
			await changeTaskStatus(created.id, 'todo');
			[current] = await db.select().from(tasks).where(eq(tasks.id, created.id));
			expect(current.completedAt).toBeNull();
			await changeTaskStatus(created.id, 'cancelled');
			[current] = await db.select().from(tasks).where(eq(tasks.id, created.id));
			expect(current.cancelledAt).toBeInstanceOf(Date);
		} finally {
			await db.delete(tasks).where(eq(tasks.id, created.id));
		}
	});

	it('hides ordinary work in paused or closed Projects while retaining dated work in a paused Project', async () => {
		const { db } = await import('$lib/server/db');
		const { projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { listTasks } = await import('$lib/server/repositories/tasks');
		const [project] = await db
			.insert(projects)
			.values({ title: 'Projet test', status: 'paused' })
			.returning();
		const [plain, dated] = await db
			.insert(tasks)
			.values([
				{ title: 'Sans date', projectId: project.id, status: 'in_progress' },
				{ title: 'Avec date', projectId: project.id, scheduledDate: '2026-10-01' }
			])
			.returning();
		try {
			let listed = await listTasks(false);
			expect(listed.some((task) => task.id === plain.id)).toBe(false);
			expect(listed.some((task) => task.id === dated.id)).toBe(true);
			await db.update(projects).set({ status: 'done' }).where(eq(projects.id, project.id));
			listed = await listTasks(false);
			expect(listed.some((task) => task.id === dated.id)).toBe(false);
		} finally {
			await db.delete(tasks).where(eq(tasks.projectId, project.id));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});
});
