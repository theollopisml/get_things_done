<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { Dialog } from 'bits-ui';
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
	let closing = $state(false);
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
	let titleInput: HTMLInputElement | undefined;
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

	async function closeEdit() {
		if (closing) return;
		closing = true;
		if (await save()) {
			editing = false;
			await onUpdated();
		}
		closing = false;
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

<Dialog.Root bind:open={editing}>
	<article
		id={`checkpoint-${checkpoint.id}`}
		tabindex="-1"
		class="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm target:ring-2 target:ring-slate-900 sm:p-5"
	>
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
				<Dialog.Trigger class="ui-button ui-button-quiet ui-focus">Modifier</Dialog.Trigger>
			</div>
		</div>
		{#if error}<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>{/if}
	</article>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/65" />
		<Dialog.Content
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				titleInput?.focus();
			}}
			onEscapeKeydown={(event) => {
				event.preventDefault();
				void closeEdit();
			}}
			onInteractOutside={(event) => {
				event.preventDefault();
				void closeEdit();
			}}
			class="fixed top-1/2 left-1/2 z-50 flex max-h-[min(90dvh,48rem)] w-[min(calc(100vw-2rem),42rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
		>
			<div class="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-6">
				<div>
					<Dialog.Title class="text-xl font-semibold text-slate-950"
						>Modifier le Checkpoint</Dialog.Title
					>
					<Dialog.Description class="mt-1 text-sm text-slate-600"
						>Les modifications sont enregistrées automatiquement.</Dialog.Description
					>
				</div>
				<button
					type="button"
					disabled={closing}
					onclick={() => void closeEdit()}
					class="ui-button ui-button-quiet ui-focus shrink-0"
					aria-label="Fermer la modale">Fermer</button
				>
			</div>
			<div class="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
				<label class="grid gap-1 text-sm"
					>Titre<input
						bind:this={titleInput}
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
