<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { Time } from '@internationalized/date';
	import { TimeField } from 'bits-ui';

	let {
		value = $bindable(''),
		id,
		label,
		disabled = false,
		help,
		onChange
	}: {
		value?: string;
		id: string;
		label: string;
		disabled?: boolean;
		help?: string;
		onChange?: () => void;
	} = $props();

	let selected = $derived(
		value ? new Time(Number(value.slice(0, 2)), Number(value.slice(3, 5))) : undefined
	);
</script>

<TimeField.Root
	value={selected}
	onValueChange={(time) => {
		value = time
			? `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
			: '';
		onChange?.();
	}}
	placeholder={new Time(12, 0)}
	locale="fr-FR"
	hourCycle={24}
	granularity="minute"
	{disabled}
>
	<div class="group relative grid gap-1 text-sm">
		<div class="flex items-center gap-2">
			<TimeField.Label>{label}</TimeField.Label>
			{#if disabled && help}<button
					type="button"
					aria-label={`Aide : ${label}`}
					aria-describedby={`${id}-help`}
					class="ui-focus flex size-5 items-center justify-center rounded-full border border-slate-400 text-xs text-slate-600"
					>?</button
				>{/if}
		</div>
		<TimeField.Input
			aria-describedby={disabled && help ? `${id}-help` : undefined}
			class="flex min-h-11 min-w-0 items-center rounded-lg border border-slate-300 bg-white px-3 text-slate-900 focus-within:border-slate-500 data-disabled:cursor-not-allowed data-disabled:opacity-60"
		>
			{#snippet children({ segments })}
				{#each segments as { part, value: segment }, index (part + index)}
					<TimeField.Segment
						{part}
						class={part === 'literal'
							? 'px-0.5 text-slate-500'
							: 'ui-focus rounded px-1 py-1 text-slate-900 hover:bg-slate-100 focus:bg-slate-100 data-placeholder:text-slate-500'}
						>{segment}</TimeField.Segment
					>
				{/each}
				{#if value}<button
						type="button"
						class="ui-focus ml-auto flex size-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
						aria-label={`Effacer ${label.toLowerCase()}`}
						onclick={() => {
							value = '';
							onChange?.();
						}}><X aria-hidden="true" class="size-4" /></button
					>{/if}
			{/snippet}
		</TimeField.Input>
		{#if disabled && help}<span
				id={`${id}-help`}
				role="tooltip"
				class="pointer-events-none absolute top-full left-0 z-20 mt-2 w-60 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
				>{help}</span
			>{/if}
	</div>
</TimeField.Root>
