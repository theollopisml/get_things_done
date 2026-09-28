<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state<string | null>(null);
	let busyAll = $state(false);
	let editing = $state<string | null>(null);
	let errors = $state<Record<string, string>>({});
	let pageError = $state('');
	let unreviewedIds = $derived(
		data.entries.filter((entry) => !entry.reviewedAt).map((entry) => entry.id)
	);

	const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
	const kindLabels = { task: 'Task', project: 'Project', vision: 'Vision' } as const;

	async function submitReview(
		event: SubmitEvent,
		id: string,
		action: 'confirm' | 'relation' | 'type'
	) {
		event.preventDefault();
		if (busy || busyAll) return;
		busy = id;
		errors[id] = '';
		const result = await postAction(
			`/review?/${action}`,
			new FormData(event.currentTarget as HTMLFormElement)
		);
		if (result.ok) {
			await invalidateAll();
			editing = null;
		} else errors[id] = result.error || 'Action impossible. Réessaie.';
		busy = null;
	}

	async function submitAll(event: SubmitEvent) {
		event.preventDefault();
		if (busy || busyAll) return;
		busyAll = true;
		pageError = '';
		const result = await postAction(
			'/review?/confirmAll',
			new FormData(event.currentTarget as HTMLFormElement)
		);
		if (result.ok) {
			await invalidateAll();
			editing = null;
		} else pageError = result.error || 'Confirmation impossible. Réessaie.';
		busyAll = false;
	}
</script>

