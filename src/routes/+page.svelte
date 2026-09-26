<script lang="ts">
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import { authClient } from '$lib/auth-client';

	let pending = $state(false);
	let error = $state('');

	async function signOut() {
		pending = true;
		error = '';
		try {
			const result = await authClient.signOut();
			if (result.error) {
				error = 'Déconnexion impossible. Réessaie.';
				return;
			}
			window.location.assign('/login');
		} catch {
			error = 'Déconnexion impossible. Vérifie ta connexion et réessaie.';
		} finally {
			pending = false;
		}
	}
</script>

<main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-3 px-6 text-slate-900">
	<ListTodo size={32} aria-hidden="true" />
	<h1 class="text-3xl font-semibold">Get Things Done</h1>
	<p class="text-slate-600">Le projet prend forme.</p>
	<button
		type="button"
		onclick={signOut}
		disabled={pending}
		class="mt-4 min-h-11 self-start rounded-md border border-slate-400 px-4 py-2 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:opacity-50"
	>
		{pending ? 'Déconnexion…' : 'Se déconnecter'}
	</button>
	{#if error}
		<p role="alert" class="text-sm text-red-700">{error}</p>
	{/if}
</main>
