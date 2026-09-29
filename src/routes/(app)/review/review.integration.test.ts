import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Review routes', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('filters Jev classifications, confirms them, and corrects the type', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { actions, load } = await import('./+page.server');
		const { eq } = await import('drizzle-orm');
		const now = new Date();
		const created = await db
			.insert(tasks)
			.values([{ title: 'À revoir' }, { title: 'Confirmée' }, { title: 'Manuelle' }])
			.returning();
		const [unreviewed, reviewed, manual] = await db
			.insert(entries)
			.values([
				{
					rawContent: 'À revoir',
					classificationState: 'classified',
					classificationSource: 'jev',
					classifiedAt: now,
					taskId: created[0].id
				},
				{
					rawContent: 'Confirmée',
					classificationState: 'classified',
					classificationSource: 'jev',
					classifiedAt: now,
					reviewedAt: now,
					taskId: created[1].id
				},
				{
					rawContent: 'Manuelle',
					classificationState: 'classified',
					classificationSource: 'manual',
					classifiedAt: now,
					taskId: created[2].id
				}
			])
			.returning();
		let projectId: string | null = null;
		try {
			const pending = (await load({ url: new URL('http://localhost/review') } as Parameters<
				typeof load
			>[0])) as { onlyUnreviewed: boolean; entries: { id: string }[] };
			expect(pending.onlyUnreviewed).toBe(true);
			expect(pending.entries.map((item) => item.id)).toContain(unreviewed.id);
			expect(pending.entries.map((item) => item.id)).not.toContain(reviewed.id);
			expect(pending.entries.map((item) => item.id)).not.toContain(manual.id);
			const all = (await load({ url: new URL('http://localhost/review?filter=all') } as Parameters<
				typeof load
			>[0])) as { entries: { id: string }[] };
			expect(all.entries.map((item) => item.id)).toContain(reviewed.id);
			const confirmForm = new FormData();
			for (const id of [unreviewed.id, reviewed.id, manual.id]) confirmForm.append('ids', id);
			expect(
				await actions.confirmAll({
					request: new Request('http://localhost/review?/confirmAll', {
						method: 'POST',
						body: confirmForm
					})
				} as Parameters<typeof actions.confirmAll>[0])
			).toEqual({ confirmed: 1 });
			const typeForm = new FormData();
			typeForm.set('id', unreviewed.id);
			typeForm.set('kind', 'project');
			expect(
				await actions.type({
					request: new Request('http://localhost/review?/type', { method: 'POST', body: typeForm })
				} as Parameters<typeof actions.type>[0])
			).toEqual({ saved: true });
			const [corrected] = await db.select().from(entries).where(eq(entries.id, unreviewed.id));
			projectId = corrected.projectId;
			expect(corrected.taskId).toBeNull();
			expect(
				(await db.select().from(tasks).where(eq(tasks.id, created[0].id)))[0].deletedAt
			).toBeInstanceOf(Date);
		} finally {
			for (const entry of [unreviewed, reviewed, manual])
				await db.delete(entries).where(eq(entries.id, entry.id));
			for (const task of created) await db.delete(tasks).where(eq(tasks.id, task.id));
			if (projectId) await db.delete(projects).where(eq(projects.id, projectId));
		}
	});

	it('hides completed and cancelled objects from Review and the Home count until reopened', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { countReviewAttention } = await import('$lib/server/repositories/captures');
		const { load } = await import('./+page.server');
		const { eq } = await import('drizzle-orm');
		const now = new Date();
		const createdTasks = await db
			.insert(tasks)
			.values([
				{ title: 'Task terminée', status: 'done' },
				{ title: 'Task annulée', status: 'cancelled' }
			])
			.returning();
		const createdProjects = await db
			.insert(projects)
			.values([
				{ title: 'Project terminé', status: 'done' },
				{ title: 'Project annulé', status: 'cancelled' }
			])
			.returning();
		const createdEntries = await db
			.insert(entries)
			.values([
				...createdTasks.map((task) => ({
					rawContent: task.title,
					classificationState: 'classified' as const,
					classificationSource: 'jev' as const,
					classifiedAt: now,
					taskId: task.id
				})),
				...createdProjects.map((project) => ({
					rawContent: project.title,
					classificationState: 'classified' as const,
					classificationSource: 'jev' as const,
					classifiedAt: now,
					projectId: project.id
				}))
			])
			.returning();
		try {
			const before = await countReviewAttention();
			for (const filter of ['', '?filter=all']) {
				const result = (await load({
					url: new URL(`http://localhost/review${filter}`)
				} as Parameters<typeof load>[0])) as { entries: { id: string }[] };
				for (const entry of createdEntries)
					expect(result.entries.map((item) => item.id)).not.toContain(entry.id);
			}
			await db.update(tasks).set({ status: 'todo' }).where(eq(tasks.id, createdTasks[0].id));
			await db
				.update(projects)
				.set({ status: 'active' })
				.where(eq(projects.id, createdProjects[0].id));
			const reopened = (await load({
				url: new URL('http://localhost/review')
			} as Parameters<typeof load>[0])) as { entries: { id: string }[] };
			expect(reopened.entries.map((item) => item.id)).toContain(createdEntries[0].id);
			expect(reopened.entries.map((item) => item.id)).toContain(createdEntries[2].id);
			expect(reopened.entries.map((item) => item.id)).not.toContain(createdEntries[1].id);
			expect(reopened.entries.map((item) => item.id)).not.toContain(createdEntries[3].id);
			expect((await countReviewAttention()).unreviewed).toBe(before.unreviewed + 2);
		} finally {
			for (const entry of createdEntries) await db.delete(entries).where(eq(entries.id, entry.id));
			for (const task of createdTasks) await db.delete(tasks).where(eq(tasks.id, task.id));
			for (const project of createdProjects)
				await db.delete(projects).where(eq(projects.id, project.id));
		}
	});

	it('keeps failed captures available for manual processing', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { actions, load } = await import('./+page.server');
		const { eq } = await import('drizzle-orm');
		const [entry] = await db
			.insert(entries)
			.values({ rawContent: 'Tâche après échec', classificationState: 'failed' })
			.returning();
		let taskId: string | null = null;
		try {
			const review = (await load({
				url: new URL('http://localhost/review?filter=unclassified')
			} as Parameters<typeof load>[0])) as { unclassified: { id: string }[] };
			expect(review.unclassified.some((item) => item.id === entry.id)).toBe(true);
			const form = new FormData();
			form.set('id', entry.id);
			form.set('kind', 'task');
			expect(
				await actions.classifyUnclassified({
					request: new Request('http://localhost/review?/classifyUnclassified', {
						method: 'POST',
						body: form
					})
				} as Parameters<typeof actions.classifyUnclassified>[0])
			).toEqual({ saved: true });
			const [classified] = await db.select().from(entries).where(eq(entries.id, entry.id));
			taskId = classified.taskId;
			expect(classified.classificationSource).toBe('manual');
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			if (taskId) await db.delete(tasks).where(eq(tasks.id, taskId));
		}
	});
});
