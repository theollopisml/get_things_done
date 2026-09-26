<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let { data } = $props();
	let pending = $state(false);
	let error = $state('');

	async function signIn() {
		pending = true;
		error = '';

		try {
			const result = await authClient.signIn.social({
				provider: 'github',
				callbackURL: '/',
				errorCallbackURL: '/login'
			});
			if (result.error) {
				error = 'Connexion impossible. Réessaie.';
			}
		} catch {
			error = 'Connexion impossible. Vérifie ta connexion et réessaie.';
		} finally {
			pending = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 text-slate-900">
	<div class="space-y-2">
		<h1 class="text-3xl font-semibold">Get Things Done</h1>
		<p class="text-slate-600">Connecte-toi avec le compte GitHub propriétaire.</p>
	</div>

	<button
		type="button"
		onclick={signIn}
		disabled={pending}
		class="min-h-11 rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50"
	>
		{pending ? 'Redirection…' : 'Continuer avec GitHub'}
	</button>

	{#if error || data.authError}
		<p role="alert" class="text-sm text-red-700">{error || 'Connexion refusée ou interrompue.'}</p>
	{/if}
</main>
