<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { onMount } from 'svelte';

	type Theme = 'dark' | 'light';
	let theme = $state<Theme>('dark');

	function applyTheme(next: Theme) {
		theme = next;
		document.documentElement.dataset.theme = next;
		document
			.querySelector('meta[name="theme-color"]')
			?.setAttribute('content', next === 'dark' ? '#0d1420' : '#ffffff');
	}

	onMount(() => {
		applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
		function syncTheme(event: StorageEvent) {
			if (event.key === 'get-things-done-theme') {
				applyTheme(event.newValue === 'light' ? 'light' : 'dark');
			}
		}
		window.addEventListener('storage', syncTheme);
		return () => window.removeEventListener('storage', syncTheme);
	});

	function toggle() {
		const next = theme === 'dark' ? 'light' : 'dark';
		applyTheme(next);
		try {
			localStorage.setItem('get-things-done-theme', next);
		} catch {
			// The current page still switches theme when local storage is unavailable.
		}
	}
</script>

<button
	type="button"
	onclick={toggle}
	aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
	title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
	class="ui-button ui-button-quiet ui-focus shrink-0 border border-slate-200 bg-white px-3"
>
	{#if theme === 'dark'}<Sun size={17} aria-hidden="true" />{:else}<Moon
			size={17}
			aria-hidden="true"
		/>{/if}
	<span class="hidden sm:inline">{theme === 'dark' ? 'Mode clair' : 'Mode sombre'}</span>
</button>
