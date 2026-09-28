import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Review routes', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('filters Review by default and applies bulk confirmation and type correction through actions', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, visions } = await import('$lib/server/db/schema');
		const { actions, load } = await import('./+page.server');
		const { eq } = await import('drizzle-orm');
		const now = new Date();
		const [unreviewedVision, reviewedVision, manualVision] = await db
			.insert(visions)
			.values([
				{ title: 'Direction à revoir' },
				{ title: 'Direction confirmée' },
				{ title: 'Direction manuelle' }
			])
			.returning();
		const [unreviewed, reviewed, manual] = await db
			.insert(entries)
			.values([
				{
					rawContent: 'Direction à revoir',
					classificationState: 'classified',
					classificationSource: 'jev',
					classifiedAt: now,
					visionId: unreviewedVision.id
				},
				{
					rawContent: 'Direction confirmée',
					classificationState: 'classified',
					classificationSource: 'jev',
					classifiedAt: now,
					reviewedAt: now,
					visionId: reviewedVision.id
				},
				{
					rawContent: 'Direction manuelle',
					classificationState: 'classified',
					classificationSource: 'manual',
					classifiedAt: now,
					visionId: manualVision.id
				}
			])
			.returning();
		let createdProjectId: string | null = null;
		try {
			const defaultView = (await load({
				url: new URL('http://localhost/review')
			} as Parameters<typeof load>[0])) as { onlyUnreviewed: boolean; entries: { id: string }[] };
			expect(defaultView.onlyUnreviewed).toBe(true);
			expect(defaultView.entries.some((entry) => entry.id === unreviewed.id)).toBe(true);
			expect(defaultView.entries.some((entry) => entry.id === reviewed.id)).toBe(false);
			expect(defaultView.entries.some((entry) => entry.id === manual.id)).toBe(false);

			const allView = (await load({
				url: new URL('http://localhost/review?filter=all')
			} as Parameters<typeof load>[0])) as { onlyUnreviewed: boolean; entries: { id: string }[] };
			expect(allView.onlyUnreviewed).toBe(false);
			expect(allView.entries.some((entry) => entry.id === reviewed.id)).toBe(true);

			const confirmForm = new FormData();
			for (const id of [unreviewed.id, reviewed.id, manual.id]) confirmForm.append('ids', id);
			const confirmed = await actions.confirmAll({
				request: new Request('http://localhost/review?/confirmAll', {
					method: 'POST',
					body: confirmForm
				})
			} as Parameters<typeof actions.confirmAll>[0]);
			expect(confirmed).toEqual({ confirmed: 1 });
			expect(
				(await db.select().from(entries).where(eq(entries.id, manual.id)))[0].reviewedAt
			).toBeNull();
			const afterConfirm = (await load({
				url: new URL('http://localhost/review')
			} as Parameters<typeof load>[0])) as { entries: { id: string }[] };
			expect(afterConfirm.entries.some((entry) => entry.id === unreviewed.id)).toBe(false);

			const typeForm = new FormData();
			typeForm.set('id', unreviewed.id);
			typeForm.set('kind', 'project');
			expect(
				await actions.type({
					request: new Request('http://localhost/review?/type', {
						method: 'POST',
						body: typeForm
					})
				} as Parameters<typeof actions.type>[0])
			).toEqual({ saved: true });
			const [corrected] = await db.select().from(entries).where(eq(entries.id, unreviewed.id));
			createdProjectId = corrected.projectId;
			expect(corrected.visionId).toBeNull();
			expect(
				(await db.select().from(visions).where(eq(visions.id, unreviewedVision.id)))[0].deletedAt
			).toBeInstanceOf(Date);
			expect(
				await actions.type({
					request: new Request('http://localhost/review?/type', {
						method: 'POST',
						body: typeForm
					})
				} as Parameters<typeof actions.type>[0])
			).toMatchObject({ status: 400, data: { error: 'Choisis un autre type.' } });
		} finally {
			for (const entry of [unreviewed, reviewed, manual]) {
				await db.delete(entries).where(eq(entries.id, entry.id));
			}
			if (createdProjectId) await db.delete(projects).where(eq(projects.id, createdProjectId));
			for (const vision of [unreviewedVision, reviewedVision, manualVision]) {
				await db.delete(visions).where(eq(visions.id, vision.id));
			}
		}
	});

	it('keeps a failed capture in Review until manual processing', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { actions, load } = await import('./+page.server');
		const { eq } = await import('drizzle-orm');
		const [entry, toDelete] = await db
			.insert(entries)
			.values([
				{ rawContent: 'Tâche après échec Jev', classificationState: 'failed' },
				{ rawContent: 'Capture à supprimer', classificationState: 'failed' }
			])
			.returning();
		let taskId: string | null = null;
		try {
			const review = (await load({
				url: new URL('http://localhost/review?filter=unclassified')
			} as Parameters<typeof load>[0])) as {
				unclassified: { id: string }[];
			};
			expect(review.unclassified.some((item) => item.id === entry.id)).toBe(true);
			const editForm = new FormData();
			editForm.set('id', entry.id);
			editForm.set('rawContent', 'Tâche corrigée après échec Jev');
			expect(
				await actions.updateUnclassified({
					request: new Request('http://localhost/review?/updateUnclassified', {
						method: 'POST',
						body: editForm
					})
				} as Parameters<typeof actions.updateUnclassified>[0])
			).toEqual({ saved: true });
			const deleteForm = new FormData();
			deleteForm.set('id', toDelete.id);
			expect(
				await actions.deleteUnclassified({
					request: new Request('http://localhost/review?/deleteUnclassified', {
						method: 'POST',
						body: deleteForm
					})
				} as Parameters<typeof actions.deleteUnclassified>[0])
			).toEqual({ saved: true });
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
			expect(classified.rawContent).toBe('Tâche corrigée après échec Jev');
			const afterProcessing = (await load({
				url: new URL('http://localhost/review?filter=unclassified')
			} as Parameters<typeof load>[0])) as {
				unclassified: { id: string }[];
			};
			expect(afterProcessing.unclassified.some((item) => item.id === entry.id)).toBe(false);
			expect(afterProcessing.unclassified.some((item) => item.id === toDelete.id)).toBe(false);
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			await db.delete(entries).where(eq(entries.id, toDelete.id));
			if (taskId) await db.delete(tasks).where(eq(tasks.id, taskId));
		}
	});
});
