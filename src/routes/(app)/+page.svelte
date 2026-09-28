<script lang="ts">
	import { postAction } from '$lib/post-action';
	import type { CaptureKind } from '$lib/domain/capture';

	let content = $state('');
	let saving = $state(false);
	let error = $state('');
	let feedback = $state('');
	let form: HTMLFormElement;
	let entryButton: HTMLButtonElement;

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		const submitter = event.submitter as HTMLButtonElement | null;
		const kind = (submitter?.value || 'entry') as CaptureKind;
		if (!content.trim()) {
			error = 'Saisis une capture avant de l’enregistrer.';
			return;
		}
		saving = true;
		error = '';
		feedback = '';
		const submitted = content;
		const data = new FormData();
		data.set('rawContent', submitted);
		data.set('kind', kind);
		const result = await postAction('/?/capture', data);
		if (result.ok) {
			if (content === submitted) content = '';
			feedback =
				kind === 'entry'
					? 'Capture ajoutée à l’Inbox.'
					: `${kind === 'task' ? 'Task' : kind === 'project' ? 'Project' : 'Vision'} créé.`;
			form.querySelector('textarea')?.focus();
		} else {
			error = result.error || 'Enregistrement impossible. Réessaie.';
		}
		saving = false;
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

<div class="mx-auto max-w-3xl space-y-8">
	<div class="space-y-3">
		<p class="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">Capture rapide</p>
		<h1 class="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Collector</h1>
		<p class="text-sm leading-6 text-slate-600">
			Dépose une idée ici. Tu pourras la classer plus tard dans l’Inbox.
		</p>
	</div>

	<form
		bind:this={form}
		method="POST"
		action="?/capture"
		onsubmit={submit}
		class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
	>
		<label for="capture" class="sr-only">Qu’est-ce qui te passe par la tête ?</label>
		<textarea
			id="capture"
			name="rawContent"
			bind:value={content}
			onkeydown={onKeydown}
			placeholder="Qu’est-ce qui te passe par la tête ?"
			rows="6"
			class="ui-focus w-full resize-y rounded-lg border border-slate-200 p-4 text-base leading-7 placeholder:text-slate-400"
		></textarea>
		<p class="mt-2 text-xs text-slate-500">
			Entrée pour capturer · Maj + Entrée pour une nouvelle ligne
		</p>
		{#if error}<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>{/if}
		{#if feedback}<p role="status" class="mt-3 text-sm text-green-700">{feedback}</p>{/if}
		<div class="mt-5 flex flex-wrap gap-2">
			<button
				bind:this={entryButton}
				type="submit"
				name="kind"
				value="entry"
				disabled={saving}
				class="ui-button ui-button-primary ui-focus"
			>
				{saving ? 'Enregistrement…' : 'Capturer dans l’Inbox'}
			</button>
			<button
				type="submit"
				name="kind"
				value="task"
				disabled={saving}
				class="ui-button ui-button-quiet ui-focus">Task</button
			>
			<button
				type="submit"
				name="kind"
				value="project"
				disabled={saving}
				class="ui-button ui-button-quiet ui-focus">Project</button
			>
			<button
				type="submit"
				name="kind"
				value="vision"
				disabled={saving}
				class="ui-button ui-button-quiet ui-focus">Vision</button
			>
		</div>
	</form>
</div>