<svelte:head>
	<title>Revue · Get Things Done</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-7">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div class="space-y-2">
			<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
				Classifications Jev
			</p>
			<h1 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Revue</h1>
		</div>
		{#if unreviewedIds.length}
			<form method="POST" action="?/confirmAll" onsubmit={submitAll}>
				{#each unreviewedIds as id (id)}<input type="hidden" name="ids" value={id} />{/each}
				<button
					type="submit"
					disabled={busyAll || busy !== null}
					class="ui-button ui-button-primary ui-focus"
				>
					{busyAll ? 'Confirmation…' : `Tout confirmer (${unreviewedIds.length})`}
				</button>
			</form>
		{/if}
	</header>
	{#if pageError}<p role="alert" class="text-sm text-red-700">{pageError}</p>{/if}

	<div class="flex flex-wrap items-center justify-between gap-3">
		<nav aria-label="Filtrer la revue" class="flex flex-wrap gap-2">
			<a
				href={resolve('/review')}
				aria-current={data.onlyUnreviewed ? 'page' : undefined}
				class="ui-button ui-focus {data.onlyUnreviewed ? 'ui-button-primary' : 'ui-button-quiet'}"
				>À revoir</a
			>
			<form method="GET" action={resolve('/review')}>
				<button
					type="submit"
					name="filter"
					value="all"
					aria-pressed={!data.onlyUnreviewed}
					class="ui-button ui-focus {!data.onlyUnreviewed
						? 'ui-button-primary'
						: 'ui-button-quiet'}">Toutes</button
				>
			</form>
		</nav>
		<a href={resolve('/inbox')} class="ui-button ui-button-quiet ui-focus">Inbox de secours</a>
	</div>

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
					class="review-card space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
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
					<div
						class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3"
					>
						<div class="min-w-0 text-sm text-slate-600">
							<span class="font-semibold text-slate-900"
								>{kindLabels[entry.kind]} · {entry.title}</span
							>
							{#if entry.kind === 'task'}
								<span>
									· {entry.parentTitle ? `Projet : ${entry.parentTitle}` : 'Sans projet'}</span
								>
							{:else if entry.kind === 'project'}
								<span>
									· {entry.parentTitle ? `Vision : ${entry.parentTitle}` : 'Sans vision'}</span
								>
							{/if}
							{#if entry.objectDeleted}<span class="ml-2 text-red-700">Objet supprimé</span>{/if}
						</div>
						{#if !entry.reviewedAt || !entry.objectDeleted}
							<div
								class:review-actions-open={editing === entry.id}
								class="review-actions flex flex-wrap items-center gap-2"
							>
								{#if !entry.reviewedAt}
									<form
										method="POST"
										action="?/confirm"
										onsubmit={(event) => submitReview(event, entry.id, 'confirm')}
									>
										<input type="hidden" name="id" value={entry.id} />
										<button
											type="submit"
											disabled={busyAll || busy === entry.id}
											class="ui-button ui-button-primary ui-focus">Confirmer</button
										>
									</form>
								{/if}
								{#if !entry.objectDeleted}
									<button
										type="button"
										class="ui-button ui-button-quiet ui-focus"
										aria-expanded={editing === entry.id}
										disabled={busyAll || busy === entry.id}
										onclick={() => (editing = editing === entry.id ? null : entry.id)}
									>
										{editing === entry.id ? 'Fermer' : 'Modifier'}
									</button>
								{/if}
							</div>
						{/if}
					</div>
					{#if editing === entry.id && !entry.objectDeleted}
						<div
							class="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
						>
							<section class="space-y-3">
								<div>
									<h2 class="text-sm font-semibold text-slate-900">1. Type d’objet</h2>
									<p class="mt-1 text-xs leading-5 text-slate-600">
										Actuellement : {kindLabels[entry.kind]}. Le nouvel objet reprendra son titre et
										sa description, sans rattachement.
									</p>
								</div>
								<form
									method="POST"
									action="?/type"
									onsubmit={(event) => submitReview(event, entry.id, 'type')}
									class="space-y-3"
								>
									<input type="hidden" name="id" value={entry.id} />
									<label class="grid gap-1 text-xs font-medium text-slate-700">
										Nouveau type
										<select
											name="kind"
											required
											disabled={busy === entry.id}
											class="ui-focus min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
											value=""
										>
											<option value="" disabled>Choisir un autre type</option>
											{#each Object.entries(kindLabels) as [kind, label] (kind)}
												{#if kind !== entry.kind}<option value={kind}>{label}</option>{/if}
											{/each}
										</select>
									</label>
									<button
										type="submit"
										disabled={busy === entry.id}
										class="ui-button ui-button-quiet ui-focus">Changer le type</button
									>
								</form>
							</section>
							{#if entry.kind === 'task' || entry.kind === 'project'}
								{@const options =
									entry.kind === 'task' ? data.parents.projects : data.parents.visions}
								<section
									class="space-y-3 border-t border-slate-200 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4"
								>
									<div>
										<h2 class="text-sm font-semibold text-slate-900">2. Rattachement</h2>
										<p class="mt-1 text-xs leading-5 text-slate-600">
											{entry.kind === 'task' ? 'Projet de cette Task' : 'Vision de ce Project'} · actuel
											: {entry.parentTitle ?? 'aucun'}
										</p>
									</div>
									<form
										method="POST"
										action="?/relation"
										onsubmit={(event) => submitReview(event, entry.id, 'relation')}
										class="space-y-3"
									>
										<input type="hidden" name="id" value={entry.id} />
										<label class="grid gap-1 text-xs font-medium text-slate-700">
											{entry.kind === 'task' ? 'Projet souhaité' : 'Vision souhaitée'}
											<select
												name="relationId"
												disabled={busy === entry.id}
												class="ui-focus min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
												value={entry.parentId ?? ''}
											>
												<option value="">Aucun rattachement</option>
												{#if entry.parentId && !options.some((option) => option.id === entry.parentId)}
													<option value={entry.parentId}
														>{entry.parentTitle ?? 'Parent indisponible'} (indisponible)</option
													>
												{/if}
												{#each options as option (option.id)}<option value={option.id}
														>{option.title}</option
													>{/each}
											</select>
										</label>
										<button
											type="submit"
											disabled={busy === entry.id}
											class="ui-button ui-button-quiet ui-focus">Enregistrer le rattachement</button
										>
									</form>
								</section>
							{/if}
						</div>
					{/if}
					{#if errors[entry.id]}<p role="alert" class="text-sm text-red-700">
							{errors[entry.id]}
						</p>{/if}
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	@media (hover: hover) and (min-width: 640px) {
		.review-actions {
			opacity: 0;
			transition: opacity 150ms ease;
		}

		.review-card:hover .review-actions,
		.review-card:focus-within .review-actions,
		.review-actions-open {
			opacity: 1;
		}
	}
</style>
