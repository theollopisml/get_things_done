import { afterAll, describe, expect, it } from 'vitest';

describe.runIf(process.env.RUN_DB_TESTS === '1')('Checkpoints with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('creates, edits, completes, reopens and orders Checkpoints within a Project', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, projects } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const {
			addCheckpoint,
			changeCheckpointStatus,
			editCheckpoint,
			InvalidCheckpoint,
			setCheckpointOrder
		} = await import('./checkpoints');
		const [project] = await db.insert(projects).values({ title: 'Livrer le site' }).returning();
		let firstId: string | null = null;
		let secondId: string | null = null;
		try {
			const first = await addCheckpoint(project.id, '  Contenu prêt  ');
			const second = await addCheckpoint(project.id, 'Version publiée');
			if (!first || !second) throw new Error('Checkpoint creation failed');
			firstId = first.id;
			secondId = second.id;
			expect(first).toMatchObject({ title: 'Contenu prêt', status: 'open', position: 0 });
			expect(second.position).toBe(1);
			await expect(
				editCheckpoint(project.id, first.id, {
					title: 'Contenu prêt',
					description: '',
					targetDate: 'demain'
				})
			).rejects.toBeInstanceOf(InvalidCheckpoint);
			expect(
				await editCheckpoint(project.id, first.id, {
					title: 'Contenu prêt',
					description: 'Textes et images',
					targetDate: '2026-10-15'
				})
			).toMatchObject({ targetDate: '2026-10-15', description: 'Textes et images' });
			expect(
				(await changeCheckpointStatus(project.id, first.id, 'done'))?.completedAt
			).toBeInstanceOf(Date);
			expect((await changeCheckpointStatus(project.id, first.id, 'open'))?.completedAt).toBeNull();
			await expect(changeCheckpointStatus(project.id, first.id, 'open')).rejects.toBeInstanceOf(
				InvalidCheckpoint
			);
			await setCheckpointOrder(project.id, [second.id, first.id]);
			const rows = await db.select().from(checkpoints).where(eq(checkpoints.projectId, project.id));
			expect(rows.sort((a, b) => a.position - b.position).map((row) => row.id)).toEqual([
				second.id,
				first.id
			]);
			await expect(setCheckpointOrder(project.id, [first.id, first.id])).rejects.toBeInstanceOf(
				InvalidCheckpoint
			);
		} finally {
			if (firstId) await db.delete(checkpoints).where(eq(checkpoints.id, firstId));
			if (secondId) await db.delete(checkpoints).where(eq(checkpoints.id, secondId));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});

	it('links a Task only to a Checkpoint in its own Project and clears the link on move', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, projects, tasks } = await import('$lib/server/db/schema');
		const { eq } = await import('drizzle-orm');
		const { addCheckpoint, InvalidCheckpoint, linkTaskCheckpoint } = await import('./checkpoints');
		const { moveTaskToProject } = await import('./project-tasks');
		const [source, target] = await db
			.insert(projects)
			.values([{ title: 'Source' }, { title: 'Cible' }])
			.returning();
		const sourceCheckpoint = await addCheckpoint(source.id, 'Jalon source');
		const targetCheckpoint = await addCheckpoint(target.id, 'Jalon cible');
		const [task] = await db
			.insert(tasks)
			.values({ title: 'Livrer', projectId: source.id })
			.returning();
		try {
			if (!sourceCheckpoint || !targetCheckpoint) throw new Error('Checkpoint creation failed');
			await expect(
				linkTaskCheckpoint(source.id, task.id, targetCheckpoint.id)
			).rejects.toBeInstanceOf(InvalidCheckpoint);
			expect(await linkTaskCheckpoint(source.id, task.id, sourceCheckpoint.id)).toBe(true);
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].checkpointId).toBe(
				sourceCheckpoint.id
			);
			await moveTaskToProject(task.id, target.id);
			expect(
				(await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].checkpointId
			).toBeNull();
			expect(await linkTaskCheckpoint(source.id, task.id, sourceCheckpoint.id)).toBe(false);
			expect(await linkTaskCheckpoint(target.id, task.id, targetCheckpoint.id)).toBe(true);
			expect(await linkTaskCheckpoint(target.id, task.id, '')).toBe(true);
		} finally {
			await db.delete(tasks).where(eq(tasks.id, task.id));
			if (sourceCheckpoint)
				await db.delete(checkpoints).where(eq(checkpoints.id, sourceCheckpoint.id));
			if (targetCheckpoint)
				await db.delete(checkpoints).where(eq(checkpoints.id, targetCheckpoint.id));
			await db.delete(projects).where(eq(projects.id, source.id));
			await db.delete(projects).where(eq(projects.id, target.id));
		}
	});
});
