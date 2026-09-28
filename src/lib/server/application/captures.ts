import { z } from 'zod';
import { hasContent } from '$lib/domain/capture';
import {
	classifyEntry,
	createClassified,
	createEntry,
	deleteEntry,
	listEntries,
	updateEntry
} from '$lib/server/repositories/captures';

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
