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
		await expect(addTask('Date invalide', '2026-02-30')).rejects.toBeInstanceOf(InvalidTask);
		const created = await addTask('  Préparer le dossier  ', '2026-10-05');
		try {
			expect(created).toMatchObject({
				title: 'Préparer le dossier',
				status: 'todo',
				dueDate: '2026-10-05'
			});
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
		const { groupHomeTasks } = await import('$lib/domain/home');
		const [project] = await db
			.insert(projects)
			.values({ title: 'Projet test', status: 'paused' })
			.returning();
		const [plain, dated, overdue] = await db
			.insert(tasks)
			.values([
				{ title: 'Sans date', projectId: project.id, status: 'in_progress' },
				{ title: 'Avec date', projectId: project.id, scheduledDate: '2026-10-01' },
				{ title: 'En retard', projectId: project.id, dueDate: '2026-09-30' }
			])
			.returning();
		try {
			let listed = await listTasks(false);
			expect(listed.some((task) => task.id === plain.id)).toBe(false);
			expect(listed.some((task) => task.id === dated.id)).toBe(true);
			let home = groupHomeTasks(listed, '2026-10-01', '12:00');
			expect(home.today.map((task) => task.id)).toContain(dated.id);
			expect(home.late.map((task) => task.id)).toContain(overdue.id);
			expect(home.in_progress.map((task) => task.id)).not.toContain(plain.id);
			await db.update(projects).set({ status: 'done' }).where(eq(projects.id, project.id));
			listed = await listTasks(false);
			expect(listed.some((task) => task.id === dated.id)).toBe(false);
			home = groupHomeTasks(listed, '2026-10-01', '12:00');
			expect(
				[...home.late, ...home.in_progress, ...home.today].some((task) => task.id === overdue.id)
			).toBe(false);
		} finally {
			await db.delete(tasks).where(eq(tasks.projectId, project.id));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});

	it('keeps one recurring occurrence, preserves its anchor through postponement, and safely undoes completion', async () => {
		const { db } = await import('$lib/server/db');
		const { tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { addTask, editTask, changeTaskStatus, undoTaskRecurrence, InvalidTask } =
			await import('./tasks');
		const { getNextRecurrenceDate, getFirstRecurrenceDateAfter } =
			await import('$lib/domain/recurrence');
		const { Temporal } = await import('@js-temporal/polyfill');
		const task = await addTask('Sortir les poubelles');
		const fields = {
			title: task.title,
			description: '',
			scheduledDate: '2026-09-28',
			scheduledTime: '',
			dueDate: '',
			dueTime: '',
			recurrenceRule: JSON.stringify({ frequency: 'weekly', interval: 1, weekdays: [1] })
		};
		try {
			await expect(editTask(task.id, { ...fields, dueDate: '2026-10-01' })).rejects.toBeInstanceOf(
				InvalidTask
			);
			const created = await editTask(task.id, fields);
			expect(created).toMatchObject({
				scheduledDate: '2026-09-28',
				recurrenceAnchorDate: '2026-09-28',
				dueDate: null
			});
			await editTask(task.id, { ...fields, scheduledDate: '2026-09-29' });
			await editTask(task.id, {
				...fields,
				title: 'Sortir les poubelles jaunes',
				scheduledDate: '2026-09-29'
			});
			let [current] = await db.select().from(tasks).where(eq(tasks.id, task.id));
			expect(current.recurrenceAnchorDate).toBe('2026-09-28');
			const done = await changeTaskStatus(task.id, 'done', 'Europe/Paris', '2026-09-29');
			const today = Temporal.Now.zonedDateTimeISO('Europe/Paris').toPlainDate().toString();
			const next = getNextRecurrenceDate({
				rule: { frequency: 'weekly', interval: 1, weekdays: [1] },
				anchorDate: '2026-09-28',
				currentScheduledDate: '2026-09-29',
				completionDate: today
			});
			expect(done).toMatchObject({
				previousStatus: 'todo',
				previousScheduledDate: '2026-09-29',
				nextScheduledDate: next
			});
			expect(await changeTaskStatus(task.id, 'done', 'Europe/Paris', '2026-09-29')).toBeNull();
			[current] = await db.select().from(tasks).where(eq(tasks.id, task.id));
			expect(current).toMatchObject({
				status: 'todo',
				scheduledDate: next,
				completedAt: null,
				recurrenceAnchorDate: '2026-09-28'
			});
			expect(await undoTaskRecurrence(task.id, '2026-09-29', next, 'todo', 'todo')).toBeTruthy();
			[current] = await db.select().from(tasks).where(eq(tasks.id, task.id));
			expect(current.scheduledDate).toBe('2026-09-29');
			await changeTaskStatus(task.id, 'cancelled', 'Europe/Paris');
			await editTask(task.id, {
				...fields,
				title: 'Sortir les poubelles recyclables',
				scheduledDate: '2026-09-29'
			});
			expect(
				await undoTaskRecurrence(task.id, '2026-09-29', '2026-09-29', 'todo', 'cancelled')
			).toBeTruthy();
			await changeTaskStatus(task.id, 'cancelled', 'Europe/Paris');
			const reopened = await changeTaskStatus(task.id, 'todo', 'Europe/Paris');
			expect(reopened?.task.scheduledDate).toBe(
				getFirstRecurrenceDateAfter(
					{ frequency: 'weekly', interval: 1, weekdays: [1] },
					'2026-09-28',
					today
				)
			);
			expect(
				await undoTaskRecurrence(
					task.id,
					'2026-09-29',
					reopened!.task.scheduledDate!,
					'cancelled',
					'todo'
				)
			).toBeTruthy();
			const reopenedAgain = await changeTaskStatus(task.id, 'todo', 'Europe/Paris');
			await editTask(task.id, {
				...fields,
				scheduledDate: reopenedAgain!.task.scheduledDate!,
				recurrenceRule: ''
			});
			[current] = await db.select().from(tasks).where(eq(tasks.id, task.id));
			expect(current).toMatchObject({ recurrenceRule: null, recurrenceAnchorDate: null });
		} finally {
			await db.delete(tasks).where(eq(tasks.id, task.id));
		}
	});
});
