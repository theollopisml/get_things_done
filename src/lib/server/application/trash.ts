import { z } from 'zod';
import { deleteTrashItem, purgeTrashItem, restoreTrashItem } from '$lib/server/repositories/trash';

export class InvalidTrashAction extends Error {}

const target = z.object({ kind: z.enum(['task', 'project', 'checkpoint']), id: z.uuid() });

function parseTarget(kind: unknown, id: unknown) {
	const parsed = target.safeParse({ kind, id });
	if (!parsed.success) throw new InvalidTrashAction('Objet invalide.');
	return parsed.data;
}

export async function deleteObject(kind: unknown, id: unknown) {
	const item = parseTarget(kind, id);
	return deleteTrashItem(item.kind, item.id);
}

export async function restoreObject(kind: unknown, id: unknown) {
	const item = parseTarget(kind, id);
	return restoreTrashItem(item.kind, item.id);
}

export async function purgeObject(kind: unknown, id: unknown, confirmation: unknown) {
	const item = parseTarget(kind, id);
	if (confirmation !== 'PURGER') throw new InvalidTrashAction('Confirme la purge définitive.');
	return purgeTrashItem(item.kind, item.id);
}
