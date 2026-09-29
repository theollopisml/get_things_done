<script lang="ts">
	import { postAction } from '$lib/post-action';
	import { invalidateAll } from '$app/navigation';
	import type { ClassifiedKind } from '$lib/domain/capture';
	import { SvelteMap } from 'svelte/reactivity';
	import { onDestroy, tick } from 'svelte';
	import type { PageData } from './$types';

	let { entries: initialEntries }: { entries: PageData['unclassified'] } = $props();
	type Entry = PageData['unclassified'][number] & {
		draft: string;
		saved: string;
		saving: boolean;
		busy: boolean;
		error: string;
	};
	// Keep local drafts until a server action confirms each mutation.
	// svelte-ignore state_referenced_locally
	let entries = $state<Entry[]>(
		initialEntries.map((entry) => ({
			...entry,
			draft: entry.rawContent,
			saved: entry.rawContent,
			saving: false,
			busy: false,
			error: ''
		}))
	);
	let processing = $state(false);
	let skipped = $state<string[]>([]);
	let message = $state('');
	const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	const inFlight = new SvelteMap<string, Promise<boolean>>();
	const statusTimers = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	let mounted = true;
	let current = $derived(
		entries
			.filter((entry) => !skipped.includes(entry.id))
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0]
	);

	async function focusCurrent() {
		if (!processing) return;
		await tick();
		if (current) document.getElementById(`entry-${current.id}`)?.focus();
	}

	function form(id: string, values: Record<string, string>) {
		const data = new FormData();
		data.set('id', id);
		for (const [key, value] of Object.entries(values)) data.set(key, value);
		return data;
	}

	function scheduleSave(entry: Entry) {
		clearTimeout(timers.get(entry.id));
		entry.error = '';
		if (entry.draft !== entry.saved)
			timers.set(
				entry.id,
				setTimeout(() => void save(entry), 600)
			);
	}

	async function save(entry: Entry): Promise<boolean> {
		clearTimeout(timers.get(entry.id));
		if (entry.draft === entry.saved) return true;
		const pending = inFlight.get(entry.id);
		if (pending) {
			if (!(await pending)) return false;
			return save(entry);
		}
		if (!entry.draft.trim()) {
			entry.error = 'Une capture ne peut pas être vide.';
			return false;
		}
		const snapshot = entry.draft;
		entry.saving = true;
		entry.error = '';
		const request = postAction(
			'/review?/updateUnclassified',
			form(entry.id, { rawContent: snapshot })
		).then((result) => {
			if (result.ok) entry.saved = snapshot;
			else entry.error = result.error || 'Sauvegarde impossible. Réessaie.';
			return result.ok;
		});
		inFlight.set(entry.id, request);
		const ok = await request;
		inFlight.delete(entry.id);
		entry.saving = false;
		if (ok && entry.draft !== entry.saved) scheduleSave(entry);
		return ok;
	}

	async function classify(entry: Entry, kind: ClassifiedKind) {
		if (entry.busy) return;
		entry.busy = true;
		if (!(await save(entry))) {
			entry.busy = false;
			return;
		}
		entry.error = '';
		const result = await postAction('/review?/classifyUnclassified', form(entry.id, { kind }));
		if (result.ok) {
			clearTimeout(timers.get(entry.id));
			entries = entries.filter((item) => item.id !== entry.id);
			message = 'Capture classée.';
			await focusCurrent();
		} else entry.error = result.error || 'Classification impossible. Réessaie.';
		entry.busy = false;
	}

	async function remove(entry: Entry) {
		if (entry.busy) return;
		entry.busy = true;
		entry.error = '';
		const result = await postAction('/review?/deleteUnclassified', form(entry.id, {}));
		if (result.ok) {
			clearTimeout(timers.get(entry.id));
			entries = entries.filter((item) => item.id !== entry.id);
			message = 'Capture supprimée.';
			await focusCurrent();
		} else entry.error = result.error || 'Suppression impossible. Réessaie.';
		entry.busy = false;
	}

	async function later(entry: Entry) {
		skipped = [...skipped, entry.id];
		message = 'Capture laissée pour plus tard.';
		await focusCurrent();
	}

	async function retry(entry: Entry) {
		if (entry.busy) return;
		entry.busy = true;
		entry.error = '';
		if (!(await save(entry))) {
			entry.busy = false;
			return;
		}
		const result = await postAction('/review?/retryUnclassified', form(entry.id, {}));
		message = result.ok ? 'Classement relancé en arrière-plan.' : '';
		if (!result.ok) entry.error = result.error || 'Relance impossible. Réessaie.';
		else
			statusTimers.set(
				entry.id,
				setTimeout(() => void pollStatus(entry), 1200)
			);
		entry.busy = false;
	}

	async function pollStatus(entry: Entry) {
		if (!mounted) return;
		const result = await postAction('/?/status', form(entry.id, {}));
		if (!mounted) return;
		if (result.ok && result.data?.status === 'classified') {
			entries = entries.filter((item) => item.id !== entry.id);
			message = 'Capture classée.';
			await invalidateAll();
			return;
		}
		if (result.ok && result.data?.status === 'failed') {
			entry.error = 'Jev n’a pas pu classer cette capture. Tu peux réessayer ou choisir un type.';
			return;
		}
		statusTimers.set(
			entry.id,
			setTimeout(() => void pollStatus(entry), 1500)
		);
	}

	onDestroy(() => {
		mounted = false;
		for (const timer of timers.values()) clearTimeout(timer);
		for (const timer of statusTimers.values()) clearTimeout(timer);
	});
