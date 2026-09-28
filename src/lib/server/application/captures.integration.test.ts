import { afterAll, describe, expect, it, vi } from 'vitest';
import type { ChoiceResult } from '$lib/server/jev/client';

describe.runIf(process.env.RUN_DB_TESTS === '1')('capture and Inbox with PostgreSQL', () => {
	async function waitForStatus(id: string, status: 'classified' | 'failed') {
		const { getCollectorClassificationStatus } = await import('./captures');
		await vi.waitFor(
			async () => expect((await getCollectorClassificationStatus(id))?.status).toBe(status),
			{ timeout: 3000, interval: 20 }
		);
	}

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

	it('classifies a Collector capture once across a lost response and manual retries', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks, visions } = await import('$lib/server/db/schema');
		const { submitCollectorCapture, retryJevClassification } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const jevKey = crypto.randomUUID();
		const manualKey = crypto.randomUUID();
		const choose = vi.fn(async () => ({
			choice: 'vision',
			probabilities: { task: 0.1, project: 0.1, vision: 0.8 },
			confidence: 0.9,
			model: 'typesafe/jev-1.13',
			cost: 0.01
		}));
		const dependencies = { client: { choose }, loadCandidates: async () => [] };
		try {
			const first = await submitCollectorCapture('Vision persistée', 'entry', jevKey, dependencies);
			const replay = await submitCollectorCapture(
				'Vision persistée',
				'entry',
				jevKey,
				dependencies
			);
			expect(first).toMatchObject({ status: 'saved_pending_classification' });
			expect(replay.entryId).toBe(first.entryId);
			await waitForStatus(first.entryId, 'classified');
			const retry = await retryJevClassification(first.entryId, dependencies);
			expect(retry).toMatchObject({ status: 'saved_and_classified', entryId: first.entryId });
			expect(choose).toHaveBeenCalledOnce();
			const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, jevKey));
			expect(entry).toMatchObject({
				rawContent: 'Vision persistée',
				classificationState: 'classified',
				classificationSource: 'jev',
				typeProbability: 0.8,
				jevModel: 'typesafe/jev-1.13'
			});
			expect(entry.visionId).toBeTruthy();
			await expect(
				submitCollectorCapture('Autre contenu', 'entry', jevKey, dependencies)
			).rejects.toThrow('Cette clé appartient à une autre capture.');

			const manual = await submitCollectorCapture('Tâche manuelle', 'task', manualKey);
			expect(await submitCollectorCapture('Tâche manuelle', 'task', manualKey)).toEqual(manual);
			const [manualEntry] = await db
				.select()
				.from(entries)
				.where(eq(entries.captureRequestId, manualKey));
			expect(manualEntry).toMatchObject({
				classificationState: 'classified',
				classificationSource: 'manual',
				rawContent: 'Tâche manuelle'
			});
			expect(manualEntry.taskId).toBeTruthy();
		} finally {
			for (const key of [jevKey, manualKey]) {
				const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
				if (!entry) continue;
				await db.delete(entries).where(eq(entries.id, entry.id));
				if (entry.taskId) await db.delete(tasks).where(eq(tasks.id, entry.taskId));
				if (entry.visionId) await db.delete(visions).where(eq(visions.id, entry.visionId));
			}
		}
	});

	it('keeps a failed Entry for retry and creates one object under concurrent requests', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, tasks } = await import('$lib/server/db/schema');
		const { submitCollectorCapture, queueJevClassification } = await import('./captures');
		const { JevError } = await import('$lib/server/jev/client');
		const { eq } = await import('drizzle-orm');
		const key = crypto.randomUUID();
		const failedClient = {
			choose: async (): Promise<ChoiceResult> => {
				throw new JevError('timeout');
			}
		};
		const successfulClient = {
			choose: async () => ({
				choice: 'task',
				probabilities: { task: 0.95, project: 0.04, vision: 0.01 },
				confidence: 0.9,
				model: 'typesafe/jev-1.13'
			})
		};
		const loadCandidates = async () => [];
		try {
			const failed = await submitCollectorCapture('Tâche à sauver', 'entry', key, {
				client: failedClient,
				loadCandidates
			});
			expect(failed.status).toBe('saved_pending_classification');
			await waitForStatus(failed.entryId, 'failed');
			const [saved] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			expect(saved).toMatchObject({ id: failed.entryId, classificationState: 'failed' });
			const [retry, concurrent] = await Promise.all([
				queueJevClassification(failed.entryId, { client: successfulClient, loadCandidates }),
				submitCollectorCapture('Tâche à sauver', 'entry', key, {
					client: successfulClient,
					loadCandidates
				})
			]);
			expect(retry?.entryId).toBe(failed.entryId);
			expect(concurrent.entryId).toBe(failed.entryId);
			await waitForStatus(failed.entryId, 'classified');
			const [classified] = await db.select().from(entries).where(eq(entries.id, failed.entryId));
			expect(classified).toMatchObject({
				classificationState: 'classified',
				classificationSource: 'jev'
			});
			expect(classified.taskId).toBeTruthy();
			const linked = await db.select().from(tasks).where(eq(tasks.id, classified.taskId!));
			expect(linked).toHaveLength(1);
		} finally {
			const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			if (entry) {
				await db.delete(entries).where(eq(entries.id, entry.id));
				if (entry.taskId) await db.delete(tasks).where(eq(tasks.id, entry.taskId));
			}
		}
	});

	it('returns after persistence while Jev is still deciding', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, visions } = await import('$lib/server/db/schema');
		const { submitCollectorCapture } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const key = crypto.randomUUID();
		let finish: ((value: ChoiceResult) => void) | undefined;
		const client = {
			choose: () =>
				new Promise<ChoiceResult>((resolve) => {
					finish = resolve;
				})
		};
		try {
			const result = await submitCollectorCapture('Direction durable', 'entry', key, { client });
			expect(result.status).toBe('saved_pending_classification');
			const [saved] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			expect(saved).toMatchObject({ id: result.entryId, classificationState: 'pending' });
			await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
			finish!({
				choice: 'vision',
				probabilities: { task: 0, project: 0, vision: 1 },
				confidence: 1,
				model: 'typesafe/jev-1.13'
			});
			await waitForStatus(result.entryId, 'classified');
		} finally {
			const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			if (entry) {
				await db.delete(entries).where(eq(entries.id, entry.id));
				if (entry.visionId) await db.delete(visions).where(eq(visions.id, entry.visionId));
			}
		}
	});

	it('drops a Jev parent link that becomes ineligible before object creation', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks } = await import('$lib/server/db/schema');
		const { submitCollectorCapture } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const key = crypto.randomUUID();
		const [parent] = await db
			.insert(projects)
			.values({ title: 'Parent temporaire', status: 'active' })
			.returning({ id: projects.id });
		let calls = 0;
		const client = {
			choose: async (): Promise<ChoiceResult> => {
				calls++;
				if (calls === 1) {
					return {
						choice: 'task',
						probabilities: { task: 1, project: 0, vision: 0 },
						confidence: 1,
						model: 'typesafe/jev-1.13'
					};
				}
				await db.update(projects).set({ status: 'paused' }).where(eq(projects.id, parent.id));
				return {
					choice: parent.id,
					probabilities: { none: 0.02, [parent.id]: 0.98 },
					confidence: 0.98,
					model: 'typesafe/jev-1.13'
				};
			}
		};
		try {
			const result = await submitCollectorCapture('Tâche avec parent', 'entry', key, {
				client,
				loadCandidates: async () => [{ id: parent.id, title: 'Parent temporaire' }]
			});
			expect(result.status).toBe('saved_pending_classification');
			await waitForStatus(result.entryId, 'classified');
			expect(calls).toBe(2);
			const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			const [task] = await db.select().from(tasks).where(eq(tasks.id, entry.taskId!));
			expect(task.projectId).toBeNull();
			const { getCollectorClassificationStatus } = await import('./captures');
			expect((await getCollectorClassificationStatus(result.entryId))?.relationTitle).toBeNull();
		} finally {
			const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			if (entry) {
				await db.delete(entries).where(eq(entries.id, entry.id));
				if (entry.taskId) await db.delete(tasks).where(eq(tasks.id, entry.taskId));
			}
			await db.delete(projects).where(eq(projects.id, parent.id));
		}
	});

	it('reports the saved Project or Vision attachment in the Collector status', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, projects, tasks, visions } = await import('$lib/server/db/schema');
		const { getCollectorClassificationStatus, submitCollectorCapture } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const taskKey = crypto.randomUUID();
		const projectKey = crypto.randomUUID();
		const [vision] = await db
			.insert(visions)
			.values({ title: 'Vision créative' })
			.returning({ id: visions.id });
		const [parentProject] = await db
			.insert(projects)
			.values({ title: 'Portfolio', status: 'active' })
			.returning({ id: projects.id });
		const taskClient = {
			choose: async ({ criteria }: { criteria: Record<string, string> }): Promise<ChoiceResult> =>
				'task' in criteria
					? {
							choice: 'task',
							probabilities: { task: 1, project: 0, vision: 0 },
							confidence: 1,
							model: 'typesafe/jev-1.13'
						}
					: {
							choice: parentProject.id,
							probabilities: { none: 0.01, [parentProject.id]: 0.99 },
							confidence: 0.99,
							model: 'typesafe/jev-1.13'
						}
		};
		const projectClient = {
			choose: async ({ criteria }: { criteria: Record<string, string> }): Promise<ChoiceResult> =>
				'project' in criteria
					? {
							choice: 'project',
							probabilities: { task: 0, project: 1, vision: 0 },
							confidence: 1,
							model: 'typesafe/jev-1.13'
						}
					: {
							choice: vision.id,
							probabilities: { none: 0.01, [vision.id]: 0.99 },
							confidence: 0.99,
							model: 'typesafe/jev-1.13'
						}
		};
		try {
			const taskCapture = await submitCollectorCapture('Corriger le portfolio', 'entry', taskKey, {
				client: taskClient,
				loadCandidates: async () => [{ id: parentProject.id, title: 'Portfolio' }]
			});
			await waitForStatus(taskCapture.entryId, 'classified');
			expect(await getCollectorClassificationStatus(taskCapture.entryId)).toMatchObject({
				status: 'classified',
				kind: 'task',
				relationTitle: 'Portfolio'
			});

			const projectCapture = await submitCollectorCapture(
				'Publier mes dessins',
				'entry',
				projectKey,
				{
					client: projectClient,
					loadCandidates: async () => [{ id: vision.id, title: 'Vision créative' }]
				}
			);
			await waitForStatus(projectCapture.entryId, 'classified');
			expect(await getCollectorClassificationStatus(projectCapture.entryId)).toMatchObject({
				status: 'classified',
				kind: 'project',
				relationTitle: 'Vision créative'
			});
		} finally {
			for (const key of [taskKey, projectKey]) {
				const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
				if (!entry) continue;
				await db.delete(entries).where(eq(entries.id, entry.id));
				if (entry.taskId) await db.delete(tasks).where(eq(tasks.id, entry.taskId));
				if (entry.projectId) await db.delete(projects).where(eq(projects.id, entry.projectId));
			}
			await db.delete(projects).where(eq(projects.id, parentProject.id));
			await db.delete(visions).where(eq(visions.id, vision.id));
		}
	});

	it('does not apply a Jev answer to an Entry edited during the API call', async () => {
		const { db } = await import('$lib/server/db');
		const { entries, visions } = await import('$lib/server/db/schema');
		const { submitCollectorCapture, retryJevClassification } = await import('./captures');
		const { eq } = await import('drizzle-orm');
		const key = crypto.randomUUID();
		const answer = {
			choice: 'vision',
			probabilities: { task: 0, project: 0, vision: 1 },
			confidence: 1,
			model: 'typesafe/jev-1.13'
		};
		const client = {
			choose: async () => {
				const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
				await db
					.update(entries)
					.set({ rawContent: 'Texte modifié', updatedAt: new Date() })
					.where(eq(entries.id, entry.id));
				return answer;
			}
		};
		try {
			const first = await submitCollectorCapture('Texte initial', 'entry', key, { client });
			expect(first.status).toBe('saved_pending_classification');
			await waitForStatus(first.entryId, 'failed');
			const [saved] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			expect(saved).toMatchObject({ rawContent: 'Texte modifié', classificationState: 'failed' });
			expect(saved.visionId).toBeNull();
			const retry = await retryJevClassification(saved.id, {
				client: { choose: async () => answer }
			});
			expect(retry).toMatchObject({ status: 'saved_and_classified', entryId: saved.id });
			const [classified] = await db.select().from(entries).where(eq(entries.id, saved.id));
			expect(classified.visionId).toBeTruthy();
			const [vision] = await db.select().from(visions).where(eq(visions.id, classified.visionId!));
			expect(vision.title).toBe('Texte modifié');
		} finally {
			const [entry] = await db.select().from(entries).where(eq(entries.captureRequestId, key));
			if (entry) {
				await db.delete(entries).where(eq(entries.id, entry.id));
				if (entry.visionId) await db.delete(visions).where(eq(visions.id, entry.visionId));
			}
		}
	});
});
