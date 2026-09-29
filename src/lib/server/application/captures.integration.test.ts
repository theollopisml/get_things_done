import { afterAll, describe, expect, it } from 'vitest';
import type { ChoiceResult } from '$lib/server/jev/client';

const choice = (value: string, probabilities: Record<string, number>): ChoiceResult => ({
	choice: value,
	probabilities,
	confidence: 0.95,
	model: 'typesafe/jev-1.13'
});

describe.runIf(process.env.RUN_DB_TESTS === '1')('capture classification with PostgreSQL', () => {
	afterAll(async () => {
		const { client } = await import('$lib/server/db');
		await client.end();
	});

	it('classifies manual captures as Tasks or Projects and rejects an unknown type', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { capture, processEntry } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const task = await capture('Écrire le plan\nPremière version', 'task');
		const project = await capture('Refaire le bureau', 'project');
		const pending = await capture('Classer plus tard', 'entry');
		try {
			const [taskEntry] = await db.select().from(entries).where(eq(entries.taskId, task.id));
			const [projectEntry] = await db
				.select()
				.from(entries)
				.where(eq(entries.projectId, project.id));
			expect(taskEntry.classificationSource).toBe('manual');
			expect(projectEntry.classificationSource).toBe('manual');
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].description).toBe(
				'Première version'
			);
			await expect(processEntry(pending.id, 'other')).rejects.toThrow('Classification invalide.');
			await processEntry(pending.id, 'task');
			const [classified] = await db.select().from(entries).where(eq(entries.id, pending.id));
			expect(classified.taskId).toBeTruthy();
			await db.delete(entries).where(eq(entries.id, taskEntry.id));
			await db.delete(entries).where(eq(entries.id, projectEntry.id));
			await db.delete(entries).where(eq(entries.id, pending.id));
			await db.delete(tasks).where(eq(tasks.id, classified.taskId!));
		} finally {
			await db.delete(entries).where(eq(entries.taskId, task.id));
			await db.delete(entries).where(eq(entries.projectId, project.id));
			await db.delete(entries).where(eq(entries.id, pending.id));
			await db.delete(tasks).where(eq(tasks.id, task.id));
			await db.delete(projects).where(eq(projects.id, project.id));
		}
	});

	it('lets Jev attach a Task to an eligible Project and leaves a Project unattached', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { retryJevClassification } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const [parent] = await db.insert(projects).values({ title: 'Portfolio' }).returning();
		const [taskEntry, projectEntry] = await db
			.insert(entries)
			.values([{ rawContent: 'Corriger le portfolio' }, { rawContent: 'Apprendre une langue' }])
			.returning();
		try {
			let calls = 0;
			const classifiedTask = await retryJevClassification(taskEntry.id, {
				client: {
					choose: async () =>
						calls++ === 0
							? choice('task', { task: 0.9, project: 0.1 })
							: choice(parent.id, { none: 0.02, [parent.id]: 0.98 })
				},
				loadCandidates: async () => [{ id: parent.id, title: parent.title }]
			});
			expect(classifiedTask).toMatchObject({ kind: 'task' });
			const [savedTaskEntry] = await db.select().from(entries).where(eq(entries.id, taskEntry.id));
			const [task] = await db.select().from(tasks).where(eq(tasks.id, savedTaskEntry.taskId!));
			expect(task.projectId).toBe(parent.id);
			const classifiedProject = await retryJevClassification(projectEntry.id, {
				client: { choose: async () => choice('project', { task: 0.1, project: 0.9 }) },
				loadCandidates: async () => {
					throw new Error('Project cannot have a parent');
				}
			});
			expect(classifiedProject).toMatchObject({ kind: 'project' });
			const [savedProjectEntry] = await db
				.select()
				.from(entries)
				.where(eq(entries.id, projectEntry.id));
			expect(savedProjectEntry.projectId).toBeTruthy();
			await db.delete(entries).where(eq(entries.id, taskEntry.id));
			await db.delete(entries).where(eq(entries.id, projectEntry.id));
			await db.delete(tasks).where(eq(tasks.id, task.id));
			await db.delete(projects).where(eq(projects.id, savedProjectEntry.projectId!));
		} finally {
			await db.delete(entries).where(eq(entries.id, taskEntry.id));
			await db.delete(entries).where(eq(entries.id, projectEntry.id));
			await db.delete(projects).where(eq(projects.id, parent.id));
		}
	});

	it('keeps a Collector due date across Jev, idempotent capture, and manual recovery', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { eq, inArray } = await import('drizzle-orm');
		const { getOrCreateCaptureEntry } = await import('$lib/server/repositories/captures');
		const { InvalidCapture, processEntry, retryJevClassification, submitCollectorCapture } =
			await import('./captures');
		const requestId = crypto.randomUUID();
		const taskEntry = await getOrCreateCaptureEntry(
			'Préparer la présentation',
			requestId,
			'2026-10-05'
		);
		const [projectEntry, failedEntry] = await db
			.insert(entries)
			.values([
				{
					rawContent: 'Refaire le salon',
					classificationState: 'failed',
					requestedDueDate: '2026-10-31'
				},
				{
					rawContent: 'Envoyer le dossier',
					classificationState: 'failed',
					requestedDueDate: '2026-10-07'
				}
			])
			.returning();
		const entryIds = [taskEntry.id, projectEntry.id, failedEntry.id];
		try {
			await expect(
				submitCollectorCapture('Date invalide', 'entry', crypto.randomUUID(), '2026-02-30')
			).rejects.toBeInstanceOf(InvalidCapture);
			expect(
				await getOrCreateCaptureEntry('Préparer la présentation', requestId, '2026-10-05')
			).toMatchObject({ id: taskEntry.id, requestedDueDate: '2026-10-05' });
			expect(
				await retryJevClassification(taskEntry.id, {
					client: { choose: async () => choice('task', { task: 0.95, project: 0.05 }) },
					loadCandidates: async () => []
				})
			).toMatchObject({ status: 'saved_and_classified', kind: 'task' });
			const [classifiedTaskEntry] = await db
				.select()
				.from(entries)
				.where(eq(entries.id, taskEntry.id));
			expect(
				(await db.select().from(tasks).where(eq(tasks.id, classifiedTaskEntry.taskId!)))[0]
			).toMatchObject({ title: 'Préparer la présentation', dueDate: '2026-10-05' });
			expect(
				await submitCollectorCapture('Préparer la présentation', 'entry', requestId, '2026-10-05')
			).toMatchObject({ status: 'saved_and_classified', entryId: taskEntry.id });
			await expect(
				submitCollectorCapture('Préparer la présentation', 'entry', requestId, '2026-10-06')
			).rejects.toBeInstanceOf(InvalidCapture);

			await retryJevClassification(projectEntry.id, {
				client: { choose: async () => choice('project', { task: 0.05, project: 0.95 }) },
				loadCandidates: async () => []
			});
			const [classifiedProjectEntry] = await db
				.select()
				.from(entries)
				.where(eq(entries.id, projectEntry.id));
			expect(
				(
					await db.select().from(projects).where(eq(projects.id, classifiedProjectEntry.projectId!))
				)[0]
			).toMatchObject({ title: 'Refaire le salon', dueDate: '2026-10-31' });

			const manual = await processEntry(failedEntry.id, 'task');
			expect((await db.select().from(tasks).where(eq(tasks.id, manual!.id)))[0]).toMatchObject({
				title: 'Envoyer le dossier',
				dueDate: '2026-10-07'
			});
		} finally {
			const linked = await db.select().from(entries).where(inArray(entries.id, entryIds));
			await db.delete(entries).where(inArray(entries.id, entryIds));
			for (const entry of linked) {
				if (entry.taskId) await db.delete(tasks).where(eq(tasks.id, entry.taskId));
				if (entry.projectId) await db.delete(projects).where(eq(projects.id, entry.projectId));
			}
		}
	});

	it('corrects a reviewed type while preserving text and protects Project children', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, entries, projects, tasks } = await import('$lib/server/db/schema');
		const { correctReviewType } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const [task] = await db
			.insert(tasks)
			.values({ title: 'Titre corrigé', description: 'Détail', dueDate: '2026-10-05' })
			.returning();
		const [entry] = await db
			.insert(entries)
			.values({
				rawContent: 'Texte capturé',
				classificationState: 'classified',
				classificationSource: 'jev',
				classifiedAt: new Date(),
				taskId: task.id
			})
			.returning();
		let projectId: string | null = null;
		let nextTaskId: string | null = null;
		try {
			expect(await correctReviewType(entry.id, 'task')).toBe('same_kind');
			await db.update(tasks).set({ scheduledDate: '2026-10-01' }).where(eq(tasks.id, task.id));
			expect(await correctReviewType(entry.id, 'project')).toBe('data_conflict');
			await db.update(tasks).set({ scheduledDate: null }).where(eq(tasks.id, task.id));
			expect(await correctReviewType(entry.id, 'project')).toBe('updated');
			const [asProject] = await db.select().from(entries).where(eq(entries.id, entry.id));
			projectId = asProject.projectId;
			expect(asProject.taskId).toBeNull();
			expect(asProject.reviewedAt).toBeInstanceOf(Date);
			expect(
				(await db.select().from(projects).where(eq(projects.id, projectId!)))[0]
			).toMatchObject({
				title: 'Titre corrigé',
				description: 'Détail',
				dueDate: '2026-10-05'
			});
			const [child] = await db.insert(tasks).values({ title: 'Enfant', projectId }).returning();
			try {
				expect(await correctReviewType(entry.id, 'task')).toBe('children_conflict');
			} finally {
				await db.delete(tasks).where(eq(tasks.id, child.id));
			}
			const [checkpoint] = await db
				.insert(checkpoints)
				.values({ projectId: projectId!, title: 'Jalon', position: 1 })
				.returning();
			try {
				expect(await correctReviewType(entry.id, 'task')).toBe('children_conflict');
			} finally {
				await db.delete(checkpoints).where(eq(checkpoints.id, checkpoint.id));
			}
			await db.update(projects).set({ startDate: '2026-10-01' }).where(eq(projects.id, projectId!));
			expect(await correctReviewType(entry.id, 'task')).toBe('data_conflict');
			await db
				.update(projects)
				.set({ startDate: null, dueDate: '2026-10-15' })
				.where(eq(projects.id, projectId!));
			expect(await correctReviewType(entry.id, 'task')).toBe('updated');
			const [asTask] = await db.select().from(entries).where(eq(entries.id, entry.id));
			nextTaskId = asTask.taskId;
			expect((await db.select().from(tasks).where(eq(tasks.id, nextTaskId!)))[0]).toMatchObject({
				title: 'Titre corrigé',
				description: 'Détail',
				dueDate: '2026-10-15'
			});
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			if (nextTaskId) await db.delete(tasks).where(eq(tasks.id, nextTaskId));
			await db.delete(tasks).where(eq(tasks.id, task.id));
			if (projectId) await db.delete(projects).where(eq(projects.id, projectId));
		}
	});

	it('restricts Review attachments to eligible Projects and protects Checkpoint links', async () => {
		const { db } = await import('$lib/server/db');
		const { checkpoints, entries, projects, tasks } = await import('$lib/server/db/schema');
		const { correctReviewRelation } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const [eligible, paused] = await db
			.insert(projects)
			.values([
				{ title: 'Projet actif', status: 'active' },
				{ title: 'Projet en pause', status: 'paused' }
			])
			.returning();
		const [task] = await db.insert(tasks).values({ title: 'Action' }).returning();
		const [entry] = await db
			.insert(entries)
			.values({
				rawContent: 'Action',
				classificationState: 'classified',
				classificationSource: 'jev',
				classifiedAt: new Date(),
				taskId: task.id
			})
			.returning();
		let checkpointId: string | null = null;
		try {
			expect(await correctReviewRelation(entry.id, paused.id)).toBe('invalid_parent');
			expect(await correctReviewRelation(entry.id, eligible.id)).toBe('updated');
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].projectId).toBe(
				eligible.id
			);
			const [checkpoint] = await db
				.insert(checkpoints)
				.values({ projectId: eligible.id, title: 'Jalon', position: 1 })
				.returning();
			checkpointId = checkpoint.id;
			await db.update(tasks).set({ checkpointId }).where(eq(tasks.id, task.id));
			expect(await correctReviewRelation(entry.id, '')).toBe('checkpoint_conflict');
			await db.update(tasks).set({ checkpointId: null }).where(eq(tasks.id, task.id));
			expect(await correctReviewRelation(entry.id, '')).toBe('updated');
			expect((await db.select().from(tasks).where(eq(tasks.id, task.id)))[0].projectId).toBeNull();
		} finally {
			await db.delete(entries).where(eq(entries.id, entry.id));
			await db.delete(tasks).where(eq(tasks.id, task.id));
			if (checkpointId) await db.delete(checkpoints).where(eq(checkpoints.id, checkpointId));
			await db.delete(projects).where(eq(projects.id, eligible.id));
			await db.delete(projects).where(eq(projects.id, paused.id));
		}
	});
});
