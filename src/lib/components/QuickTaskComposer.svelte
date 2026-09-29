<script lang="ts">
	import { tick } from 'svelte';
	import {
		dueShortcutLabels,
		dueShortcuts,
		shortcutDueDate,
		takeDueCommand,
		type DueShortcut
	} from '$lib/domain/quick-task-date';

	let {
		id,
		label,
		onCreate
	}: {
		id: string;
		label: string;
		onCreate: (title: string, dueDate: string | null) => Promise<{ ok: boolean; error?: string }>;
	} = $props();

	let title = $state('');
	let dueDate = $state<string | null>(null);
	let dueLabel = $state('');
	let calendarOpen = $state(false);
	let creating = $state(false);
	let error = $state('');
	let titleInput: HTMLInputElement;
	let dateInput = $state<HTMLInputElement>();
	let matchingCommands = $derived(
		title.startsWith('/')
			? [...dueShortcuts, 'date' as const].filter((command) => command.startsWith(title.slice(1)))
			: []
	);
	let formattedDate = $derived(
		dueDate
			? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
					new Date(`${dueDate}T00:00:00`)
				)
			: ''
	);

	function chooseShortcut(shortcut: DueShortcut) {
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

	function selectCommand(command: DueShortcut | 'date') {
		if (title.startsWith('/')) title = title.replace(/^\/\S* ?/, '');
		if (command === 'date') void openCalendar();
		else {
			chooseShortcut(command);
			titleInput?.focus();
		}
	}

	function onTitleInput(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = input.value;
		const parsed = takeDueCommand(value);
		if (parsed) {
			input.value = parsed.rest;
			title = parsed.rest;
			if (parsed.command === 'date') void openCalendar();
			else chooseShortcut(parsed.command);
		} else title = value;
		error = '';
	}

	function selectDate(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		if (!value) return;
		dueDate = value;
		dueLabel = 'Échéance';
		calendarOpen = false;
		titleInput?.focus();
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (creating) return;
		if (!title.trim()) {
			error = 'Saisis un titre pour la Task.';
			return;
		}
		const submittedTitle = title;
		const submittedDate = dueDate;
		creating = true;
		error = '';
		try {
			const result = await onCreate(submittedTitle, submittedDate);
			if (result.ok) {
				if (title === submittedTitle && dueDate === submittedDate) {
					title = '';
					dueDate = null;
					dueLabel = '';
					calendarOpen = false;
				}
				titleInput?.focus();
			} else error = result.error || 'Création impossible. Réessaie.';
		} catch {
			error = 'Création impossible. Réessaie.';
		} finally {
			creating = false;
		}
	}
</script>

<div class="relative">
	<form
		onsubmit={submit}
		class="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
	>
		<div class="flex min-w-48 flex-1 items-center gap-2 rounded-lg border border-slate-300 px-2">
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
							titleInput?.focus();
						}}>×</button
					>
				</span>
			{/if}
			<label for={id} class="sr-only">{label}</label>
			<input
				bind:this={titleInput}
				{id}
				value={title}
				oninput={onTitleInput}
				onkeydown={(event) => {
					if (event.key === 'Enter') {
						const command = /^\/(today|thisweek|thismonth|thisyear|date)$/.exec(title);
						if (command) {
							event.preventDefault();
							selectCommand(command[1] as DueShortcut | 'date');
						}
					}
					if (event.key === 'Escape') calendarOpen = false;
				}}
				placeholder="Nouvelle Task…"
				maxlength="500"
				class="ui-focus min-h-11 min-w-20 flex-1 border-0 bg-transparent text-sm outline-none"
			/>
		</div>
		<button type="submit" disabled={creating} class="ui-button ui-button-primary ui-focus"
			>{creating ? 'Création…' : 'Ajouter'}</button
		>
		{#if error}<p role="alert" class="w-full text-sm text-red-700">{error}</p>{/if}
	</form>

	{#if matchingCommands.length}
		<div
			class="absolute top-full left-4 z-20 mt-1 flex w-[min(18rem,calc(100vw-2rem))] flex-col rounded-xl border border-slate-300 bg-white p-1 shadow-lg"
			aria-label="Raccourcis d’échéance"
		>
			{#each matchingCommands as command (command)}
				<button
					type="button"
					class="ui-focus flex min-h-10 items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-slate-100"
					onclick={() => selectCommand(command)}
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
			class="absolute top-full left-4 z-20 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-slate-300 bg-white p-4 shadow-lg"
		>
			<div class="mb-3 flex items-center justify-between gap-2">
				<label for={`${id}-date`} class="text-sm font-medium">Choisir une échéance</label>
				<button
					type="button"
					class="ui-focus rounded-lg px-2 text-slate-500 hover:bg-slate-100"
					aria-label="Fermer le calendrier"
					onclick={() => {
						calendarOpen = false;
						titleInput?.focus();
					}}>×</button
				>
			</div>
			<input
				bind:this={dateInput}
				id={`${id}-date`}
				type="date"
				value={dueDate ?? ''}
				onchange={selectDate}
				class="ui-focus min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
			/>
		</div>
	{/if}
</div>
