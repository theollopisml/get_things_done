<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});

	const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
	const kindLabels = { task: 'Task', project: 'Project', vision: 'Vision' } as const;

	async function submitReview(event: SubmitEvent, id: string, action: 'confirm' | 'relation') {
		event.preventDefault();
		if (busy) return;
		busy = id;
		errors[id] = '';
		const result = await postAction(
			`/review?/${action}`,
			new FormData(event.currentTarget as HTMLFormElement)
		);
		if (result.ok) await invalidateAll();
		else errors[id] = result.error || 'Action impossible. Réessaie.';
		busy = null;
	}
</script>

<svelte:head>
	<title>Revue · Get Things Done</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-7">
	<header class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
			Classifications Jev
		</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Revue</h1>
	</header>

	<nav aria-label="Filtrer la revue" class="flex flex-wrap gap-2">
		<a
			href={resolve('/review')}
			aria-current={!data.onlyUnreviewed ? 'page' : undefined}
			class="ui-button ui-focus {!data.onlyUnreviewed ? 'ui-button-primary' : 'ui-button-quiet'}"
			>Toutes</a
		>
		<form method="GET" action={resolve('/review')}>
			<button
				type="submit"
				name="filter"
				value="unreviewed"
				aria-pressed={data.onlyUnreviewed}
				class="ui-button ui-focus {data.onlyUnreviewed ? 'ui-button-primary' : 'ui-button-quiet'}"
				>À revoir</button
			>
		</form>
	</nav>

	{#if !data.entries.length}
		<div
			class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600"
		>
			{data.onlyUnreviewed
				? 'Aucune classification à revoir.'
				: 'Aucune classification Jev pour le moment.'}
		</div>
	{:else}
		<div class="space-y-4">
			{#each data.entries as entry (entry.id)}
				<article
					class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
				>
					<div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
						<time datetime={entry.createdAt.toISOString()}>{date.format(entry.createdAt)}</time>
						<span class="font-medium {entry.reviewedAt ? 'text-slate-600' : 'text-amber-700'}">
							{entry.reviewedAt ? 'Confirmé' : 'À revoir'}
						</span>
					</div>
					<p class="text-sm leading-6 break-words whitespace-pre-wrap text-slate-800">
						{entry.rawContent}
					</p>
					<div class="border-t border-slate-100 pt-3 text-sm text-slate-600">
						<span class="font-semibold text-slate-900"
							>{kindLabels[entry.kind]} · {entry.title}</span
						>
						{#if entry.kind === 'task'}
							<span> · {entry.parentTitle ? `Projet : ${entry.parentTitle}` : 'Sans projet'}</span>
						{:else if entry.kind === 'project'}
							<span> · {entry.parentTitle ? `Vision : ${entry.parentTitle}` : 'Sans vision'}</span>
						{/if}
						{#if entry.objectDeleted}<span class="ml-2 text-red-700">Objet supprimé</span>{/if}
					</div>
					<div class="flex flex-wrap items-end gap-2">
						{#if !entry.reviewedAt}
							<form
								method="POST"
								action="?/confirm"
								onsubmit={(event) => submitReview(event, entry.id, 'confirm')}
							>
								<input type="hidden" name="id" value={entry.id} />
								<button
									type="submit"
									disabled={busy === entry.id}
									class="ui-button ui-button-primary ui-focus"
								>
									Confirmer
								</button>
							</form>
						{/if}
						{#if (entry.kind === 'task' || entry.kind === 'project') && !entry.objectDeleted}
							{@const options =
								entry.kind === 'task' ? data.parents.projects : data.parents.visions}
							<form
								method="POST"
								action="?/relation"
								onsubmit={(event) => submitReview(event, entry.id, 'relation')}
								class="flex flex-wrap items-end gap-2"
							>
								<input type="hidden" name="id" value={entry.id} />
								<label class="grid gap-1 text-xs font-medium text-slate-600">
									{entry.kind === 'task' ? 'Projet' : 'Vision'}
									<select
										name="relationId"
										disabled={busy === entry.id}
										class="ui-focus min-h-10 max-w-56 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900"
										value={entry.parentId ?? ''}
									>
										<option value="">Aucun rattachement</option>
										{#if entry.parentId && !options.some((option) => option.id === entry.parentId)}
											<option value={entry.parentId}
												>{entry.parentTitle ?? 'Parent indisponible'} (indisponible)</option
											>
										{/if}
										{#each options as option (option.id)}
											<option value={option.id}>{option.title}</option>
										{/each}
									</select>
								</label>
								<button
									type="submit"
									disabled={busy === entry.id}
									class="ui-button ui-button-quiet ui-focus">Enregistrer</button
								>
							</form>
						{/if}
					</div>
					{#if errors[entry.id]}<p role="alert" class="text-sm text-red-700">
							{errors[entry.id]}
						</p>{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>
