<script lang="ts">
	import type { Inline } from '$lib/domain/markdown-preview';
	let { parts }: { parts: Inline[] } = $props();
</script>

{#each parts as part, index (index)}
	{#if part.kind === 'code'}<code class="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]"
			>{part.value}</code
		>
	{:else if part.kind === 'strong'}<strong>{part.value}</strong>
	{:else if part.kind === 'emphasis'}<em>{part.value}</em>
	{:else if part.kind === 'link'}
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={part.href}
			target="_blank"
			rel="noopener noreferrer"
			class="text-sky-700 underline underline-offset-2">{part.value}</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	{:else}{part.value}{/if}
{/each}
