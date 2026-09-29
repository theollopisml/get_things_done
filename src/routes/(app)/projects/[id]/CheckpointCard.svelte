<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	type Checkpoint = PageData['project']['checkpoints'][number];
	let {
		checkpoint,
		projectId,
		onUpdated
	}: {
		checkpoint: Checkpoint;
		projectId: string;
		onUpdated: () => Promise<void>;
	} = $props();
	let editing = $state(false);
	let preview = $state(false);
	let busy = $state(false);
	let saving = $state(false);
	let error = $state('');
	// Keep a local draft while the page reloads after other actions.
	// svelte-ignore state_referenced_locally
	let value = $state({
		title: checkpoint.title,
		description: checkpoint.description ?? '',
		targetDate: checkpoint.targetDate ?? ''
	});
	let saved = $state(JSON.stringify(value));
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<boolean> | null = null;
	let path = $derived(`/projects/${projectId}`);

	function schedule() {
		clearTimeout(timer);
		error = '';
		if (JSON.stringify(value) !== saved) timer = setTimeout(() => void save(), 600);
	}

	async function save(): Promise<boolean> {
		clearTimeout(timer);
		if (inFlight) {
			if (!(await inFlight)) return false;
			return save();
		}
		const snapshot = JSON.stringify(value);
		if (snapshot === saved) return true;
		if (!value.title.trim()) {
			error = 'Le titre ne peut pas être vide.';
			return false;
		}
		saving = true;
		const fields = new FormData();
		fields.set('id', checkpoint.id);
		for (const [key, field] of Object.entries(JSON.parse(snapshot) as Record<string, string>))
			fields.set(key, field);
		inFlight = postAction(`${path}?/saveCheckpoint`, fields).then((response) => {
			if (response.ok) saved = snapshot;
			else error = response.error || 'Sauvegarde impossible. Réessaie.';
			return response.ok;
		});
		const ok = await inFlight;
		inFlight = null;
		saving = false;
		if (ok) {
			if (JSON.stringify(value) !== saved) schedule();
			else await onUpdated();
		}
		return ok;
	}

	async function status(next: 'open' | 'done' | 'cancelled') {
		if (busy || !(await save())) return;
		busy = true;
		error = '';
		const fields = new FormData();
		fields.set('id', checkpoint.id);
		fields.set('status', next);
		const response = await postAction(`${path}?/checkpointStatus`, fields);
		if (response.ok) await onUpdated();
		else error = response.error || 'Action impossible. Réessaie.';
		busy = false;
	}

	beforeNavigate((navigation) => {
		if (
			(saving || JSON.stringify(value) !== saved) &&
			!window.confirm(
				'Ce Checkpoint contient des modifications non enregistrées. Quitter la page ?'
			)
		)
			navigation.cancel();
	});
	onDestroy(() => clearTimeout(timer));
</script>

<article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h4 class="font-semibold break-words text-slate-950">{checkpoint.title}</h4>
			<p class="mt-1 text-xs text-slate-500">
				{checkpoint.status === 'done'
					? 'Atteint'
					: checkpoint.status === 'cancelled'
						? 'Annulé'
						: 'Ouvert'}{checkpoint.targetDate ? ` · Cible : ${checkpoint.targetDate}` : ''}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if checkpoint.status === 'open'}
				<button
					type="button"
					disabled={busy}
					onclick={() => status('done')}
					class="ui-button ui-button-primary ui-focus">Atteint</button
				>
				<button
					type="button"
					disabled={busy}
					onclick={() => status('cancelled')}
					class="ui-button ui-button-quiet ui-focus">Annuler</button
				>
			{:else if checkpoint.status === 'done'}
				<button
					type="button"
					disabled={busy}
					onclick={() => status('open')}
					class="ui-button ui-button-quiet ui-focus">Rouvrir</button
				>
			{/if}
			<button
				type="button"
				aria-expanded={editing}
				onclick={() => (editing = !editing)}
				class="ui-button ui-button-quiet ui-focus">{editing ? 'Fermer' : 'Modifier'}</button
			>
		</div>
	</div>
	{#if editing}
		<div class="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
			<label class="grid gap-1 text-sm"
				>Titre<input
					bind:value={value.title}
					oninput={schedule}
					maxlength="500"
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<label class="grid gap-1 text-sm"
				>Date cible<input
					type="date"
					bind:value={value.targetDate}
					oninput={schedule}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<div class="space-y-2 sm:col-span-2">
				<div class="flex items-center justify-between gap-3">
					{#if preview}<span class="text-sm">Description Markdown</span>{:else}<label
							for={`checkpoint-description-${checkpoint.id}`}
							class="text-sm">Description Markdown</label
						>{/if}<button
						type="button"
						aria-pressed={preview}
						onclick={() => (preview = !preview)}
						class="ui-button ui-button-quiet ui-focus">{preview ? 'Éditer' : 'Aperçu'}</button
					>
				</div>
				{#if preview}<div
						aria-label="Aperçu de la description"
						class="min-h-24 rounded-lg border border-slate-300 p-3"
					>
						<MarkdownPreview source={value.description} />
					</div>{:else}<textarea
						id={`checkpoint-description-${checkpoint.id}`}
						bind:value={value.description}
						oninput={schedule}
						rows="4"
						class="ui-focus w-full rounded-lg border border-slate-300 p-3"></textarea>{/if}
			</div>
			<div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 sm:col-span-2">
				<span role="status"
					>{saving
						? 'Sauvegarde…'
						: JSON.stringify(value) === saved
							? 'Enregistré'
							: error
								? 'Échec de sauvegarde'
								: 'Modification…'}</span
				>{#if error}<span role="alert" class="text-red-700">{error}</span><button
						type="button"
						onclick={() => save()}
						class="ui-button ui-button-quiet ui-focus">Réessayer</button
					>{/if}
			</div>
		</div>
	{:else if error}<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>{/if}
</article>