</script>

<div class="space-y-7">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div class="space-y-2">
			<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
				Captures à clarifier
			</p>
			<h2 class="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
				Non classées <span class="text-slate-400">{entries.length}</span>
			</h2>
		</div>
		{#if entries.length}
			<button
				type="button"
				class="ui-button ui-button-primary ui-focus"
				onclick={() => {
					processing = !processing;
					skipped = [];
				}}
			>
				{processing ? 'Voir la liste' : 'Traiter une par une'}
			</button>
		{/if}
	</div>
	{#if message}<p role="status" class="text-sm text-slate-600">{message}</p>{/if}
	{#if !entries.length}
		<div
			class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600"
		>
			Aucune capture non classée.
		</div>
	{:else if processing && !current}
		<div class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
			Session terminée. Les captures laissées pour plus tard restent ici.
		</div>
	{:else}
		<div class="space-y-4">
			{#each processing ? (current ? [current] : []) : entries as entry (entry.id)}
				<article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
					<div class="mb-3 flex items-center justify-between gap-3 text-xs text-slate-500">
						<span
							>{new Intl.DateTimeFormat('fr-FR', {
								dateStyle: 'medium',
								timeStyle: 'short'
							}).format(entry.createdAt)}</span
						>
						<span role="status"
							>{entry.saving
								? 'Sauvegarde…'
								: entry.draft === entry.saved
									? 'Enregistré'
									: 'Non enregistré'}</span
						>
					</div>
					<label for={`entry-${entry.id}`} class="sr-only">Modifier la capture</label>
					<textarea
						id={`entry-${entry.id}`}
						bind:value={entry.draft}
						oninput={() => scheduleSave(entry)}
						disabled={entry.busy}
						rows="4"
						class="ui-focus w-full resize-y rounded-lg border border-slate-200 p-3 text-sm leading-6"
					></textarea>
					{#if entry.requestedDueDate}
						<p class="mt-2 text-xs text-slate-600">Échéance choisie · {entry.requestedDueDate}</p>
					{/if}
					{#if entry.error}<p role="alert" class="mt-2 text-sm text-red-700">{entry.error}</p>{/if}
					<div class="mt-4 flex flex-wrap gap-2">
						<button
							type="button"
							disabled={entry.busy}
							class="ui-button ui-button-quiet ui-focus"
							onclick={() => retry(entry)}>Réessayer Jev</button
						>
						<button
							type="button"
							disabled={entry.busy}
							class="ui-button ui-button-primary ui-focus"
							onclick={() => classify(entry, 'task')}>Task</button
						>
						<button
							type="button"
							disabled={entry.busy}
							class="ui-button ui-button-quiet ui-focus"
							onclick={() => classify(entry, 'project')}>Project</button
						>
						{#if processing}<button
								type="button"
								class="ui-button ui-button-quiet ui-focus"
								onclick={() => later(entry)}>Plus tard</button
							>{/if}
						<button
							type="button"
							disabled={entry.busy}
							class="ui-button ui-button-quiet ui-focus text-red-700"
							onclick={() => remove(entry)}>Supprimer</button
						>
						{#if entry.error && entry.draft !== entry.saved}<button
								type="button"
								class="ui-button ui-button-quiet ui-focus"
								onclick={() => save(entry)}>Réessayer</button
							>{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}
</div>
