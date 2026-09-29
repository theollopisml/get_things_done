<script lang="ts">
	import { beforeNavigate, goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import { onDestroy } from 'svelte';
	import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
	import { toggleMarkdownTask } from '$lib/domain/markdown-preview';
	import QuickTaskComposer from '$lib/components/QuickTaskComposer.svelte';
	import SelectMenu from '$lib/components/SelectMenu.svelte';
	import type { ProjectStatus } from '$lib/domain/projects';
	import type { TaskStatus } from '$lib/domain/tasks';
	import { postAction } from '$lib/post-action';
	import CheckpointCard from './CheckpointCard.svelte';
	import TaskCard from '../../tasks/TaskCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	// Local edits intentionally retain their initial values across server invalidation.
	// svelte-ignore state_referenced_locally
	let value = $state({
		title: data.project.title,
		description: data.project.description ?? '',
		startDate: data.project.startDate ?? '',
		dueDate: data.project.dueDate ?? ''
	});
	let saved = $state(JSON.stringify(value));
	let saving = $state(false);
	let error = $state('');
	let preview = $state(false);
	let busy = $state(false);
	let confirmOpen = $state(false);
	let pendingStatus = $state<ProjectStatus | null>(null);
	let confirmError = $state('');
	let deleteUndo = $state<{ kind: 'task' | 'checkpoint'; id: string } | null>(null);
	let newCheckpoint = $state('');
	let creatingCheckpoint = $state(false);
	let undo = $state<{ taskId: string; projectId: string | null; position: number | null } | null>(
		null
	);
	let recurrenceUndo = $state<{
		id: string;
		previousDate: string;
		expectedDate: string;
		previousStatus: 'todo' | 'in_progress' | 'cancelled';
		expectedStatus: 'todo' | 'cancelled';
		label: string;
	} | null>(null);
	let recurrenceUndoTimer: ReturnType<typeof setTimeout> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<boolean> | null = null;
	let projectPath = $derived(`/projects/${data.project.id}`);
	let moveOptions = $derived([
		{ value: '', label: 'Aucun' },
		...data.projectOptions.map((option) => ({ value: option.id, label: option.title }))
	]);
	let checkpointOptions = $derived([
		{ value: '', label: 'Aucun' },
		...data.project.checkpoints.map((checkpoint) => ({
			value: checkpoint.id,
			label: checkpoint.title
		}))
	]);
	let openTasks = $derived(
		data.taskCards.filter((task) => task.status === 'todo' || task.status === 'in_progress')
	);
	let closedTasks = $derived(
		data.taskCards.filter((task) => task.status === 'done' || task.status === 'cancelled')
	);
	let nextStatuses = $derived.by((): ProjectStatus[] => {
		switch (data.project.status) {
			case 'planned':
				return ['active', 'done', 'cancelled'];
			case 'active':
				return ['paused', 'done', 'cancelled'];
			case 'paused':
				return ['active', 'done', 'cancelled'];
			case 'done':
				return ['active'];
			case 'cancelled':
				return [];
		}
	});
	const labels: Record<ProjectStatus, string> = {
		planned: 'Planifié',
		active: 'En cours',
		paused: 'En pause',
		done: 'Terminé',
		cancelled: 'Annulé'
	};

	function form(fields: Record<string, string>) {
		const result = new FormData();
		for (const [key, field] of Object.entries(fields)) result.set(key, field);
		return result;
	}

	async function deleteItem(kind: 'task' | 'checkpoint', id: string) {
		const result = await postAction('/trash?/delete', form({ kind, id }));
		if (result.ok) {
			deleteUndo = { kind, id };
			setTimeout(() => {
				if (deleteUndo?.id === id) deleteUndo = null;
			}, 8000);
			await invalidateAll();
		} else error = result.error || 'Suppression impossible. Réessaie.';
		return result.ok;
	}

	async function undoDelete() {
		if (!deleteUndo) return;
		const result = await postAction('/trash?/restore', form(deleteUndo));
		if (result.ok) {
			deleteUndo = null;
			await invalidateAll();
		} else error = result.error || 'Restauration impossible. Réessaie.';
	}

	async function deleteProject() {
		if (
			busy ||
			!window.confirm(
				`Supprimer le Project « ${data.project.title} » ? Ses Tasks deviendront autonomes et ses Checkpoints iront dans la corbeille.`
			)
		)
			return;
		if (!(await save())) return;
		busy = true;
		const result = await postAction(
			'/trash?/delete',
			form({ kind: 'project', id: data.project.id })
		);
		if (result.ok) await goto(resolve(`/projects?undoProject=${data.project.id}`));
		else error = result.error || 'Suppression impossible. Réessaie.';
		busy = false;
	}

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
		const result = form(JSON.parse(snapshot) as Record<string, string>);
		inFlight = postAction(`${projectPath}?/save`, result).then((response) => {
			if (response.ok) saved = snapshot;
			else error = response.error || 'Sauvegarde impossible. Réessaie.';
			return response.ok;
		});
		const ok = await inFlight;
		inFlight = null;
		saving = false;
		if (ok && JSON.stringify(value) !== saved) schedule();
		return ok;
	}

	async function status(next: ProjectStatus) {
		if (busy || !(await save())) return;
		if (next === 'cancelled' || (next === 'done' && data.project.openTaskCount > 0)) {
			pendingStatus = next;
			confirmError = '';
			confirmOpen = true;
			return;
		}
		await applyStatus(next);
	}

	async function applyStatus(next: ProjectStatus) {
		busy = true;
		error = '';
		confirmError = '';
		const response = await postAction(`${projectPath}?/status`, form({ status: next }));
		if (response.ok) {
			confirmOpen = false;
			pendingStatus = null;
			await invalidateAll();
		} else {
			error = response.error || 'Action impossible. Réessaie.';
			if (confirmOpen) confirmError = error;
		}
		busy = false;
	}

	async function createTask(title: string, dueDate: string | null) {
		if (!(await save())) return { ok: false, error: error || 'Sauvegarde impossible. Réessaie.' };
		error = '';
		const response = await postAction(
			`${projectPath}?/createTask`,
			form({ title, dueDate: dueDate ?? '' })
		);
		if (response.ok) await invalidateAll();
		return response;
	}

	async function createCheckpoint(event: SubmitEvent) {
		event.preventDefault();
		if (creatingCheckpoint || !(await save())) return;
		creatingCheckpoint = true;
		error = '';
		const response = await postAction(
			`${projectPath}?/createCheckpoint`,
			form({ title: newCheckpoint })
		);
		if (response.ok) {
			newCheckpoint = '';
			await invalidateAll();
		} else error = response.error || 'Création impossible. Réessaie.';
		creatingCheckpoint = false;
	}

	async function reorderCheckpoint(id: string, direction: -1 | 1) {
		if (busy || !(await save())) return;
		const ids = data.project.checkpoints.map((checkpoint) => checkpoint.id);
		const index = ids.indexOf(id);
		if (index < 0 || index + direction < 0 || index + direction >= ids.length) return;
		[ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
		const fields = new FormData();
		for (const checkpointId of ids) fields.append('checkpointId', checkpointId);
		busy = true;
		error = '';
		const response = await postAction(`${projectPath}?/reorderCheckpoints`, fields);
		if (response.ok) await invalidateAll();
		else error = response.error || 'Réordonnancement impossible. Réessaie.';
		busy = false;
	}

	async function linkCheckpoint(taskId: string, checkpointId: string) {
		if (busy || !(await save())) return false;
		busy = true;
		error = '';
		const response = await postAction(
			`${projectPath}?/linkCheckpoint`,
			form({ taskId, checkpointId })
		);
		if (response.ok) await invalidateAll();
		else error = response.error || 'Rattachement impossible. Réessaie.';
		busy = false;
		return response.ok;
	}

	async function taskStatus(
		id: string,
		next: TaskStatus,
		previous: TaskStatus,
		expectedDate?: string | null
	) {
		if (!(await save())) return false;
		const response = await postAction(
			'/tasks?/status',
			form({
				id,
				status: next,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				expectedDate: expectedDate ?? ''
			})
		);
		if (response.ok) {
			if (
				expectedDate &&
				typeof response.data?.nextScheduledDate === 'string' &&
				(previous === 'todo' || previous === 'in_progress' || previous === 'cancelled') &&
				(response.data?.expectedStatus === 'todo' || response.data?.expectedStatus === 'cancelled')
			) {
				recurrenceUndo = {
					id,
					previousDate: expectedDate,
					expectedDate: response.data.nextScheduledDate,
					previousStatus: previous,
					expectedStatus: response.data.expectedStatus,
					label:
						next === 'done'
							? `Occurrence terminée. Prochaine date : ${response.data.nextScheduledDate}.`
							: next === 'cancelled'
								? 'Récurrence annulée.'
								: `Récurrence rouverte au ${response.data.nextScheduledDate}.`
				};
				clearTimeout(recurrenceUndoTimer);
				recurrenceUndoTimer = setTimeout(() => (recurrenceUndo = null), 8000);
			}
			await invalidateAll();
		} else error = response.error || 'Action impossible. Réessaie.';
		return response.ok;
	}

	async function undoRecurringTask() {
		if (!recurrenceUndo) return;
		const previous = recurrenceUndo;
		const response = await postAction(
			'/tasks?/undoRecurrence',
			form({
				id: previous.id,
				previousDate: previous.previousDate,
				expectedDate: previous.expectedDate,
				previousStatus: previous.previousStatus,
				expectedStatus: previous.expectedStatus
			})
		);
		if (response.ok) {
			recurrenceUndo = null;
			await invalidateAll();
		} else error = response.error || 'Annulation impossible.';
	}

	async function move(taskId: string, projectId: string, restorePosition?: number, isUndo = false) {
		if (busy || !(await save())) return false;
		busy = true;
		error = '';
		const fields = form({ taskId, projectId });
		if (restorePosition !== undefined) fields.set('position', String(restorePosition));
		const response = await postAction(`${projectPath}?/moveTask`, fields);
		if (response.ok) {
			undo = isUndo
				? null
				: {
						taskId,
						projectId: (response.data?.previousProjectId as string | null) ?? null,
						position: (response.data?.previousPosition as number | null) ?? null
					};
			await invalidateAll();
		} else error = response.error || 'Déplacement impossible. Réessaie.';
		busy = false;
		return response.ok;
	}

	async function reorder(taskId: string, direction: -1 | 1, items: typeof data.taskCards) {
		if (busy || !(await save())) return;
		const index = items.findIndex((task) => task.id === taskId);
		const neighbor = items[index + direction];
		if (!neighbor) return;
		const ids = data.taskCards.map((task) => task.id);
		const from = ids.indexOf(taskId);
		const to = ids.indexOf(neighbor.id);
		[ids[from], ids[to]] = [ids[to], ids[from]];
		const fields = new FormData();
		for (const id of ids) fields.append('taskId', id);
		busy = true;
		const response = await postAction(`${projectPath}?/reorder`, fields);
		if (response.ok) await invalidateAll();
		else error = response.error || 'Réordonnancement impossible. Réessaie.';
		busy = false;
	}

	beforeNavigate((navigation) => {
		if (
			(saving || JSON.stringify(value) !== saved) &&
			!window.confirm('Ce Project contient des modifications non enregistrées. Quitter la page ?')
		)
			navigation.cancel();
	});
	onDestroy(() => {
		clearTimeout(timer);
		clearTimeout(recurrenceUndoTimer);
	});
</script>

<svelte:head><title>{data.project.title} · Projects · Get Things Done</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-7">
	<a
		href={resolve('/projects')}
		class="ui-focus inline-block text-sm text-slate-600 hover:text-slate-950">← Tous les Projects</a
	>
	<header class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
				Project · {labels[data.project.status]}
			</p>
			<h1 class="mt-2 text-3xl font-semibold break-words text-slate-950 sm:text-4xl">
				{data.project.title}
			</h1>
		</div>
		{#if data.project.toBuild}<span
				class="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900"
				>À construire</span
			>{/if}
	</header>
	<div class="flex flex-wrap gap-2">
		{#each nextStatuses as next (next)}<button
				type="button"
				disabled={busy}
				onclick={() => status(next)}
				class="ui-button {next === 'active' || next === 'done'
					? 'ui-button-primary'
					: 'ui-button-quiet'} ui-focus"
				>{next === 'active' && data.project.status === 'done' ? 'Rouvrir' : labels[next]}</button
			>{/each}
		<button
			type="button"
			disabled={busy}
			onclick={deleteProject}
			class="ui-button ui-button-quiet ui-focus text-red-700">Supprimer le Project</button
		>
	</div>
	{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
	{#if deleteUndo}<div
			role="status"
			class="flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 text-sm"
		>
			<span>{deleteUndo.kind === 'task' ? 'Task' : 'Checkpoint'} supprimé.</span><button
				type="button"
				onclick={undoDelete}
				class="ui-button ui-button-quiet ui-focus">Annuler la suppression</button
			>
		</div>{/if}
	<section
		class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
		aria-label="Détails du Project"
	>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="grid gap-1 text-sm"
				>Titre<input
					bind:value={value.title}
					oninput={schedule}
					maxlength="500"
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<div class="space-y-2 sm:col-span-2">
				<div class="flex items-center justify-between gap-3">
					{#if preview}<span class="text-sm">Description Markdown</span>{:else}<label
							for="project-description"
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
						class="min-h-28 rounded-lg border border-slate-300 p-3"
					>
						<MarkdownPreview
							source={value.description}
							onToggle={(lineIndex) => {
								value.description = toggleMarkdownTask(value.description, lineIndex);
								schedule();
							}}
						/>
					</div>{:else}<textarea
						id="project-description"
						bind:value={value.description}
						oninput={schedule}
						rows="5"
						class="ui-focus w-full rounded-lg border border-slate-300 p-3"></textarea>{/if}
			</div>
			<label class="grid gap-1 text-sm"
				>Début prévu<input
					type="date"
					bind:value={value.startDate}
					oninput={schedule}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
			<label class="grid gap-1 text-sm"
				>Échéance<input
					type="date"
					bind:value={value.dueDate}
					oninput={schedule}
					class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
				/></label
			>
		</div>
		<div class="flex flex-wrap items-center gap-3 text-xs text-slate-500">
			<span role="status"
				>{saving
					? 'Sauvegarde…'
					: JSON.stringify(value) === saved
						? 'Enregistré'
						: error
							? 'Échec de sauvegarde'
							: 'Modification…'}</span
			>{#if error && JSON.stringify(value) !== saved}<button
					type="button"
					onclick={() => save()}
					class="ui-button ui-button-quiet ui-focus">Réessayer</button
				>{/if}
		</div>
	</section>
	<section
		class="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm sm:p-6"
		aria-label="Progression factuelle"
	>
		<p>Tasks : {data.project.tasksDone} / {data.project.taskCount} terminées</p>
		{#if data.project.checkpointCount}<p>
				Checkpoints : {data.project.checkpointsDone} / {data.project.checkpointCount} atteints
			</p>{/if}
		{#if data.project.startedAt}<p>
				Premier démarrage : {new Date(data.project.startedAt).toLocaleDateString('fr-FR')}
			</p>{/if}
		{#if data.project.completedAt}<p>
				Terminé le {new Date(data.project.completedAt).toLocaleDateString('fr-FR')}
			</p>{/if}
	</section>
	<section class="space-y-4" aria-label="Checkpoints du Project">
		<div>
			<h2 class="text-xl font-semibold text-slate-950">Checkpoints</h2>
			<p class="mt-1 text-sm text-slate-600">Jalons du Project, distincts des Tasks.</p>
		</div>
		<form
			onsubmit={createCheckpoint}
			class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
		>
			<label for="new-checkpoint" class="sr-only">Nouveau Checkpoint</label>
			<input
				id="new-checkpoint"
				bind:value={newCheckpoint}
				placeholder="Nouveau Checkpoint…"
				required
				maxlength="500"
				class="ui-focus min-h-11 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
			/>
			<button
				type="submit"
				disabled={creatingCheckpoint}
				class="ui-button ui-button-primary ui-focus"
				>{creatingCheckpoint ? 'Création…' : 'Ajouter'}</button
			>
		</form>
		{#each data.project.checkpoints as checkpoint, index (checkpoint.id)}
			<div class="space-y-2">
				<CheckpointCard
					{checkpoint}
					projectId={data.project.id}
					onUpdated={invalidateAll}
					onDelete={(id) => deleteItem('checkpoint', id)}
				/>
				<div class="flex gap-2 pl-1">
					<button
						type="button"
						disabled={busy || index === 0}
						onclick={() => reorderCheckpoint(checkpoint.id, -1)}
						class="ui-button ui-button-quiet ui-focus"
						aria-label={`Monter ${checkpoint.title}`}>↑</button
					>
					<button
						type="button"
						disabled={busy || index === data.project.checkpoints.length - 1}
						onclick={() => reorderCheckpoint(checkpoint.id, 1)}
						class="ui-button ui-button-quiet ui-focus"
						aria-label={`Descendre ${checkpoint.title}`}>↓</button
					>
				</div>
			</div>
		{/each}
		{#if !data.project.checkpoints.length}<p
				class="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600"
			>
				Aucun Checkpoint dans ce Project.
			</p>{/if}
	</section>
	<section class="space-y-4" aria-label="Tasks du Project">
		<div>
			<h2 class="text-xl font-semibold text-slate-950">Tasks</h2>
			<p class="mt-1 text-sm text-slate-600">L’ordre ici n’influence pas les vues d’exécution.</p>
		</div>
		<QuickTaskComposer
			id="new-project-task"
			label="Nouvelle Task dans ce Project"
			onCreate={createTask}
		/>
		{#if recurrenceUndo}<div
				role="status"
				class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 text-sm"
			>
				<span>{recurrenceUndo.label}</span>
				<button type="button" onclick={undoRecurringTask} class="ui-button ui-button-quiet ui-focus"
					>Annuler l’action</button
				>
			</div>{/if}
		{#if undo}<div
				role="status"
				class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white p-3 text-sm"
			>
				<span>Task déplacée.</span><button
					type="button"
					onclick={() => {
						const previous = undo;
						undo = null;
						if (previous)
							void move(
								previous.taskId,
								previous.projectId ?? '',
								previous.position ?? undefined,
								true
							);
					}}
					class="ui-button ui-button-quiet ui-focus">Annuler le déplacement</button
				>
			</div>{/if}
		{#each [{ label: 'Ouvertes', tasks: openTasks }, { label: 'Terminées et annulées', tasks: closedTasks }] as section (section.label)}
			{#if section.tasks.length}<div class="space-y-3">
					<h3 class="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
						{section.label} · {section.tasks.length}
					</h3>
					{#each section.tasks as task, index (task.id)}<div class="space-y-2">
							<TaskCard {task} onStatus={taskStatus} onDelete={(id) => deleteItem('task', id)} />
							<div class="flex flex-wrap items-center gap-2 pl-1 text-sm">
								<button
									type="button"
									disabled={busy || index === 0}
									onclick={() => reorder(task.id, -1, section.tasks)}
									class="ui-button ui-button-quiet ui-focus"
									aria-label={`Monter ${task.title}`}>↑</button
								><button
									type="button"
									disabled={busy || index === section.tasks.length - 1}
									onclick={() => reorder(task.id, 1, section.tasks)}
									class="ui-button ui-button-quiet ui-focus"
									aria-label={`Descendre ${task.title}`}>↓</button
								>
								<div class="flex items-center gap-2">
									<span>Project</span>
									<SelectMenu
										value={data.project.id}
										options={moveOptions}
										label={`Project de ${task.title}`}
										disabled={busy}
										onSelect={(next) => move(task.id, next)}
										triggerClass="min-w-32 max-w-52"
									/>
								</div>
								<div class="flex items-center gap-2">
									<span>Checkpoint</span>
									<SelectMenu
										value={task.checkpointId ?? ''}
										options={checkpointOptions}
										label={`Checkpoint de ${task.title}`}
										disabled={busy}
										onSelect={(next) => linkCheckpoint(task.id, next)}
										triggerClass="min-w-32 max-w-52"
									/>
								</div>
							</div>
						</div>{/each}
				</div>{/if}
		{/each}
		{#if !data.taskCards.length}<p
				class="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600"
			>
				Aucune Task dans ce Project.
			</p>{/if}
	</section>
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/65" />
		<Dialog.Content
			onEscapeKeydown={(event) => {
				if (busy) event.preventDefault();
			}}
			onInteractOutside={(event) => {
				if (busy) event.preventDefault();
			}}
			class="fixed top-1/2 left-1/2 z-50 w-[min(calc(100vw-2rem),30rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl"
		>
			<Dialog.Title class="text-xl font-semibold text-slate-950">
				{pendingStatus === 'cancelled' ? 'Annuler ce Project ?' : 'Terminer ce Project ?'}
			</Dialog.Title>
			<Dialog.Description class="mt-3 text-sm leading-6 text-slate-600">
				{#if data.project.openTaskCount > 0}
					Ce Project contient {data.project.openTaskCount} Task{data.project.openTaskCount > 1
						? 's'
						: ''} ouverte{data.project.openTaskCount > 1 ? 's' : ''}. Leur statut ne changera pas,
					mais elles seront masquées des vues d’exécution tant que le Project restera
					{pendingStatus === 'cancelled' ? 'annulé' : 'terminé'}.
				{:else}
					Cette action classera le Project parmi les projets annulés.
				{/if}
			</Dialog.Description>
			{#if confirmError}<p role="alert" class="mt-4 text-sm text-red-700">{confirmError}</p>{/if}
			<div class="mt-6 flex flex-wrap justify-end gap-2">
				<button
					type="button"
					disabled={busy}
					onclick={() => (confirmOpen = false)}
					class="ui-button ui-button-quiet ui-focus">Retour</button
				>
				<button
					type="button"
					disabled={busy || !pendingStatus}
					onclick={() => pendingStatus && applyStatus(pendingStatus)}
					class="ui-button ui-button-primary ui-focus"
					>{busy
						? 'En cours…'
						: pendingStatus === 'cancelled'
							? 'Annuler le Project'
							: 'Terminer le Project'}</button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
