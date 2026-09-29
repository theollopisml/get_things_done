import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Visions with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('validates edits and changes status without propagating to Projects', async () => {
		const { db } = await import('$lib/server/db');
		const { projects, visions } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { addVision, changeVisionStatus, editVision, InvalidVision } = await import('./visions');
		const { getVisionDetail } = await import('$lib/server/repositories/visions');

		await expect(addVision('   ')).rejects.toBeInstanceOf(InvalidVision);
		const vision = await addVision('  Apprendre à dessiner  ');
		try {
			expect(vision).toMatchObject({ title: 'Apprendre à dessiner', status: 'active' });
			await expect(
				editVision(vision.id, { title: '  ', description: 'Direction durable' })
			).rejects.toBeInstanceOf(InvalidVision);
			const edited = await editVision(vision.id, {
				title: 'Dessiner régulièrement',
				description: '## Pratique\nChaque semaine.'
			});
			expect(edited).toMatchObject({
				title: 'Dessiner régulièrement',
				description: '## Pratique\nChaque semaine.'
			});
			const [project] = await db
				.insert(projects)
				.values({ title: 'Cours de dessin', visionId: vision.id })
				.returning();
			try {
				expect((await getVisionDetail(vision.id))?.projects.map(({ id }) => id)).toContain(
					project.id
				);
				await changeVisionStatus(vision.id, 'paused');
				await changeVisionStatus(vision.id, 'archived');
				await expect(changeVisionStatus(vision.id, 'paused')).rejects.toBeInstanceOf(InvalidVision);
				await changeVisionStatus(vision.id, 'active');
				const [unchanged] = await db.select().from(projects).where(eq(projects.id, project.id));
				expect(unchanged).toMatchObject({ status: 'planned', visionId: vision.id });
			} finally {
				await db.delete(projects).where(eq(projects.id, project.id));
			}
		} finally {
			await db.delete(visions).where(eq(visions.id, vision.id));
		}
	});

	it('soft-deletes a Vision and detaches its Projects atomically', async () => {
		const { db } = await import('$lib/server/db');
		const { projects, visions } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { addVision, changeVisionStatus, deleteVision, editVision } = await import('./visions');
		const { getVisionDetail, listVisions } = await import('$lib/server/repositories/visions');

		const vision = await addVision('Une maison agréable');
		try {
			const [project] = await db
				.insert(projects)
				.values({ title: 'Rénover le bureau', visionId: vision.id })
				.returning();
			try {
				expect(await deleteVision(vision.id)).toBe(true);
				expect(await deleteVision(vision.id)).toBe(false);
				expect(await getVisionDetail(vision.id)).toBeNull();
				expect((await listVisions()).some(({ id }) => id === vision.id)).toBe(false);
				expect(await editVision(vision.id, { title: 'Nouveau titre', description: '' })).toBeNull();
				expect(await changeVisionStatus(vision.id, 'active')).toBeNull();
				const [preserved] = await db.select().from(projects).where(eq(projects.id, project.id));
				expect(preserved).toMatchObject({ visionId: null, status: 'planned' });
			} finally {
				await db.delete(projects).where(eq(projects.id, project.id));
			}
		} finally {
			await db.delete(visions).where(eq(visions.id, vision.id));
		}
	});
});
