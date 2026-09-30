<script lang="ts">
	import { resolve } from '$app/paths';
	import Search from '@lucide/svelte/icons/search';
	import { Dialog } from 'bits-ui';
	import { onDestroy, onMount } from 'svelte';

	type Item = {
		id: string;
		title: string;
		status: string;
		projectId?: string | null;
		projectTitle?: string | null;
	};
	type Results = { tasks: Item[]; projects: Item[]; checkpoints: Item[] };
	const empty: Results = { tasks: [], projects: [], checkpoints: [] };
	const statusLabels: Record<string, string> = {
		todo: 'À faire',
		in_progress: 'En cours',
		done: 'Terminé',
		cancelled: 'Annulé',
		planned: 'Planifié',
		active: 'Actif',
		paused: 'En pause',
		open: 'Ouvert'
	};
	const shortcuts = [
		{ label: 'Collector', href: `${resolve('/')}#capture` },
		{ label: 'Revue', href: resolve('/review') },
		{ label: 'Tasks', href: resolve('/tasks') },
		{ label: 'Projects', href: resolve('/projects') },
		{ label: 'Nouvelle Task', href: `${resolve('/tasks')}#new-task` },
		{ label: 'Nouveau Project', href: `${resolve('/projects')}#new-project` }
	];
	let open = $state(false);
	let query = $state('');
	let results = $state<Results>(empty);
	let loading = $state(false);
	let error = $state('');
	let input: HTMLInputElement | undefined;
	let panel: HTMLElement | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	let sequence = 0;
	let navigating = false;
	let hasResults = $derived(
		results.tasks.length + results.projects.length + results.checkpoints.length > 0
	);

	function reset() {
		clearTimeout(timer);
		controller?.abort();
		sequence++;
		query = '';
		results = empty;
		loading = false;
		error = '';
	}

	function setOpen(next: boolean) {
		if (next) navigating = false;
		if (!next) reset();
		open = next;
	}

	function followLink() {
		navigating = true;
		setOpen(false);
	}

	async function search(value: string, request: number) {
		controller = new AbortController();
		try {
			const response = await fetch(`/api/search?q=${encodeURIComponent(value)}`, {
				signal: controller.signal
			});
			if (!response.ok) throw new Error('Recherche indisponible. Réessaie.');
			const found = (await response.json()) as Results;
			if (request === sequence) results = found;
		} catch (cause) {
			if (request === sequence) {
				results = empty;
				error = cause instanceof Error ? cause.message : 'Recherche indisponible. Réessaie.';
			}
		} finally {
			if (request === sequence) loading = false;
		}
	}

	function updateSearch() {
		clearTimeout(timer);
		controller?.abort();
		sequence++;
		error = '';
		results = empty;
		const value = query.trim();
		if (!value) {
			loading = false;
			return;
		}
		if (value.length > 200) {
			loading = false;
			error = 'Recherche limitée à 200 caractères.';
			return;
		}
		loading = true;
		const request = sequence;
		timer = setTimeout(() => void search(value, request), 250);
	}

	function itemHref(type: keyof Results, item: Item) {
		if (type === 'projects') return resolve(`/projects/${item.id}`);
		if (type === 'checkpoints')
			return `${resolve(`/projects/${item.projectId}`)}#checkpoint-${item.id}`;
		if (item.projectId) return `${resolve(`/projects/${item.projectId}`)}#task-${item.id}`;
		return item.status === 'done' || item.status === 'cancelled'
			? `${resolve('/tasks')}?view=history#task-${item.id}`
			: `${resolve('/tasks')}#task-${item.id}`;
	}

	function moveFocus(event: KeyboardEvent) {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
		const links = Array.from(
			panel?.querySelectorAll<HTMLAnchorElement>('a[data-palette-link]') ?? []
		);
		if (!links.length) return;
		event.preventDefault();
		event.stopPropagation();
		const index = links.indexOf(document.activeElement as HTMLAnchorElement);
		const next =
			index === -1
				? event.key === 'ArrowDown'
					? 0
					: links.length - 1
				: event.key === 'ArrowDown'
					? (index + 1) % links.length
					: (index - 1 + links.length) % links.length;
		links[next].focus();
	}

	onMount(() => {
		function shortcut(event: KeyboardEvent) {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
				event.preventDefault();
				setOpen(!open);
			}
		}
		window.addEventListener('keydown', shortcut);
		return () => window.removeEventListener('keydown', shortcut);
	});
	onDestroy(reset);
