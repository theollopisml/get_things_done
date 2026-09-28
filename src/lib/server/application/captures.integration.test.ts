import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('capture and Inbox with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('enforces Entry state, review, probability, and request key constraints', async () => {
		const { db } = await import('$lib/server/db');
		const { entries } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const requestId = crypto.randomUUID();
		try {
			await expect(
				db.insert(entries).values({ rawContent: 'Invalid', classificationState: 'classified' })
			).rejects.toThrow();
			await expect(
				db.insert(entries).values({ rawContent: 'Invalid', reviewedAt: new Date() })
			).rejects.toThrow();
			await expect(
				db.insert(entries).values({ rawContent: 'Invalid', typeProbability: 1.1 })
			).rejects.toThrow();
			await db.insert(entries).values({ rawContent: 'Original', captureRequestId: requestId });
			await expect(
				db.insert(entries).values({ rawContent: 'Duplicate', captureRequestId: requestId })
			).rejects.toThrow();
		} finally {
			await db.delete(entries).where(eq(entries.captureRequestId, requestId));
		}
	});

	it('persists edits, classifies once, and keeps deleted entries out of the Inbox', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks, projects, visions } = await import('$lib/server/db/schema');
		const { capture, editEntry, processEntry, deleteEntry, listEntries, parseEntryId } =
			await import('./captures');
		const { eq } = await import('drizzle-orm');
		const created: { table: typeof tasks | typeof projects | typeof visions; id: string }[] = [];
		const entryIds: string[] = [];
		try {
			expect(parseEntryId('not-an-id')).toBeNull();
			await expect(capture('  ', 'entry')).rejects.toThrow();
			await expect(capture('Title', 'checkpoint')).rejects.toThrow();
			const entry = await capture('Original', 'entry');
			entryIds.push(entry.id);
			expect((await listEntries()).some((item) => item.id === entry.id)).toBe(true);
			expect(await editEntry(entry.id, '\n  Refaire mon CV  \n\n- Vérifier les dates')).toEqual({
				id: entry.id
			});
			const task = await processEntry(entry.id, 'task');
			expect(task).not.toBeNull();
			created.push({ table: tasks, id: task!.id });
			expect(await processEntry(entry.id, 'project')).toBeNull();
			expect((await listEntries()).some((item) => item.id === entry.id)).toBe(false);
			expect((await db.select().from(entries).where(eq(entries.id, entry.id)))[0]).toMatchObject({
				classificationState: 'classified',
				classificationSource: 'manual',
				taskId: task!.id,
				projectId: null,
				visionId: null,
				rawContent: '\n  Refaire mon CV  \n\n- Vérifier les dates'
			});
			expect(await editEntry(entry.id, 'Modification tardive')).toBeNull();
			expect(await deleteEntry(entry.id)).toBeNull();
			expect((await db.select().from(tasks).where(eq(tasks.id, task!.id)))[0]).toMatchObject({
				title: 'Refaire mon CV',
				description: '- Vérifier les dates',
				status: 'todo'
			});

			const project = await capture('Projet\n\nContexte', 'project');
			created.push({ table: projects, id: project.id });
			const [projectEntry] = await db
				.select()
				.from(entries)
				.where(eq(entries.projectId, project.id));
			entryIds.push(projectEntry.id);
			expect(projectEntry).toMatchObject({
				classificationState: 'classified',
				classificationSource: 'manual',
				projectId: project.id,
				rawContent: 'Projet\n\nContexte'
			});
			expect(
				(await db.select().from(projects).where(eq(projects.id, project.id)))[0]
			).toMatchObject({
				title: 'Projet',
				description: 'Contexte',
				status: 'planned'
			});
			const vision = await capture('Vision', 'vision');
			created.push({ table: visions, id: vision.id });
			const [visionEntry] = await db.select().from(entries).where(eq(entries.visionId, vision.id));
			entryIds.push(visionEntry.id);
			expect(visionEntry.classifiedAt).toBeInstanceOf(Date);
			expect((await db.select().from(visions).where(eq(visions.id, vision.id)))[0]).toMatchObject({
				title: 'Vision',
				status: 'active'
			});

			const removed = await capture('À supprimer', 'entry');
			entryIds.push(removed.id);
			expect(await deleteEntry(removed.id)).toEqual({ id: removed.id });
			expect((await listEntries()).some((item) => item.id === removed.id)).toBe(false);
		} finally {
			for (const id of entryIds) await db.delete(entries).where(eq(entries.id, id));
			for (const item of created) await db.delete(item.table).where(eq(item.table.id, item.id));
		}
	});
});
