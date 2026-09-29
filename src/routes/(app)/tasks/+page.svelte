<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onDestroy, onMount } from 'svelte';
	import SelectMenu from '$lib/components/SelectMenu.svelte';
	import { taskGroup, type TaskStatus } from '$lib/domain/tasks';
	import { postAction } from '$lib/post-action';
	import TaskCard from './TaskCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let newTitle = $state('');
	let creating = $state(false);
	let error = $state('');
	let filter = $state('all');
	let projectFilter = $state('all');
	let undo = $state<{ id: string; status: TaskStatus; label: string } | null>(null);
	let moveUndo = $state<{ id: string; projectId: string | null; position: number | null } | null>(
		null
	);
	let busy = $state(false);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	let today = new Date().toLocaleDateString('sv-SE');
	let nowTime = new Date().toTimeString().slice(0, 5);
	let clockTimer: ReturnType<typeof setInterval> | undefined;
	let projectOptions = $derived(
		data.tasks
			.filter((task) => task.projectId)
			.filter(
				(task, index, items) =>
					items.findIndex((candidate) => candidate.projectId === task.projectId) === index
			)
	);
	const filterOptions = [
		{ value: 'all', label: 'Toutes' },
		{ value: 'todo', label: 'À faire' },
		{ value: 'in_progress', label: 'En cours' },
		{ value: 'scheduled', label: 'Planifiées' },
		{ value: 'unscheduled', label: 'Sans planification' }
	];
	let projectFilterOptions = $derived([
		{ value: 'all', label: 'Tous' },
		...projectOptions.map((project) => ({
			value: project.projectId ?? '',
			label: project.projectTitle ?? 'Sans projet'
		}))
	]);
	let visible = $derived(
		data.tasks.filter((task) => {
			if (projectFilter !== 'all' && task.projectId !== projectFilter) return false;
			if (filter === 'scheduled') return !!task.scheduledDate;
			if (filter === 'unscheduled') return !task.scheduledDate;
			if (filter === 'todo' || filter === 'in_progress') return task.status === filter;
			return true;
		})
	);
	const groups = [
		{ key: 'in_progress', label: 'In progress' },
		{ key: 'late', label: 'Late' },
		{ key: 'upcoming', label: 'Upcoming' },
		{ key: 'unscheduled', label: 'Unscheduled' }
	] as const;

	function form(values: Record<string, string>) {
		const data = new FormData();
		for (const [key, value] of Object.entries(values)) data.set(key, value);
		return data;
	}

	async function create(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		creating = true;
		error = '';
		const result = await postAction('/tasks?/create', form({ title: newTitle }));
		if (result.ok) {
			newTitle = '';
			await invalidateAll();
		} else error = result.error || 'Création impossible. Réessaie.';
		creating = false;
	}

	async function changeStatus(
		id: string,
		status: TaskStatus,
		previous: TaskStatus,
		isUndo = false
	) {
		if (busy) return false;
		busy = true;
		error = '';
		const result = await postAction('/tasks?/status', form({ id, status }));
		if (result.ok) {
			if (isUndo) undo = null;
			else {
				const serverPrevious = result.data?.previousStatus;
				const undoStatus =
					serverPrevious === 'todo' ||
					serverPrevious === 'in_progress' ||
					serverPrevious === 'done' ||
					serverPrevious === 'cancelled'
						? serverPrevious
						: previous;
				undo = {
					id,
					status: undoStatus,
					label:
						status === 'done'
							? 'Task terminée.'
							: status === 'cancelled'
								? 'Task annulée.'
								: status === 'in_progress'
									? 'Task démarrée.'
									: 'Task rouverte.'
				};
				clearTimeout(undoTimer);
				undoTimer = setTimeout(() => (undo = null), 8000);
			}
			await invalidateAll();
		} else error = result.error || 'Action impossible. Réessaie.';
		busy = false;
		return result.ok;
	}

	async function move(id: string, projectId: string, position?: number, isUndo = false) {
		if (busy) return false;
		busy = true;
		error = '';
		const fields = form({ id, projectId });
		if (position !== undefined) fields.set('position', String(position));
		const result = await postAction('/tasks?/move', fields);
		if (result.ok) {
			moveUndo = isUndo
				? null
				: {
						id,
						projectId: (result.data?.previousProjectId as string | null) ?? null,
						position: (result.data?.previousPosition as number | null) ?? null
					};
			await invalidateAll();
		} else error = result.error || 'Déplacement impossible. Réessaie.';
		busy = false;
		return result.ok;
	}

	onMount(() => {
		clockTimer = setInterval(() => {
			today = new Date().toLocaleDateString('sv-SE');
			nowTime = new Date().toTimeString().slice(0, 5);
		}, 60_000);
	});
	onDestroy(() => {
		clearTimeout(undoTimer);
		clearInterval(clockTimer);
	});
