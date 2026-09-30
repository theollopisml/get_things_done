<script lang="ts">
	import { Dialog } from 'bits-ui';

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel,
		onConfirm,
		busy = false,
		error = ''
	}: {
		open: boolean;
		title: string;
		description: string;
		confirmLabel: string;
		onConfirm: () => void | Promise<void>;
		busy?: boolean;
		error?: string;
	} = $props();
</script>

<Dialog.Root bind:open>
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
			<Dialog.Title class="text-xl font-semibold text-slate-950">{title}</Dialog.Title>
			<Dialog.Description class="mt-3 text-sm leading-6 text-slate-600"
				>{description}</Dialog.Description
			>
			{#if error}<p role="alert" class="mt-4 text-sm text-red-700">{error}</p>{/if}
			<div class="mt-6 flex flex-wrap justify-end gap-2">
				<button
					type="button"
					disabled={busy}
					onclick={() => (open = false)}
					class="ui-button ui-button-quiet ui-focus">Retour</button
				>
				<button
					type="button"
					disabled={busy}
					onclick={onConfirm}
					class="ui-button ui-button-primary ui-focus">{busy ? 'En cours…' : confirmLabel}</button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
