<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { postAction } from '$lib/post-action';
	import { groupHomeTasks } from '$lib/domain/home';
	import {
		dueShortcutLabels,
		dueShortcuts,
		shortcutDueDate,
		takeDueCommand,
		type DueShortcut
	} from '$lib/domain/quick-task-date';
	import type { TaskStatus } from '$lib/domain/tasks';
	import TaskCard from './tasks/TaskCard.svelte';
	import type { PageData } from './$types';
	import { onDestroy, onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	type Notice = { id: string; message: string; state: 'pending' | 'classified' | 'failed' };

	let { data }: { data: PageData } = $props();
	let content = $state('');
	let dueDate = $state<string | null>(null);
	let dueLabel = $state('');
	let calendarOpen = $state(false);
	let suggestionsOpen = $state(true);
	let activeSuggestion = $state(0);
	let dateInput = $state<HTMLInputElement>();
	let matchingCommands = $derived(
		content.startsWith('/')
			? [...dueShortcuts, 'date' as const].filter((command) => command.startsWith(content.slice(1)))
			: []
	);
	let formattedDate = $derived(
		dueDate
			? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
					new Date(`${dueDate}T00:00:00`)
				)
			: ''
	);
	let saving = $state(false);
	let error = $state('');
	let requestKey = $state<string | null>(null);
	let requestContent = $state('');
	let requestDueDate = $state<string | null>(null);
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

	function chooseDueShortcut(shortcut: DueShortcut) {
		dueDate = shortcutDueDate(shortcut, new Date());
		dueLabel = dueShortcutLabels[shortcut];
		calendarOpen = false;
		error = '';
	}

	async function openCalendar() {
		calendarOpen = true;
		await tick();
		dateInput?.focus();
		try {
			dateInput?.showPicker();
		} catch {
			// The visible date field remains available when the native picker cannot open.
		}
	}

	function selectDueCommand(command: DueShortcut | 'date') {
		if (content.startsWith('/')) content = content.replace(/^\/\S* ?/, '');
		suggestionsOpen = false;
		if (command === 'date') void openCalendar();
		else {
			chooseDueShortcut(command);
			form.querySelector('textarea')?.focus();
		}
	}

	function onCaptureInput(event: Event) {
		const input = event.currentTarget as HTMLTextAreaElement;
		const parsed = takeDueCommand(input.value);
		if (parsed) {
			input.value = parsed.rest;
			content = parsed.rest;
			suggestionsOpen = false;
			if (parsed.command === 'date') void openCalendar();
			else chooseDueShortcut(parsed.command);
		} else {
			content = input.value;
			suggestionsOpen = true;
			activeSuggestion = 0;
		}
		error = '';
	}

	function selectDueDate(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		if (!value) return;
		dueDate = value;
		dueLabel = 'Échéance';
		calendarOpen = false;
		form.querySelector('textarea')?.focus();
	}

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
		const selectedDueDate = dueDate;
		const key =
			requestKey && requestContent === submitted && requestDueDate === selectedDueDate
				? requestKey
				: crypto.randomUUID();
		requestKey = key;
		requestContent = submitted;
		requestDueDate = selectedDueDate;
		const data = new FormData();
		data.set('rawContent', submitted);
		data.set('kind', 'entry');
		data.set('requestId', key);
		data.set('dueDate', selectedDueDate ?? '');
		const result = await postAction('/?/capture', data);
		if (result.ok) {
			if (content === submitted && dueDate === selectedDueDate) {
				content = '';
				dueDate = null;
				dueLabel = '';
				calendarOpen = false;
				requestKey = null;
				requestContent = '';
				requestDueDate = null;
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
		if (event.isComposing) return;
		const input = event.currentTarget as HTMLTextAreaElement;
		if (
			event.key === 'Backspace' &&
			dueDate &&
			input.selectionStart === 0 &&
			input.selectionEnd === 0
		) {
			event.preventDefault();
			dueDate = null;
			dueLabel = '';
			calendarOpen = false;
			return;
		}
		if (suggestionsOpen && matchingCommands.length) {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				activeSuggestion =
					(activeSuggestion + (event.key === 'ArrowDown' ? 1 : -1) + matchingCommands.length) %
					matchingCommands.length;
				return;
			}
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				selectDueCommand(matchingCommands[activeSuggestion] ?? matchingCommands[0]);
				return;
			}
		}
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			form.requestSubmit(entryButton);
		}
		if (event.key === 'Escape') {
			suggestionsOpen = false;
			calendarOpen = false;
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
			class="relative rounded-xl border border-slate-300 bg-white p-2 transition-[border-color,box-shadow] duration-150 focus-within:border-slate-500 focus-within:shadow-[0_0_0_3px_rgba(148,163,184,0.14)]"
		>
			<label for="capture" class="sr-only">Qu’est-ce qui te passe par la tête ?</label>
			<div class="flex items-center gap-2">
				{#if dueDate}
					<span
						class="flex max-w-[45vw] min-w-0 shrink-0 items-center rounded-md bg-slate-100 text-xs text-slate-700"
					>
						<button
							type="button"
							class="ui-focus min-h-9 min-w-0 truncate rounded-l-md px-2"
							aria-label={`Modifier l’échéance ${dueLabel} ${formattedDate}`}
							onclick={openCalendar}>{dueLabel} · {formattedDate}</button
						>
						<button
							type="button"
							class="ui-focus min-h-9 rounded-r-md px-2"
							aria-label="Retirer l’échéance"
							onclick={() => {
								dueDate = null;
								dueLabel = '';
								calendarOpen = false;
								form.querySelector('textarea')?.focus();
							}}>×</button
						>
					</span>
				{/if}
				<textarea
					id="capture"
					role="combobox"
					aria-autocomplete="list"
					aria-expanded={suggestionsOpen && matchingCommands.length > 0}
					aria-controls={suggestionsOpen && matchingCommands.length
						? 'capture-due-suggestions'
						: undefined}
					aria-activedescendant={suggestionsOpen && matchingCommands.length
						? `capture-due-suggestion-${activeSuggestion}`
						: undefined}
					name="rawContent"
					value={content}
					oninput={onCaptureInput}
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
			{#if suggestionsOpen && matchingCommands.length}
				<div
					id="capture-due-suggestions"
					role="listbox"
					class="absolute top-full left-2 z-20 mt-1 flex w-[min(18rem,calc(100vw-2rem))] flex-col rounded-xl border border-slate-300 bg-white p-1 shadow-lg"
					aria-label="Raccourcis d’échéance"
				>
					{#each matchingCommands as command, index (command)}
						<button
							id={`capture-due-suggestion-${index}`}
							role="option"
							aria-selected={activeSuggestion === index}
							type="button"
							class="ui-focus flex min-h-10 items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-slate-100"
							class:bg-slate-100={activeSuggestion === index}
							onmouseenter={() => (activeSuggestion = index)}
							onclick={() => selectDueCommand(command)}
						>
							<span>/{command}</span>
							<span class="text-slate-500"
								>{command === 'date' ? 'Choisir une date' : dueShortcutLabels[command]}</span
							>
						</button>
					{/each}
				</div>
			{/if}
			{#if calendarOpen}
				<div
					class="absolute top-full left-2 z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-300 bg-white p-4 shadow-lg"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<label for="capture-due-date" class="text-sm font-medium">Choisir une échéance</label>
						<button
							type="button"
							class="ui-focus rounded-lg px-2 text-slate-500 hover:bg-slate-100"
							aria-label="Fermer le calendrier"
							onclick={() => {
								calendarOpen = false;
								form.querySelector('textarea')?.focus();
							}}>×</button
						>
					</div>
					<input
						bind:this={dateInput}
						id="capture-due-date"
						type="date"
						value={dueDate ?? ''}
						onchange={selectDueDate}
						class="ui-focus min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
					/>
				</div>
			{/if}
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
