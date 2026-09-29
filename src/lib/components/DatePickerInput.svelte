<script lang="ts">
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';
	import { parseDate } from '@internationalized/date';
	import { DatePicker } from 'bits-ui';

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

	let selected = $derived(value ? parseDate(value) : undefined);

	function clear() {
		value = '';
		onChange?.();
	}
</script>

<DatePicker.Root
	value={selected}
	onValueChange={(date) => {
		value = date?.toString() ?? '';
		onChange?.();
	}}
	locale="fr-FR"
	weekStartsOn={1}
	weekdayFormat="short"
	{disabled}
>
	<div class="group relative grid gap-1 text-sm">
		<div class="flex items-center gap-2">
			<DatePicker.Label>{label}</DatePicker.Label>
			{#if !value && help}<button
					type="button"
					aria-label={`Aide : ${label}`}
					aria-describedby={`${id}-help`}
					class="ui-focus flex size-5 items-center justify-center rounded-full border border-slate-400 text-xs text-slate-600"
					>?</button
				>{/if}
		</div>
		<DatePicker.Input
			aria-describedby={!value && help ? `${id}-help` : undefined}
			class="flex min-h-11 min-w-0 items-center rounded-lg border border-slate-300 bg-white px-2 text-slate-900 focus-within:border-slate-500 data-disabled:cursor-not-allowed data-disabled:opacity-60"
		>
			{#snippet children({ segments })}
				{#each segments as { part, value: segment }, index (part + index)}
					<DatePicker.Segment
						{part}
						class={part === 'literal'
							? 'px-0.5 text-slate-500'
							: 'ui-focus rounded px-1 py-1 text-slate-900 hover:bg-slate-100 focus:bg-slate-100 data-placeholder:text-slate-500'}
						>{segment}</DatePicker.Segment
					>
				{/each}
				{#if value}<button
						type="button"
						class="ui-focus ml-auto flex size-8 items-center justify-center rounded text-slate-500 hover:bg-slate-100"
						aria-label={`Effacer ${label.toLowerCase()}`}
						onclick={clear}><X aria-hidden="true" class="size-4" /></button
					>{/if}
				<DatePicker.Trigger
					class="ui-focus ml-auto flex size-8 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
					aria-label={`Ouvrir le calendrier : ${label.toLowerCase()}`}
					><CalendarDays aria-hidden="true" class="size-4" /></DatePicker.Trigger
				>
			{/snippet}
		</DatePicker.Input>
		{#if !value && help}<span
				id={`${id}-help`}
				role="tooltip"
				class="pointer-events-none absolute top-full left-0 z-20 mt-2 w-60 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
				>{help}</span
			>{/if}
	</div>
	<DatePicker.Portal>
		<DatePicker.Content
			sideOffset={6}
			class="z-[70] rounded-xl border border-slate-300 bg-white p-3 text-slate-900 shadow-xl"
		>
			<DatePicker.Calendar>
				{#snippet children({ months, weekdays })}
					<DatePicker.Header class="mb-2 flex items-center justify-between gap-2">
						<DatePicker.PrevButton
							class="ui-focus flex size-9 items-center justify-center rounded-lg hover:bg-slate-100"
							aria-label="Mois précédent"
							><ChevronLeft aria-hidden="true" class="size-4" /></DatePicker.PrevButton
						>
						<DatePicker.Heading class="text-sm font-medium" />
						<DatePicker.NextButton
							class="ui-focus flex size-9 items-center justify-center rounded-lg hover:bg-slate-100"
							aria-label="Mois suivant"
							><ChevronRight aria-hidden="true" class="size-4" /></DatePicker.NextButton
						>
					</DatePicker.Header>
					{#each months as month (month.value)}
						<DatePicker.Grid class="w-full border-collapse">
							<DatePicker.GridHead
								><DatePicker.GridRow class="grid grid-cols-7">
									{#each weekdays as day (day)}<DatePicker.HeadCell
											class="flex size-9 items-center justify-center text-xs text-slate-500"
											>{day.slice(0, 2)}</DatePicker.HeadCell
										>{/each}
								</DatePicker.GridRow></DatePicker.GridHead
							>
							<DatePicker.GridBody>
								{#each month.weeks as weekDates (weekDates)}<DatePicker.GridRow
										class="grid grid-cols-7"
									>
										{#each weekDates as date (date.toString())}<DatePicker.Cell
												{date}
												month={month.value}
												class="p-0"
											>
												<DatePicker.Day
													class="ui-focus flex size-9 items-center justify-center rounded-lg text-sm text-slate-900 hover:bg-slate-100 data-outside-month:text-slate-400 data-selected:bg-slate-900 data-selected:text-white data-today:font-semibold"
												/>
											</DatePicker.Cell>{/each}
									</DatePicker.GridRow>{/each}
							</DatePicker.GridBody>
						</DatePicker.Grid>
					{/each}
				{/snippet}
			</DatePicker.Calendar>
		</DatePicker.Content>
	</DatePicker.Portal>
</DatePicker.Root>
