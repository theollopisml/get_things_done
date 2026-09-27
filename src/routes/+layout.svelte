<script lang="ts">
	import { base } from '$app/paths';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href="{base}/icon.svg" />
	<link rel="apple-touch-icon" href="{base}/icon-180.png" />
	<link rel="manifest" href="{base}/manifest.webmanifest" />
	<meta name="theme-color" content="#ffffff" />
</svelte:head>

{@render children()}
