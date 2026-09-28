<script lang="ts">
	import { postAction } from '$lib/post-action';
	import { onDestroy } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';

	type Notice = { id: string; message: string; state: 'pending' | 'classified' | 'failed' };

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

	function kindLabel(kind: unknown) {
		if (kind === 'task') return 'Task';
		if (kind === 'project') return 'Project';
		if (kind === 'vision') return 'Vision';
		return null;
	}

	function classificationNotice(kind: unknown, relationTitle: unknown) {
		const label = kindLabel(kind);
		if (!label) return 'Capture classée';
		const parent = typeof relationTitle === 'string' && relationTitle.trim() ? relationTitle : null;
		if (kind === 'task')
			return `Classée en ${label} · ${parent ? `Projet : ${parent}` : 'Sans projet'}`;
		if (kind === 'project')
			return `Classée en ${label} · ${parent ? `Vision : ${parent}` : 'Sans vision'}`;
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
		} else if (result.data?.status === 'failed') {
			setNotice(id, 'Non classée · Inbox', 'failed');
			timers.delete(id);
		} else {
			scheduleStatus(id);
		}
	}

	onDestroy(() => {
		mounted = false;
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
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
		} else if (!result.ok) {
			setNotice(id, result.error || 'Relance impossible', 'failed');
		} else {
			setNotice(id, 'Enregistrée · classement en cours…', 'pending');
			scheduleStatus(id);
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
	<title>Collector · Get Things Done</title>
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

<div class="w-full max-w-5xl space-y-5">
	<div class="space-y-2">
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Capture rapide</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Collector</h1>
	</div>

	<form
		bind:this={form}
		method="POST"
		action="?/capture"
		onsubmit={submit}
		class="rounded-xl border border-slate-300 bg-white p-2"
	>
		<label for="capture" class="sr-only">Qu’est-ce qui te passe par la tête ?</label>
		<div class="flex items-end gap-2">
			<textarea
				id="capture"
				name="rawContent"
				bind:value={content}
				onkeydown={onKeydown}
				placeholder="Qu’est-ce qui te passe par la tête ?"
				rows="2"
				class="ui-focus min-w-0 flex-1 resize-none rounded-lg border-0 bg-transparent px-2 py-1 text-base leading-6 placeholder:text-slate-400"
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
	<p class="text-xs text-slate-500">Entrée pour capturer · Maj + Entrée pour une nouvelle ligne</p>
</div>
