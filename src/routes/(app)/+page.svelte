<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { postAction } from '$lib/post-action';
	import { groupHomeTasks } from '$lib/domain/home';
	import type { TaskStatus } from '$lib/domain/tasks';
	import TaskCard from './tasks/TaskCard.svelte';
	import type { PageData } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	type Notice = { id: string; message: string; state: 'pending' | 'classified' | 'failed' };

	let { data }: { data: PageData } = $props();
	let content = $state('');
	let saving = $state(false);
	let error = $state('');
	let requestKey = $state<string | null>(null);
	let requestContent = $state('');
	let notices = $state<Notice[]>([]);
	let form: HTMLFormElement;
	let entryButton: HTMLButtonElement;
	const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	let mounted = true;
	let clock = $state<{ today: string; nowTime: string } | null>(null);
	let groups = $derived(clock ? groupHomeTasks(data.tasks, clock.today, clock.nowTime) : null);
	let clockTimer: ReturnType<typeof setInterval> | undefined;
	let taskError = $state('');
	let taskBusy = $state(false);
	let undo = $state<{ id: string; status: TaskStatus; label: string } | null>(null);
	let moveUndo = $state<{ id: string; projectId: string | null; position: number | null } | null>(
		null
	);
	let undoTimer: ReturnType<typeof setTimeout> | undefined;
	const sections = [
		{ key: 'late', label: 'Late', empty: 'Aucune Task en retard.' },
		{ key: 'in_progress', label: 'In Progress', empty: 'Aucune Task en cours.' },
		{ key: 'today', label: 'Today', empty: 'Aucune Task prévue aujourd’hui.' }
	] as const;

	function updateClock() {
		const now = new Date();
		clock = { today: now.toLocaleDateString('sv-SE'), nowTime: now.toTimeString().slice(0, 5) };
	}

	function statusForm(id: string, status: TaskStatus) {
		const fields = new FormData();
		fields.set('id', id);
		fields.set('status', status);
		return fields;
	}

	async function changeStatus(
		id: string,
		status: TaskStatus,
		previous: TaskStatus,
		isUndo = false
	) {
		if (taskBusy) return false;
		taskBusy = true;
		taskError = '';
		const result = await postAction('/?/taskStatus', statusForm(id, status));
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
		} else taskError = result.error || 'Action impossible. Réessaie.';
		taskBusy = false;
		return result.ok;
	}

	async function moveTask(id: string, projectId: string, isUndo = false, position?: number) {
		if (taskBusy) return false;
		taskBusy = true;
		taskError = '';
		const fields = new FormData();
		fields.set('id', id);
		fields.set('projectId', projectId);
		if (position !== undefined) fields.set('position', String(position));
		const result = await postAction('/?/moveTask', fields);
		if (result.ok) {
			moveUndo = isUndo
				? null
				: {
						id,
						projectId: (result.data?.previousProjectId as string | null) ?? null,
						position: (result.data?.previousPosition as number | null) ?? null
					};
			await invalidateAll();
		} else taskError = result.error || 'Déplacement impossible. Réessaie.';
		taskBusy = false;
		return result.ok;
	}

	function kindLabel(kind: unknown) {
		if (kind === 'task') return 'Task';
		if (kind === 'project') return 'Project';
		return null;
	}

	function classificationNotice(kind: unknown, relationTitle: unknown) {
		const label = kindLabel(kind);
		if (!label) return 'Capture classée';
		const parent = typeof relationTitle === 'string' && relationTitle.trim() ? relationTitle : null;
		if (kind === 'task')
			return `Classée en ${label} · ${parent ? `Projet : ${parent}` : 'Sans projet'}`;
		return `Classée en ${label}`;
	}

	function setNotice(id: string, message: string, state: Notice['state']) {
		const next = [{ id, message, state }, ...notices.filter((item) => item.id !== id)].slice(0, 3);
		for (const activeId of timers.keys()) {
			if (!next.some((item) => item.id === activeId)) {
				clearTimeout(timers.get(activeId));
				timers.delete(activeId);
			}
		}
		notices = next;
	}

	function dismissNotice(id: string) {
		clearTimeout(timers.get(id));
		timers.delete(id);
		notices = notices.filter((item) => item.id !== id);
	}

	function scheduleStatus(id: string, delay = 1200) {
		clearTimeout(timers.get(id));
		timers.set(
			id,
			setTimeout(() => void pollStatus(id), delay)
		);
	}

	async function pollStatus(id: string) {
		if (!mounted || !notices.some((item) => item.id === id)) return;
		const data = new FormData();
		data.set('id', id);
		const result = await postAction('/?/status', data);
		if (!mounted || !notices.some((item) => item.id === id)) return;
		if (!result.ok) {
			scheduleStatus(id, 3000);
			return;
		}
		if (result.data?.status === 'classified') {
			setNotice(
				id,
				classificationNotice(result.data.kind, result.data.relationTitle),
				'classified'
			);
			timers.delete(id);
			await invalidateAll();
		} else if (result.data?.status === 'failed') {
			setNotice(id, 'Non classée · Revue', 'failed');
			timers.delete(id);
			await invalidateAll();
		} else {
			scheduleStatus(id);
		}
	}

	onMount(() => {
		updateClock();
		clockTimer = setInterval(updateClock, 60_000);
	});

	onDestroy(() => {
		mounted = false;
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
		clearInterval(clockTimer);
		clearTimeout(undoTimer);
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		if (!content.trim()) {
			error = 'Saisis une capture avant de l’enregistrer.';
			return;
		}
		saving = true;
		error = '';
		const submitted = content;
		const key = requestKey && requestContent === submitted ? requestKey : crypto.randomUUID();
		requestKey = key;
		requestContent = submitted;
		const data = new FormData();
		data.set('rawContent', submitted);
		data.set('kind', 'entry');
		data.set('requestId', key);
		const result = await postAction('/?/capture', data);
		if (result.ok) {
			if (content === submitted) {
				content = '';
				requestKey = null;
				requestContent = '';
			}
			const id = result.data?.entryId;
			if (typeof id === 'string') {
				if (result.data?.status === 'saved_pending_classification') {
					setNotice(id, 'Enregistrée · classement en cours…', 'pending');
					scheduleStatus(id);
				} else {
					setNotice(
						id,
						classificationNotice(result.data?.kind, result.data?.relationTitle),
						'classified'
					);
					await invalidateAll();
				}
			} else {
				setNotice(key, 'Capture enregistrée', 'classified');
			}
			form.querySelector('textarea')?.focus();
		} else {
			error = result.error || 'Enregistrement impossible. Réessaie.';
		}
		saving = false;
	}

	async function retryClassification(id: string) {
		setNotice(id, 'Relance de Jev…', 'pending');
		const data = new FormData();
		data.set('id', id);
		const result = await postAction('/?/retry', data);
		if (result.ok && result.data?.status === 'saved_and_classified') {
			setNotice(
				id,
				classificationNotice(result.data.kind, result.data.relationTitle),
				'classified'
			);
			await invalidateAll();
		} else if (!result.ok) {
			setNotice(id, result.error || 'Relance impossible', 'failed');
		} else {
			setNotice(id, 'Enregistrée · classement en cours…', 'pending');
			scheduleStatus(id);
			await invalidateAll();
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			form.requestSubmit(entryButton);
		}
	}
</script>

<svelte:head>
	<title>Accueil · Get Things Done</title>
</svelte:head>

<div
	class="fixed top-20 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
	aria-live="polite"
>
	{#each notices as notice (notice.id)}
		<div
			class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg"
		>
			<span
				class:animate-pulse={notice.state === 'pending'}
				class="min-w-0 flex-1 font-medium break-words text-slate-900">{notice.message}</span
			>
			{#if notice.state === 'failed'}
				<button
					type="button"
					class="ui-focus text-sm font-semibold text-slate-900 underline"
					onclick={() => retryClassification(notice.id)}>Réessayer</button
				>
			{/if}
			<button
				type="button"
				class="ui-focus text-slate-500"
				aria-label="Masquer la notification"
				onclick={() => dismissNotice(notice.id)}>×</button
			>
		</div>
	{/each}
</div>

<div class="w-full max-w-5xl space-y-8">
	<div class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Capture rapide</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Accueil</h1>
	</div>

	<div class="space-y-3">
		<form
			bind:this={form}
			method="POST"
			action="?/capture"
			onsubmit={submit}
			class="rounded-xl border border-slate-300 bg-white p-2 transition-[border-color,box-shadow] duration-150 focus-within:border-slate-500 focus-within:shadow-[0_0_0_3px_rgba(148,163,184,0.14)]"
		>
			<label for="capture" class="sr-only">Qu’est-ce qui te passe par la tête ?</label>
			<div class="flex items-center gap-2">
				<textarea
					id="capture"
					name="rawContent"
					bind:value={content}
					onkeydown={onKeydown}
					placeholder="Qu’est-ce qui te passe par la tête ?"
					rows="1"
					style="field-sizing: content"
					class="max-h-40 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-lg border-0 bg-transparent px-2 py-2.5 text-base leading-6 outline-none placeholder:text-slate-400"
				></textarea>
				<button
					bind:this={entryButton}
					type="submit"
					name="kind"
					value="entry"
					disabled={saving}
					class="ui-button ui-button-primary ui-focus shrink-0"
				>
					{saving ? 'En cours…' : 'Capture'}
				</button>
			</div>
			{#if error}<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>{/if}
		</form>
		<p class="text-xs text-slate-500">
			Entrée pour capturer · Maj + Entrée pour une nouvelle ligne
		</p>
		{#if data.reviewAttention.unreviewed || data.reviewAttention.failed}
			<a href={resolve('/review')} class="ui-focus inline-block text-sm text-slate-600 underline">
				Revue · {data.reviewAttention.unreviewed} à confirmer · {data.reviewAttention.failed} en échec
			</a>
		{/if}
	</div>

	<div class="space-y-7" aria-label="Tasks à suivre">
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
						moveTask(moveUndo.id, moveUndo.projectId ?? '', true, moveUndo.position ?? undefined)}
					>Annuler le déplacement</button
				>
			</div>{/if}
		{#if taskError}<p role="alert" class="text-sm text-red-700">{taskError}</p>{/if}
		{#if groups}
			{#each sections as section (section.key)}
				{@const items = groups[section.key]}
				<section class="space-y-3" aria-labelledby={`home-${section.key}`}>
					<h2
						id={`home-${section.key}`}
						class="text-xs font-semibold tracking-[0.16em] text-slate-500 uppercase"
					>
						{section.label} <span class="text-slate-400">{items.length}</span>
					</h2>
					{#if items.length}
						{#each items as task (task.id)}
							<TaskCard
								{task}
								onStatus={changeStatus}
								projectOptions={data.projectOptions}
								onMove={(id, projectId) => moveTask(id, projectId)}
							/>
						{/each}
					{:else}
						<p
							class="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500"
						>
							{section.empty}
						</p>
					{/if}
				</section>
			{/each}
		{/if}
	</div>
</div>
