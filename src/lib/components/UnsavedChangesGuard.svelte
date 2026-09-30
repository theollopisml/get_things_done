<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	let { dirty, objectName }: { dirty: boolean; objectName: string } = $props();
	let open = $state(false);
	let destination = $state<string | null>(null);
	let bypass = false;

	beforeNavigate((navigation) => {
		// Browser tab close/reload cannot display an application modal.
		if (bypass || !dirty || navigation.willUnload || !navigation.to) return;
		navigation.cancel();
		destination = navigation.to.url.href;
		open = true;
	});

	async function leave() {
		if (!destination) return;
		bypass = true;
		open = false;
		try {
			// The destination is the URL supplied by SvelteKit's navigation event.
			// eslint-disable-next-line svelte/no-navigation-without-resolve
			await goto(destination);
		} finally {
			bypass = false;
			destination = null;
		}
	}
</script>

<ConfirmDialog
	bind:open
	title="Quitter sans enregistrer ?"
	description={`Ce ${objectName} contient des modifications non enregistrées. Elles seront perdues si tu quittes cette page.`}
	confirmLabel="Quitter la page"
	onConfirm={leave}
/>
