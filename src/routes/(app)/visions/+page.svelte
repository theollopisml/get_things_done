<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let title = $state('');
	let creating = $state(false);
	let error = $state('');
	const groups = [
		{ status: 'active', label: 'Actives' },
		{ status: 'paused', label: 'En pause' },
		{ status: 'archived', label: 'Archivées' }
	] as const;

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		error = '';
		const form = new FormData();
		form.set('title', title);
		const result = await postAction('/visions?/create', form);
		if (result.ok) {
			title = '';
			await invalidateAll();
		} else error = result.error || 'Création impossible. Réessaie.';
		creating = false;
	}
</script>

<svelte:head><title>Visions · Get Things Done</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-7">
	<header>
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Vue d’ensemble</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Visions</h1>
	</header>
	<form
		method="POST"
		action="?/create"
		onsubmit={create}
		class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	>
		<label for="new-vision" class="sr-only">Nouvelle Vision</label>
		<input
			id="new-vision"
			name="title"
			bind:value={title}
			placeholder="Nouvelle Vision…"
			required
			maxlength="500"
			class="ui-focus min-h-11 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
		/>
		<button type="submit" disabled={creating} class="ui-button ui-button-primary ui-focus"
			>{creating ? 'Création…' : 'Ajouter'}</button
		>
	</form>
	{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
	{#if !data.visions.length}
		<p
			class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600"
		>
			Aucune Vision pour le moment.
		</p>
	{:else}
		{#each groups as group (group.status)}
			{@const items = data.visions.filter((vision) => vision.status === group.status)}
			{#if items.length}
				<section class="space-y-3">
					<h2 class="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
						{group.label} <span class="text-slate-400">{items.length}</span>
					</h2>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each items as vision (vision.id)}
							<article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
								<h3 class="font-semibold break-words text-slate-950">{vision.title}</h3>
								{#if vision.description}<p
										class="mt-2 line-clamp-2 text-sm whitespace-pre-wrap text-slate-600"
									>
										{vision.description}
									</p>{/if}
							</article>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	{/if}
</div>
