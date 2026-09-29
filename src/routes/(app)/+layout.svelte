<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import House from '@lucide/svelte/icons/house';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import { authClient } from '$lib/auth-client';

	const navigation = [
		{ href: '/', label: 'Accueil', icon: House },
		{ href: '/review', label: 'Revue', icon: ClipboardCheck },
		{ href: '/tasks', label: 'Tasks', icon: ListTodo },
		{ href: '/projects', label: 'Projects', icon: FolderKanban }
	] as const;

	let { children } = $props();
	let pending = $state(false);
	let error = $state('');

	async function signOut() {
		pending = true;
		error = '';
		try {
			const result = await authClient.signOut();
			if (result.error) {
				error = 'Déconnexion impossible. Réessaie.';
				return;
			}
			window.location.assign('/login');
		} catch {
			error = 'Déconnexion impossible. Vérifie ta connexion et réessaie.';
		} finally {
			pending = false;
		}
	}
</script>

<div class="min-h-dvh bg-slate-50 text-slate-900">
	<a
		href="#main-content"
		class="ui-focus sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-slate-950 focus:shadow-lg"
	>
		Aller au contenu
	</a>
	<a
		href="#mobile-navigation"
		class="ui-focus sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-slate-950 focus:shadow-lg lg:hidden"
	>
		Aller à la navigation
	</a>
	<header class="border-b border-slate-200 bg-white">
		<div
			class="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
		>
			<div class="flex min-w-0 items-center gap-3 font-semibold tracking-tight">
				<span
					class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"
				>
					<ListTodo size={20} aria-hidden="true" />
				</span>
				<span class="truncate">Get Things Done</span>
			</div>
			<nav aria-label="Navigation principale" class="hidden items-center gap-1 lg:flex">
				{#each navigation as item (item.href)}
					{@const active = page.url.pathname === item.href}
					<a
						href={resolve(item.href)}
						aria-current={active ? 'page' : undefined}
						class="ui-focus inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium"
						class:bg-slate-900={active}
						class:text-white={active}
						class:text-slate-600={!active}
						class:hover:bg-slate-100={!active}
						class:hover:text-slate-950={!active}
					>
						<item.icon size={17} aria-hidden="true" />
						{item.label}
					</a>
				{/each}
			</nav>
			<div class="flex shrink-0 items-center gap-2">
				<SearchPalette />
				<ThemeToggle />
				<button
					type="button"
					onclick={signOut}
					disabled={pending}
					class="ui-button ui-button-quiet ui-focus shrink-0 px-3"
				>
					<LogOut size={17} aria-hidden="true" />
					<span class="hidden sm:inline">{pending ? 'Déconnexion…' : 'Se déconnecter'}</span>
					<span class="sr-only sm:hidden">{pending ? 'Déconnexion…' : 'Se déconnecter'}</span>
				</button>
			</div>
		</div>
		{#if error}
			<p role="alert" class="mx-auto max-w-7xl px-4 pb-3 text-sm text-red-700 sm:px-6 lg:px-8">
				{error}
			</p>
		{/if}
	</header>

	<main
		id="main-content"
		tabindex="-1"
		class="mx-auto w-full max-w-7xl px-4 pt-8 pb-28 sm:px-6 sm:pt-10 lg:px-8 lg:pb-10"
	>
		{@render children()}
	</main>

	<nav
		id="mobile-navigation"
		tabindex="-1"
		aria-label="Navigation principale"
		class="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
	>
		<div class="mx-auto grid max-w-2xl grid-cols-5 px-1 sm:px-4">
			{#each navigation as item (item.href)}
				{@const active = page.url.pathname === item.href}
				<a
					href={resolve(item.href)}
					aria-current={active ? 'page' : undefined}
					class="ui-focus flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium"
					class:text-slate-950={active}
					class:text-slate-500={!active}
					class:bg-slate-100={active}
				>
					<item.icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
					<span class="truncate">{item.label}</span>
				</a>
			{/each}
		</div>
	</nav>
</div>
