import { fail } from '@sveltejs/kit';
import { addVision, InvalidVision } from '$lib/server/application/visions';
import { listVisions } from '$lib/server/repositories/visions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ visions: await listVisions() });

export const actions = {
	create: async ({ request }) => {
		try {
			const vision = await addVision((await request.formData()).get('title'));
			return { id: vision.id };
		} catch (error) {
			if (error instanceof InvalidVision) return fail(400, { error: error.message });
			return fail(503, { error: 'Création impossible. Réessaie.' });
		}
	}
} satisfies Actions;
