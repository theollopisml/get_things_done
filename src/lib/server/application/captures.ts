import { z } from 'zod';
import { hasContent } from '$lib/domain/capture';
import type { ClassifiedKind } from '$lib/domain/capture';
import { getJevClient, JevError, JEV_MODEL } from '$lib/server/jev/client';
import { decideCapture } from '$lib/server/jev/classification';
import {
	applyJevClassification,
	classifyEntry,
	classifyCollectorManually,
	confirmJevClassification,
	confirmJevClassifications,
	correctJevClassification,
	correctJevRelation,
	createClassified,
	createEntry,
	deleteEntry,
	getCaptureEntry,
	getClassifiedRelationTitle,
	getOrCreateCaptureEntry,
	listEntries,
	listReviewParentOptions,
	markJevFailed,
	updateEntry
} from '$lib/server/repositories/captures';
import { listEligibleRelationCandidates } from '$lib/server/repositories/jev-candidates';

export class InvalidCapture extends Error {}

const content = z.string().refine(hasContent);
const captureInput = z.object({
	rawContent: content,
	kind: z.enum(['entry', 'task', 'project', 'vision'])
});
const classifyInput = z.enum(['task', 'project', 'vision']);

export function parseEntryId(value: unknown) {
	const result = z.uuid().safeParse(value);
	return result.success ? result.data : null;
}

export async function capture(rawContent: unknown, kind: unknown) {
	const result = captureInput.safeParse({ rawContent, kind });
	if (!result.success) {
		throw new InvalidCapture('Saisis une capture avant de l’enregistrer.');
	}
	const value = result.data;
	return value.kind === 'entry'
		? createEntry(value.rawContent)
		: createClassified(value.kind, value.rawContent);
}

type JevDependencies = {
	client?: ReturnType<typeof getJevClient>;
	loadCandidates?: typeof listEligibleRelationCandidates;
};

const activeClassifications = new Set<string>();

function linkedKind(entry: {
	taskId: string | null;
	projectId: string | null;
	visionId: string | null;
}): ClassifiedKind {
	if (entry.taskId) return 'task';
	if (entry.projectId) return 'project';
	return 'vision';
}

export async function submitCollectorCapture(
	rawContent: unknown,
	kind: unknown,
	requestId: unknown,
	dependencies: JevDependencies = {}
) {
	const input = captureInput.extend({ requestId: z.uuid() }).safeParse({
		rawContent,
		kind,
		requestId
	});
	if (!input.success) throw new InvalidCapture('Capture ou clé de requête invalide.');
	const { rawContent: text, kind: selectedKind, requestId: key } = input.data;
	const entry = await getOrCreateCaptureEntry(text, key);
	if (!entry || entry.deletedAt || entry.rawContent !== text) {
		throw new InvalidCapture('Cette clé appartient à une autre capture.');
	}
	if (entry.classificationState === 'classified') {
		return {
			status: 'saved_and_classified' as const,
			entryId: entry.id,
			kind: linkedKind(entry),
			relationTitle: await getClassifiedRelationTitle(entry)
		};
	}
	if (selectedKind !== 'entry') {
		const classified = await classifyCollectorManually(entry.id, text, selectedKind);
		if (!classified) throw new InvalidCapture('Capture indisponible.');
		return {
			status: 'saved_and_classified' as const,
			entryId: entry.id,
			kind: classified,
			relationTitle: null
		};
	}
	scheduleJevClassification(entry.id, text, dependencies);
	return { status: 'saved_pending_classification' as const, entryId: entry.id };
}

export async function queueJevClassification(id: unknown, dependencies: JevDependencies = {}) {
	const entryId = parseEntryId(id);
	if (!entryId) throw new InvalidCapture('Capture invalide.');
	const entry = await getCaptureEntry(entryId);
	if (!entry) return null;
	if (entry.classificationState === 'classified') {
		return {
			status: 'saved_and_classified' as const,
			entryId,
			kind: linkedKind(entry),
			relationTitle: await getClassifiedRelationTitle(entry)
		};
	}
	scheduleJevClassification(entryId, entry.rawContent, dependencies);
	return { status: 'saved_pending_classification' as const, entryId };
}

export async function getCollectorClassificationStatus(id: unknown) {
	const entryId = parseEntryId(id);
	if (!entryId) throw new InvalidCapture('Capture invalide.');
	let entry = await getCaptureEntry(entryId);
	if (!entry) return null;
	if (
		entry.classificationState === 'pending' &&
		!activeClassifications.has(entryId) &&
		Date.now() - entry.updatedAt.getTime() > 60_000
	) {
		await markJevFailed(entryId);
		entry = await getCaptureEntry(entryId);
		if (!entry) return null;
	}
	return {
		status: entry.classificationState,
		kind: entry.classificationState === 'classified' ? linkedKind(entry) : null,
		relationTitle:
			entry.classificationState === 'classified' ? await getClassifiedRelationTitle(entry) : null
	};
}

