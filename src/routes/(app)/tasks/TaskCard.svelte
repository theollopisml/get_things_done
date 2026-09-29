<script lang="ts">
	import { beforeNavigate, invalidateAll } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { onDestroy } from 'svelte';
	import MarkdownPreview from '$lib/components/MarkdownPreview.svelte';
	import SelectMenu from '$lib/components/SelectMenu.svelte';
	import { recurrenceLabel, recurrenceRuleSchema } from '$lib/domain/recurrence';
	import type { TaskStatus } from '$lib/domain/tasks';
	import { postAction } from '$lib/post-action';
	import type { PageData } from './$types';

	type Task = PageData['tasks'][number];
	const weekdays = [
		{ day: 1, label: 'Lun' },
		{ day: 2, label: 'Mar' },
		{ day: 3, label: 'Mer' },
		{ day: 4, label: 'Jeu' },
		{ day: 5, label: 'Ven' },
		{ day: 6, label: 'Sam' },
		{ day: 7, label: 'Dim' }
	];
	let {
		task,
		onStatus,
		projectOptions = [],
		onMove
	}: {
		task: Task;
		onStatus: (
			id: string,
			status: TaskStatus,
			previous: TaskStatus,
			expectedDate?: string | null
		) => Promise<boolean>;
		projectOptions?: { id: string; title: string }[];
		onMove?: (id: string, projectId: string) => Promise<boolean>;
	} = $props();
	let moveOptions = $derived([
		{ value: '', label: 'Aucun' },
		...projectOptions.map((option) => ({ value: option.id, label: option.title }))
	]);
	let editing = $state(false);
	let closing = $state(false);
	let preview = $state(false);
	let busy = $state(false);
	// A draft keeps the recurrence present when the editor first opens.
	// svelte-ignore state_referenced_locally
	const initialRule = recurrenceRuleSchema.safeParse(task.recurrenceRule);
	const rule = initialRule.success ? initialRule.data : null;
	let displayRule = $derived.by(() => {
		const parsed = recurrenceRuleSchema.safeParse(task.recurrenceRule);
		return parsed.success ? parsed.data : null;
	});
	// Local edits intentionally retain their initial values across server invalidation.
	// svelte-ignore state_referenced_locally
	let value = $state({
		title: task.title,
		description: task.description ?? '',
		scheduledDate: task.scheduledDate ?? '',
		scheduledTime: task.scheduledTime?.slice(0, 5) ?? '',
		dueDate: task.dueDate ?? '',
		dueTime: task.dueTime?.slice(0, 5) ?? '',
		recurrenceFrequency: rule?.frequency ?? '',
		recurrenceInterval: rule?.interval ?? 1,
		recurrenceWeekdays:
			rule?.frequency === 'weekly'
				? rule.weekdays
				: [
						new Date(
							`${task.scheduledDate ?? new Date().toLocaleDateString('sv-SE')}T12:00:00`
						).getDay() || 7
					],
		recurrenceDay:
			rule?.frequency === 'monthly'
				? rule.day
				: Number((task.scheduledDate ?? new Date().toLocaleDateString('sv-SE')).slice(-2))
	});
	const initial = JSON.stringify(value);
	let saved = $state(initial);
	let saving = $state(false);
	let error = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<boolean> | null = null;
	let titleInput: HTMLInputElement | undefined;
	const labels: Record<TaskStatus, string> = {
		todo: 'À faire',
		in_progress: 'En cours',
		done: 'Terminée',
		cancelled: 'Annulée'
	};

	$effect(() => {
		const scheduledDate = task.scheduledDate ?? '';
		if (!editing && JSON.stringify(value) === saved && value.scheduledDate !== scheduledDate) {
			value.scheduledDate = scheduledDate;
			saved = JSON.stringify(value);
		}
	});

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
		const fields = JSON.parse(snapshot) as typeof value;
		for (const key of [
			'title',
			'description',
			'scheduledDate',
			'scheduledTime',
			'dueDate',
			'dueTime'
		] as const) {
			data.set(key, fields[key]);
		}
		const recurrenceRule =
			fields.recurrenceFrequency === 'daily'
				? { frequency: 'daily', interval: Number(fields.recurrenceInterval) }
				: fields.recurrenceFrequency === 'weekly'
					? {
							frequency: 'weekly',
							interval: Number(fields.recurrenceInterval),
							weekdays: fields.recurrenceWeekdays
						}
					: fields.recurrenceFrequency === 'monthly'
						? {
								frequency: 'monthly',
								interval: Number(fields.recurrenceInterval),
								day: Number(fields.recurrenceDay)
							}
						: null;
		data.set('recurrenceRule', recurrenceRule ? JSON.stringify(recurrenceRule) : '');
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
			else if (!editing) await invalidateAll();
		}
		return ok;
	}

	async function closeEdit() {
		if (closing) return;
		closing = true;
		if (await save()) {
			editing = false;
			await invalidateAll();
		}
		closing = false;
	}

	async function status(next: TaskStatus) {
		if (busy || !(await save())) return;
		busy = true;
		const changed = await onStatus(
			task.id,
			next,
			task.status,
			value.recurrenceFrequency ? value.scheduledDate : null
		);
		if (changed && value.recurrenceFrequency) editing = false;
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

<Dialog.Root bind:open={editing}>
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
					{displayRule ? ` · ${recurrenceLabel(displayRule)}` : ''}
				</p>
			</div>
			<div class="flex flex-wrap gap-2">
				{#if onMove}<div class="flex items-center gap-2 text-sm text-slate-600">
						<span>Project</span>
						<SelectMenu
							value={task.projectId ?? ''}
							options={moveOptions}
							label={`Project de ${task.title}`}
							disabled={busy}
							onSelect={(next) => onMove?.(task.id, next)}
							triggerClass="min-w-32 max-w-52"
						/>
					</div>{/if}
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
				<Dialog.Trigger class="ui-button ui-button-quiet ui-focus">Modifier</Dialog.Trigger>
			</div>
		</div>
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
					<Dialog.Title class="text-xl font-semibold text-slate-950">Modifier la Task</Dialog.Title>
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
				<label class="grid gap-1 text-sm sm:col-span-2"
					>Titre<input
						bind:this={titleInput}
						bind:value={value.title}
						oninput={schedule}
						maxlength="500"
						class="ui-focus min-h-11 w-full rounded-lg border border-slate-300 px-3"
					/></label
				>
				<div class="space-y-2 sm:col-span-2">
					<div class="flex items-center justify-between gap-3">
						{#if preview}<span class="text-sm">Description Markdown</span>{:else}<label
								for={`task-description-${task.id}`}
								class="text-sm">Description Markdown</label
							>{/if}
						<button
							type="button"
							aria-pressed={preview}
							onclick={() => (preview = !preview)}
							class="ui-button ui-button-quiet ui-focus">{preview ? 'Éditer' : 'Aperçu'}</button
						>
					</div>
					{#if preview}
						<div
							aria-label="Aperçu de la description"
							class="min-h-28 rounded-lg border border-slate-300 bg-white p-3"
						>
							<MarkdownPreview source={value.description} />
						</div>
					{:else}
						<textarea
							id={`task-description-${task.id}`}
							bind:value={value.description}
							oninput={schedule}
							rows="4"
							class="ui-focus w-full rounded-lg border border-slate-300 p-3"></textarea>
					{/if}
				</div>
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
				<div class="grid gap-3 rounded-xl border border-slate-200 p-3 sm:col-span-2">
					<label class="grid gap-1 text-sm"
						>Récurrence
						<select
							bind:value={value.recurrenceFrequency}
							onchange={() => {
								if (value.recurrenceFrequency) {
									value.dueDate = '';
									value.dueTime = '';
								}
								schedule();
							}}
							class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
						>
							<option value="">Aucune</option><option value="daily">Tous les jours</option>
							<option value="weekly">Certains jours de la semaine</option>
							<option value="monthly">Chaque mois</option>
						</select>
					</label>
					{#if value.recurrenceFrequency}
						<p class="text-xs text-slate-500">
							La date planifiée est la première occurrence. Modifie-la ensuite pour reporter une
							occurrence sans changer la cadence.
						</p>
						<label class="grid gap-1 text-sm"
							>Intervalle
							<input
								type="number"
								min="1"
								max="365"
								bind:value={value.recurrenceInterval}
								oninput={schedule}
								class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
							/>
						</label>
						{#if value.recurrenceFrequency === 'weekly'}
							<fieldset class="flex flex-wrap gap-3 text-sm">
								<legend>Jours</legend>
								{#each weekdays as weekday (weekday.day)}<label class="flex items-center gap-1"
										><input
											type="checkbox"
											checked={value.recurrenceWeekdays.includes(weekday.day)}
											onchange={(event) => {
												value.recurrenceWeekdays = event.currentTarget.checked
													? [...value.recurrenceWeekdays, weekday.day].sort()
													: value.recurrenceWeekdays.filter((day) => day !== weekday.day);
												schedule();
											}}
										/>{weekday.label}</label
									>{/each}
							</fieldset>
						{:else if value.recurrenceFrequency === 'monthly'}
							<label class="grid gap-1 text-sm"
								>Jour du mois
								<input
									type="number"
									min="1"
									max="31"
									bind:value={value.recurrenceDay}
									oninput={schedule}
									class="ui-focus min-h-11 rounded-lg border border-slate-300 px-3"
								/>
							</label>
						{/if}
					{/if}
				</div>
				<label class="grid gap-1 text-sm"
					>Échéance<input
						type="date"
						bind:value={value.dueDate}
						disabled={!!value.recurrenceFrequency}
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
						disabled={!value.dueDate || !!value.recurrenceFrequency}
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
