import { z } from 'zod';
import { visionStatuses } from '$lib/domain/visions';
import {
	createVision,
	saveVision,
	setVisionStatus,
	softDeleteVision
} from '$lib/server/repositories/visions';

export class InvalidVision extends Error {}

const id = z.uuid();
const title = z.string().trim().min(1).max(500);
const edit = z.object({
	title,
	description: z.string().max(100_000)
});
const status = z.enum(visionStatuses);

export async function addVision(value: unknown) {
	const parsed = title.safeParse(value);
	if (!parsed.success) throw new InvalidVision('Saisis un titre pour la Vision.');
	return createVision(parsed.data);
}

export async function editVision(visionId: unknown, fields: Record<string, unknown>) {
	const parsedId = id.safeParse(visionId);
	const parsed = edit.safeParse(fields);
	if (!parsedId.success || !parsed.success) throw new InvalidVision('Champs de Vision invalides.');
	return saveVision(parsedId.data, {
		...parsed.data,
		description: parsed.data.description || null
	});
}

export async function changeVisionStatus(visionId: unknown, nextStatus: unknown) {
	const parsedId = id.safeParse(visionId);
	const parsedStatus = status.safeParse(nextStatus);
	if (!parsedId.success || !parsedStatus.success)
		throw new InvalidVision('Statut de Vision invalide.');
	const result = await setVisionStatus(parsedId.data, parsedStatus.data);
	if (result.outcome === 'invalid_transition')
		throw new InvalidVision('Transition de statut impossible.');
	return result.outcome === 'updated' ? result : null;
}

export async function deleteVision(visionId: unknown) {
	const parsedId = id.safeParse(visionId);
	if (!parsedId.success) throw new InvalidVision('Vision invalide.');
	return softDeleteVision(parsedId.data);
}