</script>

<button
	type="button"
	onclick={() => setOpen(true)}
	class="ui-button ui-button-quiet ui-focus gap-2 px-3"
	aria-label="Rechercher"
>
	<Search size={18} aria-hidden="true" />
	<span class="hidden sm:inline">Rechercher</span>
	<kbd class="hidden rounded border border-slate-300 px-1.5 py-0.5 text-xs lg:inline">⌘/Ctrl K</kbd>
</button>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-40 bg-black/65" />
		<Dialog.Content
			onOpenAutoFocus={(event) => {
				event.preventDefault();
				input?.focus();
			}}
			onCloseAutoFocus={(event) => {
				// The shell focuses the destination after navigation. Returning to the
				// search trigger here would steal that focus, especially in WebKit.
				if (navigating) event.preventDefault();
				navigating = false;
				reset();
			}}
			class="fixed top-[12dvh] left-1/2 z-50 flex max-h-[76dvh] w-[min(calc(100vw-2rem),42rem)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
		>
			<div class="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
				<div>
					<Dialog.Title class="text-lg font-semibold text-slate-950">Recherche</Dialog.Title>
					<Dialog.Description class="text-xs text-slate-600"
						>Tasks, Projects et Checkpoints</Dialog.Description
					>
				</div>
				<button
					type="button"
					onclick={() => setOpen(false)}
					class="ui-button ui-button-quiet ui-focus">Fermer</button
				>
			</div>
			<div class="p-4">
				<label for="global-search" class="sr-only">Rechercher un objet</label>
				<input
					id="global-search"
					bind:this={input}
					bind:value={query}
					oninput={updateSearch}
					onkeydown={moveFocus}
					placeholder="Rechercher dans les titres et descriptions…"
					autocomplete="off"
					class="ui-focus min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
				/>
			</div>
			<div
				bind:this={panel}
				class="overflow-y-auto px-4 pb-4"
				onkeydown={moveFocus}
				role="presentation"
			>
				{#if error}<p role="alert" class="p-3 text-sm text-red-700">{error}</p>{/if}
				{#if loading}<p role="status" class="p-3 text-sm text-slate-600">Recherche…</p>{/if}
				{#if query.trim() && !loading && !error && !hasResults}<p
						class="p-3 text-sm text-slate-600"
					>
						Aucun résultat.
					</p>{/if}
				{#each [{ type: 'tasks', label: 'Tasks', items: results.tasks }, { type: 'projects', label: 'Projects', items: results.projects }, { type: 'checkpoints', label: 'Checkpoints', items: results.checkpoints }] as group (group.type)}
					{#if group.items.length}
						<section class="mb-3" aria-label={group.label}>
							<h3 class="px-3 py-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
								{group.label}
							</h3>
							{#each group.items as item (item.id)}
								<!-- eslint-disable svelte/no-navigation-without-resolve -- URLs are resolved by itemHref -->
								<a
									data-palette-link
									href={itemHref(group.type as keyof Results, item)}
									onclick={followLink}
									class="ui-focus block rounded-lg px-3 py-2 text-sm hover:bg-slate-100 focus:bg-slate-100"
								>
									<span class="block font-medium break-words text-slate-950">{item.title}</span>
									<span class="block text-xs text-slate-600"
										>{item.projectTitle ? `${item.projectTitle} · ` : ''}{statusLabels[
											item.status
										] ?? item.status}</span
									>
								</a>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/each}
						</section>
					{/if}
				{/each}
				<section class="border-t border-slate-200 pt-2" aria-label="Navigation et création">
					<h3 class="px-3 py-2 text-xs font-semibold tracking-wider text-slate-500 uppercase">
						Actions rapides
					</h3>
					{#each shortcuts as shortcut (shortcut.label)}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- shortcut URLs are resolved above -->
						<a
							data-palette-link
							href={shortcut.href}
							onclick={followLink}
							class="ui-focus block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 focus:bg-slate-100"
							>{shortcut.label}</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/each}
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
