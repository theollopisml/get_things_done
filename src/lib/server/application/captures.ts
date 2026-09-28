import { z } from 'zod';
import { hasContent } from '$lib/domain/capture';
import type { ClassifiedKind } from '$lib/domain/capture';
import { getJevClient, JevError, JEV_MODEL } from '$lib/server/jev/client';
import { decideCapture } from '$lib/server/jev/classification';
import {
	applyJevClassification,
	classifyEntry,
	classifyCollectorManually,
	createClassified,
	createEntry,
	deleteEntry,
	getCaptureEntry,
	getOrCreateCaptureEntry,
	listEntries,
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
		return { status: 'saved_and_classified' as const, entryId: entry.id, kind: linkedKind(entry) };
	}
	if (selectedKind !== 'entry') {
		const classified = await classifyCollectorManually(entry.id, text, selectedKind);
		if (!classified) throw new InvalidCapture('Capture indisponible.');
		return { status: 'saved_and_classified' as const, entryId: entry.id, kind: classified };
	}
	return classifyWithJev(entry.id, text, dependencies);
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

export { deleteEntry, listEntries };
