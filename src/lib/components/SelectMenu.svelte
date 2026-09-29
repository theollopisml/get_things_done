<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { Select } from 'bits-ui';

	type Option = { value: string; label: string; disabled?: boolean };

	let {
		value = $bindable(''),
		options,
		label,
		disabled = false,
		triggerClass = '',
		onSelect
	}: {
		value?: string;
		options: Option[];
		label: string;
		disabled?: boolean;
		triggerClass?: string;
		onSelect?: (value: string) => void | boolean | Promise<void | boolean>;
	} = $props();

	let committedValue = $state(value);
	let pending = $state(false);
	let currentLabel = $derived(options.find((option) => option.value === value)?.label ?? 'Aucun');

	$effect(() => {
		if (!pending) committedValue = value;
	});

	async function change(next: string) {
		if (!onSelect) return;
		pending = true;
		try {
			const accepted = await onSelect(next);
			if (accepted === false) value = committedValue;
			else committedValue = next;
		} catch {
			value = committedValue;
		} finally {
			pending = false;
		}
	}
</script>

<Select.Root type="single" bind:value items={options} {disabled} onValueChange={change} loop>
	<Select.Trigger
		aria-label={`${label} : ${currentLabel}`}
		class="ui-focus group inline-flex min-h-11 max-w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 shadow-sm transition-[border-color,box-shadow] hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-slate-500 data-[state=open]:shadow-md {triggerClass}"
	>
		<Select.Value class="min-w-0 flex-1 truncate text-left">{currentLabel}</Select.Value>
		<ChevronDown
			aria-hidden="true"
			class="size-4 shrink-0 text-slate-500 transition-transform group-data-[state=open]:rotate-180"
		/>
	</Select.Trigger>
	<Select.Portal>
		<Select.Content
			sideOffset={6}
			align="start"
			class="z-[60] max-w-[min(22rem,calc(100vw-2rem))] min-w-[var(--bits-select-anchor-width)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl outline-none"
		>
			<Select.Viewport class="max-h-64 overflow-y-auto">
				{#each options as option (option.value)}
					<Select.Item
						value={option.value}
						label={option.label}
						disabled={option.disabled}
						class="flex min-h-10 cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-disabled:opacity-40 data-highlighted:bg-slate-100 data-highlighted:text-slate-950 data-selected:font-medium data-selected:text-slate-950"
					>
						{#snippet children({ selected })}
							<span class="min-w-0 flex-1 truncate">{option.label}</span>
							{#if selected}<Check aria-hidden="true" class="size-4 shrink-0 text-slate-700" />{/if}
						{/snippet}
					</Select.Item>
				{/each}
			</Select.Viewport>
		</Select.Content>
	</Select.Portal>
</Select.Root>
