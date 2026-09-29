<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let title = $state('');
	let creating = $state(false);
	let error = $state('');
	const groups = [
		{ status: 'active', label: 'En cours' },
		{ status: 'planned', label: 'Planifiés' },
		{ status: 'paused', label: 'En pause' },
		{ status: 'done', label: 'Terminés' },
		{ status: 'cancelled', label: 'Annulés' }
	] as const;

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		error = '';
		const form = new FormData();
		form.set('title', title);
		const result = await postAction('/projects?/create', form);
		if (result.ok) {
			title = '';
			await invalidateAll();
		} else error = result.error || 'Création impossible. Réessaie.';
		creating = false;
	}
</script>

<svelte:head><title>Projects · Get Things Done</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-7">
	<header>
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Vue d’ensemble</p>
		<h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Projects</h1>
	</header>
	<form
		onsubmit={create}
		class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	>
		<label for="new-project" class="sr-only">Nouveau Project</label>
		<input
			id="new-project"
			bind:value={title}
			placeholder="Nouveau Project…"
			required
			maxlength="500"
			class="ui-focus min-h-11 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
		/>
		<button type="submit" disabled={creating} class="ui-button ui-button-primary ui-focus"
			>{creating ? 'Création…' : 'Ajouter'}</button
		>
	</form>
	{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
	{#if !data.projects.length}
		<p
			class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600"
		>
			Aucun Project pour le moment.
		</p>
	{:else}
		{#each groups as group (group.status)}
			{@const items = data.projects.filter((project) => project.status === group.status)}
			{#if items.length}
				<section class="space-y-3">
					<h2 class="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
						{group.label} <span class="text-slate-400">{items.length}</span>
					</h2>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each items as project (project.id)}
							<a
								href={resolve(`/projects/${project.id}`)}
								class="ui-focus block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-400"
							>
								<div class="flex items-start justify-between gap-3">
									<h3 class="font-semibold break-words text-slate-950">{project.title}</h3>
									{#if project.toBuild}<span
											class="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900"
											>À construire</span
										>{/if}
								</div>
								{#if project.visionTitle}<p class="mt-2 text-sm text-slate-600">
										Vision : {project.visionTitle}
									</p>{/if}
								<p class="mt-3 text-sm text-slate-600">
									Tasks : {project.tasksDone} / {project.taskCount} terminées
								</p>
								{#if project.checkpointCount}<p class="text-sm text-slate-600">
										Checkpoints : {project.checkpointsDone} / {project.checkpointCount} atteints
									</p>{/if}
								{#if project.startDate || project.dueDate}<p class="mt-2 text-xs text-slate-500">
										{project.startDate
											? `Début prévu : ${project.startDate}`
											: ''}{project.startDate && project.dueDate ? ' · ' : ''}{project.dueDate
											? `Échéance : ${project.dueDate}`
											: ''}
									</p>{/if}
							</a>
						{/each}
					</div>
				</section>
			{/if}
		{/each}
	{/if}
</div>
