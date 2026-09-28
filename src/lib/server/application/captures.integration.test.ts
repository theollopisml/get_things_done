import { describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('capture and Inbox with PostgreSQL', () => {
	it('persists edits, classifies once, and keeps deleted entries out of the Inbox', async () => {
		const { db, client } = await import('$lib/server/db');
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
			expect((await db.select().from(tasks).where(eq(tasks.id, task!.id)))[0]).toMatchObject({
				title: 'Refaire mon CV',
				description: '- Vérifier les dates',
				status: 'todo'
			});

			const project = await capture('Projet\n\nContexte', 'project');
			created.push({ table: projects, id: project.id });
			expect(
				(await db.select().from(projects).where(eq(projects.id, project.id)))[0]
			).toMatchObject({
				title: 'Projet',
				description: 'Contexte',
				status: 'planned'
			});
			const vision = await capture('Vision', 'vision');
			created.push({ table: visions, id: vision.id });
			expect((await db.select().from(visions).where(eq(visions.id, vision.id)))[0]).toMatchObject({
				title: 'Vision',
				status: 'active'
			});

			const removed = await capture('À supprimer', 'entry');
			entryIds.push(removed.id);
			expect(await deleteEntry(removed.id)).toEqual({ id: removed.id });
			expect((await listEntries()).some((item) => item.id === removed.id)).toBe(false);
		} finally {
			for (const item of created) await db.delete(item.table).where(eq(item.table.id, item.id));
			for (const id of entryIds) await db.delete(entries).where(eq(entries.id, id));
			await client.end();
		}
	});
});
