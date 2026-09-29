import { fail } from '@sveltejs/kit';
import { addProject, InvalidProject } from '$lib/server/application/projects';
import { listProjects } from '$lib/server/repositories/projects';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ projects: await listProjects() });

export const actions = {
	create: async ({ request }) => {
		try {
			const project = await addProject((await request.formData()).get('title'));
			return { id: project.id };
		} catch (error) {
			if (error instanceof InvalidProject) return fail(400, { error: error.message });
			return fail(503, { error: 'Création impossible. Réessaie.' });
		}
	}
} satisfies Actions;