</script>

<svelte:head><title>Tasks · Get Things Done</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-7">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Backlog</p>
			<h1 class="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Tasks</h1>
		</div>
		<nav aria-label="Vue des Tasks" class="flex gap-2">
			<a
				href={resolve('/tasks')}
				aria-current={!data.history ? 'page' : undefined}
				class="ui-button ui-focus {!data.history ? 'ui-button-primary' : 'ui-button-quiet'}"
				>Ouvertes</a
			>
			<a
				href={resolve('/tasks?view=history')}
				aria-current={data.history ? 'page' : undefined}
				class="ui-button ui-focus {data.history ? 'ui-button-primary' : 'ui-button-quiet'}"
				>Historique</a
			>
		</nav>
	</header>

	{#if !data.history}
		<form
			onsubmit={create}
			class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
		>
			<label for="new-task" class="sr-only">Nouvelle Task</label>
			<input
				id="new-task"
				name="title"
				bind:value={newTitle}
				placeholder="Nouvelle Task…"
				required
				maxlength="500"
				class="ui-focus min-h-11 min-w-48 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
			/>
			<button type="submit" disabled={creating} class="ui-button ui-button-primary ui-focus"
				>{creating ? 'Création…' : 'Ajouter'}</button
			>
		</form>
	{/if}
	{#if undo}<div
			role="status"
			class="flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 text-sm"
		>
			<span>{undo.label}</span><button
				type="button"
				class="ui-button ui-button-quiet ui-focus"
				onclick={() => undo && changeStatus(undo.id, undo.status, undo.status, true)}
				>Annuler l’action</button
			>
		</div>{/if}
	{#if moveUndo}<div
			role="status"
			class="flex items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 text-sm"
		>
			<span>Task déplacée.</span><button
				type="button"
				class="ui-button ui-button-quiet ui-focus"
				onclick={() =>
					moveUndo &&
					move(moveUndo.id, moveUndo.projectId ?? '', moveUndo.position ?? undefined, true)}
				>Annuler le déplacement</button
			>
		</div>{/if}
	{#if error}<p role="alert" class="text-sm text-red-700">{error}</p>{/if}
	{#if !data.history}
		<div class="flex flex-wrap gap-4">
			<div class="flex items-center gap-2 text-sm text-slate-700">
				<span>Filtrer</span>
				<SelectMenu
					bind:value={filter}
					options={filterOptions}
					label="Filtrer les Tasks"
					triggerClass="w-52"
				/>
			</div>
			<div class="flex items-center gap-2 text-sm text-slate-700">
				<span>Projet</span>
				<SelectMenu
					bind:value={projectFilter}
					options={projectFilterOptions}
					label="Filtrer par Project"
					triggerClass="min-w-32 max-w-56"
				/>
			</div>
		</div>
	{/if}
	{#if !visible.length}
		<p
			class="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600"
		>
			{data.history ? 'Aucune Task terminée ou annulée.' : 'Aucune Task dans cette vue.'}
		</p>
	{:else}
		{#each data.history ? [{ key: 'history', label: 'Historique' }] : groups as group (group.key)}
			{@const items = data.history
				? visible
				: visible.filter((task) => taskGroup(task, today, nowTime) === group.key)}
			{#if items.length}
				<section class="space-y-3">
					<h2 class="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase">
						{group.label} <span class="text-slate-400">{items.length}</span>
					</h2>
					{#each items as task (task.id)}<TaskCard
							{task}
							onStatus={changeStatus}
							projectOptions={data.projectOptions}
							onMove={move}
						/>{/each}
				</section>
			{/if}
		{/each}
	{/if}
</div>
