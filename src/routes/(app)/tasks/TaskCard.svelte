<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { TaskStatus } from '$lib/domain/tasks';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	type Task = PageData['tasks'][number];
	let {
		task,
		onStatus
	}: {
		task: Task;
		onStatus: (id: string, status: TaskStatus, previous: TaskStatus) => Promise<boolean>;
	} = $props();
	let editing = $state(false);
	let busy = $state(false);
	// Local edits intentionally retain their initial values across server invalidation.
	// svelte-ignore state_referenced_locally
	let value = $state({
		title: task.title,
		description: task.description ?? '',
		scheduledDate: task.scheduledDate ?? '',
		scheduledTime: task.scheduledTime?.slice(0, 5) ?? '',
		dueDate: task.dueDate ?? '',
		dueTime: task.dueTime?.slice(0, 5) ?? ''
	});
	const initial = JSON.stringify(value);
	let saved = $state(initial);
	let saving = $state(false);
	let error = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<boolean> | null = null;
	const labels: Record<TaskStatus, string> = {
		todo: 'À faire',
		in_progress: 'En cours',
		done: 'Terminée',
		cancelled: 'Annulée'
	};

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
		if ((value.scheduledTime && !value.scheduledDate) || (value.dueTime && !value.dueDate)) {
			error = 'Choisis une date avant l’heure.';
			return false;
		}
		saving = true;
		error = '';
		const data = new FormData();
		data.set('id', task.id);
		for (const [key, field] of Object.entries(JSON.parse(snapshot) as Record<string, string>)) {
			data.set(key, field);
		}
		inFlight = postAction('/tasks?/save', data).then((result) => {
			if (result.ok) saved = snapshot;
			else error = result.error || 'Sauvegarde impossible. Réessaie.';
			return result.ok;
		});
		const ok = await inFlight;
		inFlight = null;
		saving = false;
		if (ok) {
			if (JSON.stringify(value) !== saved) schedule();
			else await invalidateAll();
		}
		return ok;
	}

	async function status(next: TaskStatus) {
		if (busy || !(await save())) return;
		busy = true;
		await onStatus(task.id, next, task.status);
		busy = false;
	}

	beforeNavigate((navigation) => {
		if (saving || JSON.stringify(value) !== saved) {
			if (
				!window.confirm('Cette Task contient des modifications non enregistrées. Quitter la page ?')
			) {
				navigation.cancel();
			}
		}
	});

	onDestroy(() => clearTimeout(timer));
</script>

<article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<h3 class="font-semibold break-words text-slate-950">{task.title}</h3>
			<p class="mt-1 text-xs text-slate-500">
				{labels[task.status]}{task.projectTitle ? ` · ${task.projectTitle}` : ''}
				{task.scheduledDate
					? ` · Planifiée ${task.scheduledDate}${task.scheduledTime ? ` à ${task.scheduledTime.slice(0, 5)}` : ''}`
					: ''}
				{task.dueDate
					? ` · Échéance ${task.dueDate}${task.dueTime ? ` à ${task.dueTime.slice(0, 5)}` : ''}`
					: ''}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			{#if task.status === 'todo' || task.status === 'in_progress'}
				<button
					type="button"
					disabled={busy}
					onclick={() => status('done')}
					class="ui-button ui-button-primary ui-focus">Terminer</button
				>
				{#if task.status === 'todo'}<button
						type="button"
						disabled={busy}
						onclick={() => status('in_progress')}
						class="ui-button ui-button-quiet ui-focus">Démarrer</button
					>{/if}
				<button
					type="button"
					disabled={busy}
					onclick={() => status('cancelled')}
					class="ui-button ui-button-quiet ui-focus">Annuler</button
				>
			{:else}
				<button
					type="button"
					disabled={busy}
					onclick={() => status('todo')}
					class="ui-button ui-button-quiet ui-focus">Rouvrir</button
				>
			{/if}
			<button
				type="button"
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
			<label class="grid gap-1 text-sm sm:col-span-2"
				>Description Markdown<textarea
					bind:value={value.description}
					oninput={schedule}
					rows="4"
					class="ui-focus rounded-lg border border-slate-300 p-3"></textarea></label
			>
			<label class="grid gap-1 text-sm"
				>Date planifiée<input
					type="date"
					bind:value={value.scheduledDate}
					oninput={() => {
						if (!value.scheduledDate) value.scheduledTime = '';
						schedule();
					}}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<label class="grid gap-1 text-sm"
				>Heure planifiée<input
					type="time"
					bind:value={value.scheduledTime}
					disabled={!value.scheduledDate}
					oninput={schedule}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<label class="grid gap-1 text-sm"
				>Échéance<input
					type="date"
					bind:value={value.dueDate}
					oninput={() => {
						if (!value.dueDate) value.dueTime = '';
						schedule();
					}}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<label class="grid gap-1 text-sm"
				>Heure d’échéance<input
					type="time"
					bind:value={value.dueTime}
					disabled={!value.dueDate}
					oninput={schedule}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 sm:col-span-2">
				<span role="status"
					>{saving
						? 'Sauvegarde…'
						: JSON.stringify(value) === saved
							? 'Enregistré'
							: error
								? 'Échec de sauvegarde'
								: 'Modification…'}</span
				>
				{#if error}<span role="alert" class="text-red-700">{error}</span><button
						type="button"
						onclick={() => save()}
						class="ui-button ui-button-quiet ui-focus">Réessayer</button
					>{/if}
			</div>
		</div>
	{/if}
</article>
