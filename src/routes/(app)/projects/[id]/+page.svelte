<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy } from 'svelte';
	import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
	import type { ProjectStatus } from '$lib/domain/projects';
	import type { TaskStatus } from '$lib/domain/tasks';
	import { postAction } from '$lib/post-action';
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
	let newTask = $state('');
	let creatingTask = $state(false);
	let undo = $state<{ taskId: string; projectId: string | null; position: number | null } | null>(
		null
	);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<boolean> | null = null;
	let projectPath = $derived(`/projects/${data.project.id}`);
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
		if (
			(next === 'done' || next === 'cancelled') &&
			data.project.openTaskCount > 0 &&
			!window.confirm(
				`Ce Project contient ${data.project.openTaskCount} Task(s) ouvertes. Elles garderont leur statut et seront masquées des vues d’exécution. Continuer ?`
			)
		)
			return;
		if (
			next === 'cancelled' &&
			data.project.openTaskCount === 0 &&
			!window.confirm('Annuler ce Project ?')
		)
			return;
		busy = true;
		error = '';
		const response = await postAction(`${projectPath}?/status`, form({ status: next }));
		if (response.ok) await invalidateAll();
		else error = response.error || 'Action impossible. Réessaie.';
		busy = false;
	}

	async function createTask(event: SubmitEvent) {
		event.preventDefault();
		if (creatingTask || !(await save())) return;
		creatingTask = true;
		error = '';
		const response = await postAction(`${projectPath}?/createTask`, form({ title: newTask }));
		if (response.ok) {
			newTask = '';
			await invalidateAll();
		} else error = response.error || 'Création impossible. Réessaie.';
		creatingTask = false;
	}

	async function taskStatus(id: string, next: TaskStatus) {
		if (!(await save())) return false;
		const response = await postAction('/tasks?/status', form({ id, status: next }));
		if (response.ok) await invalidateAll();
		else error = response.error || 'Action impossible. Réessaie.';
		return response.ok;
	}

	async function move(taskId: string, projectId: string, restorePosition?: number, isUndo = false) {
		if (busy || !(await save())) return;
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
	onDestroy(() => clearTimeout(timer));
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
	</div>
	{#if data.project.visionTitle}<p class="text-sm text-slate-600">
			Vision : {data.project.visionTitle}
		</p>{/if}
	{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
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
						<MarkdownPreview source={value.description} />
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
	<section class="space-y-4" aria-label="Tasks du Project">
		<div>
			<h2 class="text-xl font-semibold text-slate-950">Tasks</h2>
			<p class="mt-1 text-sm text-slate-600">L’ordre ici n’influence pas les vues d’exécution.</p>
		</div>
		<form
			onsubmit={createTask}
			class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
		>
			<label for="new-project-task" class="sr-only">Nouvelle Task dans ce Project</label><input
				id="new-project-task"
				bind:value={newTask}
				placeholder="Nouvelle Task…"
				required
				maxlength="500"
				class="ui-focus min-h-11 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
			/><button type="submit" disabled={creatingTask} class="ui-button ui-button-primary ui-focus"
				>{creatingTask ? 'Création…' : 'Ajouter'}</button
			>
		</form>
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
							<TaskCard {task} onStatus={taskStatus} />
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
								><label class="flex items-center gap-2"
									>Project<select
										value={data.project.id}
										disabled={busy}
										onchange={(event) => move(task.id, event.currentTarget.value)}
										class="ui-focus min-h-11 rounded-lg border border-slate-300 bg-white px-3"
										><option value="">Aucun</option
										>{#each data.projectOptions as option (option.id)}<option value={option.id}
												>{option.title}</option
											>{/each}</select
									></label
								>
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
