<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import { postAction } from '$lib/post-action';
	import UnclassifiedCaptures from './UnclassifiedCaptures.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let busy = $state<string | null>(null);
	let busyAll = $state(false);
	let editing = $state<string | null>(null);
	let modalOpen = $state(false);
	let errors = $state<Record<string, string>>({});
	let pageError = $state('');
	let unreviewedIds = $derived(
		data.entries.filter((entry) => !entry.reviewedAt).map((entry) => entry.id)
	);
	let showUnclassified = $derived(data.filter === 'unclassified');
	let activeEntry = $derived(data.entries.find((entry) => entry.id === editing));
	let editTrigger: HTMLButtonElement | undefined;
	let selectedKind = $state('');
	let selectedRelation = $state('');
	let parentSearch = $state('');

	const date = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
	const kindLabels = { task: 'Task', project: 'Project' } as const;

	function openEditor(entry: PageData['entries'][number], trigger: HTMLButtonElement) {
		const options = entry.kind === 'task' ? data.parents.projects : [];
		editTrigger = trigger;
		editing = entry.id;
		selectedKind = '';
		selectedRelation =
			entry.parentId && options.some((option) => option.id === entry.parentId)
				? entry.parentId
				: '';
		parentSearch = '';
		errors[entry.id] = '';
		modalOpen = true;
	}

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
			modalOpen = false;
			editing = null;
			await invalidateAll();
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
			modalOpen = false;
			editing = null;
			await invalidateAll();
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
		{#if unreviewedIds.length && !showUnclassified}
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
				aria-current={data.onlyUnreviewed && !showUnclassified ? 'page' : undefined}
				class="ui-button ui-focus {data.onlyUnreviewed && !showUnclassified
					? 'ui-button-primary'
					: 'ui-button-quiet'}">À revoir</a
			>
			<form method="GET" action={resolve('/review')}>
				<button
					type="submit"
					name="filter"
					value="all"
					aria-pressed={!data.onlyUnreviewed && !showUnclassified}
					class="ui-button ui-focus {!data.onlyUnreviewed && !showUnclassified
						? 'ui-button-primary'
						: 'ui-button-quiet'}">Toutes</button
				>
			</form>
			{#if data.unclassified.length}
				<a
					href={resolve('/review?filter=unclassified')}
					aria-current={showUnclassified ? 'page' : undefined}
					class="ui-button ui-focus {showUnclassified ? 'ui-button-primary' : 'ui-button-quiet'}"
					>Non classées ({data.unclassified.length})</a
				>
			{/if}
		</nav>
	</div>

	{#if showUnclassified}
		<UnclassifiedCaptures entries={data.unclassified} />
	{:else if !data.entries.length}
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
							{/if}
							{#if entry.objectDeleted}<span class="ml-2 text-red-700">Objet supprimé</span>{/if}
						</div>
						{#if !entry.reviewedAt || !entry.objectDeleted}
							<div
								class:review-actions-open={modalOpen && editing === entry.id}
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
										aria-haspopup="dialog"
										disabled={busyAll || busy === entry.id}
										onclick={(event) => openEditor(entry, event.currentTarget)}
									>
										Modifier
									</button>
								{/if}
							</div>
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

<Dialog.Root bind:open={modalOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/65" />
		{#if activeEntry && !activeEntry.objectDeleted}
			{@const entry = activeEntry}
			<Dialog.Content
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					editTrigger?.focus();
				}}
				onEscapeKeydown={(event) => {
					if (busy) event.preventDefault();
				}}
				onInteractOutside={(event) => {
					if (busy) event.preventDefault();
				}}
				class="fixed top-1/2 left-1/2 z-50 flex max-h-[min(90dvh,48rem)] w-[min(calc(100vw-2rem),46rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
			>
				<div class="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-6">
					<div>
						<Dialog.Title class="text-xl font-semibold text-slate-950"
							>Modifier la classification</Dialog.Title
						>
						<Dialog.Description class="mt-1 text-sm text-slate-600"
							>Corrige le type ou le rattachement choisi par Jev.</Dialog.Description
						>
					</div>
					<button
						type="button"
						disabled={busy === entry.id}
						onclick={() => (modalOpen = false)}
						class="ui-button ui-button-quiet ui-focus shrink-0"
						aria-label="Fermer la modale">Fermer</button
					>
				</div>
				<div class="space-y-5 overflow-y-auto p-4 sm:p-6">
					<p class="text-sm break-words whitespace-pre-wrap text-slate-700">{entry.rawContent}</p>
					<div class="grid items-stretch gap-3 {entry.kind === 'task' ? 'sm:grid-cols-2' : ''}">
						<section class="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
							<div class="sm:min-h-24">
								<h2 class="flex items-center gap-2 text-sm font-semibold text-slate-950">
									<span
										class="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
										>1</span
									>
									Type d’objet
								</h2>
								<p class="mt-2 text-xs leading-5 text-slate-600">
									Actuel : {kindLabels[entry.kind]}. Le titre et la description seront conservés.
								</p>
							</div>
							<form
								method="POST"
								action="?/type"
								onsubmit={(event) => submitReview(event, entry.id, 'type')}
								class="mt-4 flex flex-1 flex-col gap-4"
							>
								<input type="hidden" name="id" value={entry.id} />
								<input type="hidden" name="kind" value={selectedKind} />
								<fieldset class="space-y-2">
									<legend class="mb-2 text-xs font-medium text-slate-700">Nouveau type</legend>
									{#each Object.entries(kindLabels) as [kind, label] (kind)}
										{#if kind !== entry.kind}
											<label
												class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2 {selectedKind ===
												kind
													? 'border-slate-900 bg-white text-slate-950 shadow-sm'
													: 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}"
											>
												<input
													type="radio"
													name="kindChoice"
													bind:group={selectedKind}
													value={kind}
													disabled={busy === entry.id}
													class="sr-only"
												/>
												<span>{label}</span>
												<span
													aria-hidden="true"
													class="ml-auto size-4 rounded-full border {selectedKind === kind
														? 'border-slate-900 bg-slate-900 shadow-[inset_0_0_0_3px_var(--color-white)]'
														: 'border-slate-300 bg-white'}"
												></span>
											</label>
										{/if}
									{/each}
								</fieldset>
								<p class="text-xs leading-5 text-slate-500">
									Le nouvel objet sera sans rattachement.
								</p>
								<button
									type="submit"
									disabled={busy === entry.id || !selectedKind}
									class="ui-button ui-button-primary ui-focus mt-auto w-full"
									>Changer le type</button
								>
							</form>
						</section>
						{#if entry.kind === 'task'}
							{@const options = data.parents.projects}
							{@const filteredOptions = options.filter((option) =>
								option.title
									.toLocaleLowerCase('fr')
									.includes(parentSearch.trim().toLocaleLowerCase('fr'))
							)}
							<section class="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4">
								<div class="sm:min-h-24">
									<h2 class="flex items-center gap-2 text-sm font-semibold text-slate-950">
										<span
											class="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs text-white"
											>2</span
										>
										Rattachement
									</h2>
									<p class="mt-2 text-xs leading-5 text-slate-600">
										Actuel : <span
											class="inline-block max-w-40 truncate align-bottom font-medium text-slate-800"
											title={entry.parentTitle ?? undefined}>{entry.parentTitle ?? 'Aucun'}</span
										>. Choisis un Project.
									</p>
								</div>
								<form
									method="POST"
									action="?/relation"
									onsubmit={(event) => submitReview(event, entry.id, 'relation')}
									class="mt-4 flex flex-1 flex-col gap-4"
								>
									<input type="hidden" name="id" value={entry.id} />
									<input type="hidden" name="relationId" value={selectedRelation} />
									<div>
										<label
											for="review-parent-search"
											class="mb-2 block text-xs font-medium text-slate-700">Projet souhaité</label
										>
										<input
											id="review-parent-search"
											type="search"
											bind:value={parentSearch}
											placeholder={options.length === 0 ? 'Aucun choix disponible' : 'Rechercher…'}
											disabled={busy === entry.id || options.length === 0}
											class="ui-focus min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400"
										/>
										{#if options.length === 0}
											<p class="mt-2 text-xs leading-5 text-slate-600">
												Aucun Project disponible : seuls les Projects planifiés ou en cours peuvent
												accueillir une Task.
											</p>
										{/if}
									</div>
									<fieldset class="min-w-0 space-y-2">
										<legend class="sr-only">Rattachement</legend>
										<div class="max-h-40 space-y-2 overflow-y-auto pr-1">
											<label
												class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2 {selectedRelation ===
												''
													? 'border-slate-900 bg-white text-slate-950 shadow-sm'
													: 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}"
											>
												<input
													type="radio"
													name="relationChoice"
													bind:group={selectedRelation}
													value=""
													disabled={busy === entry.id}
													class="sr-only"
												/>
												<span>Aucun rattachement</span>
												<span
													aria-hidden="true"
													class="ml-auto size-4 shrink-0 rounded-full border {selectedRelation ===
													''
														? 'border-slate-900 bg-slate-900 shadow-[inset_0_0_0_3px_var(--color-white)]'
														: 'border-slate-300 bg-white'}"
												></span>
											</label>
											{#each filteredOptions as option (option.id)}
												<label
													class="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2 {selectedRelation ===
													option.id
														? 'border-slate-900 bg-white text-slate-950 shadow-sm'
														: 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}"
												>
													<input
														type="radio"
														name="relationChoice"
														bind:group={selectedRelation}
														value={option.id}
														disabled={busy === entry.id}
														class="sr-only"
													/>
													<span class="min-w-0 break-words">{option.title}</span>
													<span
														aria-hidden="true"
														class="ml-auto size-4 shrink-0 rounded-full border {selectedRelation ===
														option.id
															? 'border-slate-900 bg-slate-900 shadow-[inset_0_0_0_3px_var(--color-white)]'
															: 'border-slate-300 bg-white'}"
													></span>
												</label>
											{/each}
											{#if parentSearch && filteredOptions.length === 0}<p
													class="px-1 py-2 text-xs text-slate-500"
												>
													Aucun résultat.
												</p>{/if}
										</div>
									</fieldset>
									{#if entry.parentId && !options.some((option) => option.id === entry.parentId)}<p
											class="text-xs text-amber-700"
										>
											Le rattachement actuel n’est plus disponible.
										</p>{/if}
									<button
										type="submit"
										disabled={busy === entry.id || selectedRelation === (entry.parentId ?? '')}
										class="ui-button ui-button-primary ui-focus mt-auto w-full"
										>Enregistrer le rattachement</button
									>
								</form>
							</section>
						{/if}
					</div>
					{#if errors[entry.id]}<p role="alert" class="text-sm text-red-700">
							{errors[entry.id]}
						</p>{/if}
				</div>
			</Dialog.Content>
		{/if}
	</Dialog.Portal>
</Dialog.Root>

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
