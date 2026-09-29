<script lang="ts">
	import { parseMarkdownPreview } from '$lib/domain/markdown-preview';
	import MarkdownInline from './MarkdownInline.svelte';
	let { source, onToggle }: { source: string; onToggle?: (lineIndex: number) => void } = $props();
	let blocks = $derived(parseMarkdownPreview(source));
</script>

<div class="space-y-3 text-sm leading-6 break-words text-slate-800">
	{#if !source.trim()}<p class="text-slate-500">Aucune description pour le moment.</p>{/if}
	{#each blocks as block, index (index)}
		{#if block.kind === 'heading'}
			<svelte:element
				this={`h${block.level}`}
				class="font-semibold text-slate-950 {block.level === 1
					? 'text-xl'
					: block.level === 2
						? 'text-lg'
						: 'text-base'}"><MarkdownInline parts={block.content} /></svelte:element
			>
		{:else if block.kind === 'paragraph'}<p><MarkdownInline parts={block.content} /></p>
		{:else if block.kind === 'code'}<pre
				class="markdown-code overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100"><code
					>{block.value}</code
				></pre>
		{:else}
			<svelte:element
				this={block.ordered ? 'ol' : 'ul'}
				class="space-y-1 pl-5 {block.ordered ? 'list-decimal' : 'list-disc'}"
			>
				{#each block.items as item, itemIndex (itemIndex)}
					<li class:list-none={item.checked !== null}>
						{#if item.checked !== null}<input
								type="checkbox"
								checked={item.checked}
								disabled={!onToggle}
								onchange={() => onToggle?.(item.lineIndex)}
								class="ui-focus mr-2 align-middle"
								aria-label={`${item.checked ? 'Décocher' : 'Cocher'} : ${item.content.map((part) => part.value).join('') || 'case vide'}`}
							/>{/if}<MarkdownInline parts={item.content} />
					</li>
				{/each}
			</svelte:element>
		{/if}
	{/each}
</div>
