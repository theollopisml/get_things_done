<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { postAction } from '$lib/post-action';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state(false);
	let error = $state('');
	let message = $state('');
	let purgeTarget = $state<{ id: string; kind: string; title: string } | null>(null);
	let purgeOpen = $state(false);
	const labels = { task: 'Task', project: 'Project', checkpoint: 'Checkpoint' };

	async function act(action: 'restore' | 'purge', kind: string, id: string) {
		if (busy) return;
		busy = true;
		error = '';
		message = '';
		const form = new FormData();
		form.set('kind', kind);
		form.set('id', id);
		if (action === 'purge') form.set('confirmation', 'PURGER');
		const result = await postAction(`/trash?/${action}`, form);
		if (result.ok) {
			purgeOpen = false;
			purgeTarget = null;
			message = action === 'restore' ? 'Objet restauré.' : 'Objet supprimé définitivement.';
			await invalidateAll();
		} else error = result.error || 'Action impossible. Réessaie.';
		busy = false;
	}
</script>

<svelte:head><title>Corbeille · Get Things Done</title></svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<header>
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
			Gestion des données
		</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Corbeille</h1>
		<p class="mt-2 text-sm text-slate-600">
			Les objets restent récupérables pendant {data.retentionDays} jours. La purge est définitive.
		</p>
	</header>
	{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
	{#if message}<p role="status" class="text-sm text-slate-700">{message}</p>{/if}
	{#if !data.items.length}<p
			class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600"
		>
			La corbeille est vide.
		</p>{/if}
	<ul class="space-y-3">
		{#each data.items as item (item.kind + item.id)}
			<li class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="font-semibold break-words text-slate-950">{item.title}</p>
						<p class="mt-1 text-xs text-slate-500">
							{labels[item.kind]} · Supprimé le {new Date(item.deletedAt).toLocaleDateString(
								'fr-FR'
							)}
						</p>
						{#if item.kind === 'project'}<p class="mt-1 text-xs text-slate-600">
								Ses Tasks restent autonomes. Restaure ensuite ses Checkpoints séparément.
							</p>{/if}
					</div>
					<div class="flex flex-wrap gap-2">
						<button
							type="button"
							disabled={busy}
							onclick={() => act('restore', item.kind, item.id)}
							class="ui-button ui-button-quiet ui-focus">Restaurer</button
						>
						<button
							type="button"
							disabled={busy}
							onclick={() => {
								purgeTarget = item;
								error = '';
								purgeOpen = true;
							}}
							class="ui-button ui-button-quiet ui-focus text-red-700">Purger</button
						>
					</div>
				</div>
			</li>
		{/each}
	</ul>
	<ConfirmDialog
		bind:open={purgeOpen}
		title="Purger définitivement ?"
		description={`« ${purgeTarget?.title ?? ''} » et sa capture liée seront supprimés sans possibilité de restauration. Purger un Project supprime aussi ses Checkpoints.`}
		confirmLabel="Purger définitivement"
		onConfirm={async () => {
			if (purgeTarget) await act('purge', purgeTarget.kind, purgeTarget.id);
		}}
		{busy}
		{error}
	/>
</div>