function scheduleJevClassification(id: string, rawContent: string, dependencies: JevDependencies) {
	if (activeClassifications.has(id)) return;
	activeClassifications.add(id);
	setImmediate(() => {
		void classifyWithJev(id, rawContent, dependencies)
			.catch(async () => {
				try {
					await markJevFailed(id);
				} catch {
					// The persisted Entry remains available for a later retry.
				}
				console.error(
					JSON.stringify({
						event: 'jev_classification',
						entryId: id,
						model: JEV_MODEL,
						code: 'internal'
					})
				);
			})
			.finally(() => activeClassifications.delete(id));
	});
}

export async function retryJevClassification(id: unknown, dependencies: JevDependencies = {}) {
	const entryId = parseEntryId(id);
	if (!entryId) throw new InvalidCapture('Capture invalide.');
	const entry = await getCaptureEntry(entryId);
	if (!entry) return null;
	if (entry.classificationState === 'classified') {
		return { status: 'saved_and_classified' as const, entryId, kind: linkedKind(entry) };
	}
	return classifyWithJev(entryId, entry.rawContent, dependencies);
}

async function classifyWithJev(id: string, rawContent: string, dependencies: JevDependencies) {
	const startedAt = Date.now();
	try {
		const decision = await decideCapture(
			rawContent,
			dependencies.client ?? getJevClient(),
			dependencies.loadCandidates ?? listEligibleRelationCandidates
		);
		const classified = await applyJevClassification(id, rawContent, decision);
		if (!classified) throw new InvalidCapture('Capture indisponible.');
		if (classified === 'stale') {
			await markJevFailed(id);
			console.warn(
				JSON.stringify({
					event: 'jev_classification',
					entryId: id,
					model: JEV_MODEL,
					durationMs: Date.now() - startedAt,
					code: 'stale_capture'
				})
			);
			return { status: 'saved_pending_retry' as const, entryId: id };
		}
		console.info(
			JSON.stringify({
				event: 'jev_classification',
				entryId: id,
				model: decision.model,
				durationMs: Date.now() - startedAt,
				cost: decision.cost,
				code: 'classified'
			})
		);
		return { status: 'saved_and_classified' as const, entryId: id, kind: classified };
	} catch (error) {
		if (!(error instanceof JevError)) throw error;
		await markJevFailed(id);
		const current = await getCaptureEntry(id);
		if (current?.classificationState === 'classified') {
			return { status: 'saved_and_classified' as const, entryId: id, kind: linkedKind(current) };
		}
		console.warn(
			JSON.stringify({
				event: 'jev_classification',
				entryId: id,
				model: JEV_MODEL,
				durationMs: Date.now() - startedAt,
				code: error.code
			})
		);
		return { status: 'saved_pending_retry' as const, entryId: id };
	}
}

export async function editEntry(id: string, rawContent: unknown) {
	const result = content.safeParse(rawContent);
	if (!result.success) {
		throw new InvalidCapture('Une capture ne peut pas être vide.');
	}
	return updateEntry(id, result.data);
}

export async function processEntry(id: string, kind: unknown) {
	const result = classifyInput.safeParse(kind);
	if (!result.success) throw new InvalidCapture('Classification invalide.');
	return classifyEntry(id, result.data);
}

export async function confirmReview(id: unknown) {
	const entryId = parseEntryId(id);
	if (!entryId) throw new InvalidCapture('Capture invalide.');
	return confirmJevClassification(entryId);
}

export async function confirmReviews(ids: unknown[]) {
	const parsed = z.array(z.uuid()).safeParse(ids);
	if (!parsed.success) throw new InvalidCapture('Captures invalides.');
	return confirmJevClassifications([...new Set(parsed.data)]);
}

export async function correctReviewRelation(id: unknown, relationId: unknown) {
	const entryId = parseEntryId(id);
	const parentId = relationId === '' ? null : parseEntryId(relationId);
	if (!entryId || (relationId !== '' && !parentId)) {
		throw new InvalidCapture('Capture ou rattachement invalide.');
	}
	return correctJevRelation(entryId, parentId);
}

export async function correctReviewType(id: unknown, kind: unknown) {
	const entryId = parseEntryId(id);
	const selectedKind = classifyInput.safeParse(kind);
	if (!entryId || !selectedKind.success) {
		throw new InvalidCapture('Capture ou type invalide.');
	}
	return correctJevClassification(entryId, selectedKind.data);
}

export { deleteEntry, listEntries, listReviewParentOptions };
