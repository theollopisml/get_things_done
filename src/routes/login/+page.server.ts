import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) {
		throw redirect(303, '/');
	}
	return { authError: url.searchParams.has('error') };
};
