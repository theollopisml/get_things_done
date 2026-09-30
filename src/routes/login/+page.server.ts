import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) {
		throw redirect(303, '/');
	}
	const code = url.searchParams.get('error');
	let authError = '';
	if (code !== null) {
		switch (code) {
			case 'owner_only':
				authError =
					'Ce compte GitHub n’est pas autorisé. Réessaie avec le compte GitHub propriétaire.';
				break;
			case 'state_mismatch':
			case 'state_not_found':
			case 'state_expired':
				authError =
					'La tentative de connexion a expiré ou a été interrompue. Relance la connexion dans ce même navigateur.';
				break;
			case 'access_denied':
				authError = 'L’autorisation GitHub a été annulée. Tu peux relancer la connexion.';
				break;
			default:
				authError =
					'La connexion GitHub a échoué. Réessaie ; si le problème persiste, contacte le propriétaire.';
		}
	}
	return { authError };
};
