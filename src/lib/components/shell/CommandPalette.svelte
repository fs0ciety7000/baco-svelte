<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Dialog, Command } from 'bits-ui';
	import {
		Search,
		Loader2,
		CornerDownLeft,
		Palette,
		FileText,
		Users,
		Tag,
		Car,
		Bus,
		BookUser,
		Shield,
		Train,
		File,
		Plus
	} from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import { visibleNavigation, QUICK_CREATE, isVisible } from '$lib/navigation';
	import { THEMES, applyTheme } from '$lib/stores/theme';
	import { sanitizeHighlight } from '$lib/utils/sanitize.js';

	/** @type {{ profile: any, open?: boolean }} */
	let { profile, open = $bindable(false) } = $props();

	let search = $state('');
	/** @type {any[]} */
	let results = $state([]);
	let loading = $state(false);
	/** Mode « sélection » : une page demande de choisir un contenu (liaison). */
	/** @type {((r: any) => void) | null} */
	let onPick = $state(null);
	let timer;

	const groups = $derived(visibleNavigation(profile));
	const creations = $derived(QUICK_CREATE.filter((c) => isVisible(c, profile)));

	const RESULT_ICONS = {
		contact_repertoire: BookUser,
		procedure: Shield,
		client_pmr: Users,
		ptcar: Tag,
		taxi: Car,
		bus: Bus,
		document: FileText,
		train: Train,
		otto_commande: Bus
	};

	$effect(() => {
		if (!open) {
			search = '';
			results = [];
			onPick = null;
		}
	});

	$effect(() => {
		const term = search.trim();
		clearTimeout(timer);
		if (term.length < 2) {
			results = [];
			loading = false;
			return;
		}
		loading = true;
		timer = setTimeout(async () => {
			const { data, error } = await supabase.rpc('global_search', { search_term: term });
			if (search.trim() === term) {
				results = error ? [] : (data ?? []);
				loading = false;
			}
		}, 250);
	});

	onMount(() => {
		/** @param {any} e */
		const openListener = (e) => {
			onPick = e.detail?.callback ?? null;
			open = true;
		};
		window.addEventListener('openGlobalSearch', openListener);
		// API historique utilisée par certaines pages
		window.showGlobalSearch = (/** @type {any} */ cb) => {
			onPick = cb ?? null;
			open = true;
		};
		return () => {
			window.removeEventListener('openGlobalSearch', openListener);
			delete window.showGlobalSearch;
		};
	});

	/** @param {string} href */
	function go(href) {
		open = false;
		goto(href);
	}

	/** @param {any} r */
	function pickResult(r) {
		const result = {
			id: r.result_id,
			type: r.result_type_key,
			title: r.title,
			snippet: r.snippet,
			url: r.url
		};
		if (onPick) {
			onPick(result);
			open = false;
			return;
		}
		if (r.result_type_key === 'document') {
			window.open(r.url, '_blank', 'noopener');
			open = false;
		} else {
			go(r.url);
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="csm-overlay fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px]" />
		<Dialog.Content
			class="csm-pop fixed top-[12vh] left-1/2 z-[100] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-line bg-surface/95 shadow-e3 backdrop-blur-xl"
		>
			<Dialog.Title class="sr-only">Palette de commandes</Dialog.Title>
			<Command.Root loop class="flex max-h-[min(70vh,560px)] flex-col">
				<div class="flex items-center gap-3 border-b border-line px-4">
					<Search class="size-4 shrink-0 text-subtle" />
					<Command.Input
						bind:value={search}
						placeholder={onPick
							? 'Chercher un contenu à lier…'
							: 'Rechercher une page, une gare, un contact, une action…'}
						class="h-12 w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-subtle"
					/>
					{#if loading}<Loader2 class="size-4 shrink-0 animate-spin text-subtle" />{/if}
					<kbd>Échap</kbd>
				</div>

				<Command.List class="overflow-y-auto overscroll-contain p-2">
					<Command.Viewport>
						<Command.Empty class="px-3 py-10 text-center text-sm text-muted">
							{search.trim().length < 2 ? 'Tapez au moins 2 caractères.' : 'Aucun résultat.'}
						</Command.Empty>

						{#if results.length}
							<Command.Group>
								<Command.GroupHeading class="csm-cmd-heading">Résultats</Command.GroupHeading>
								<Command.GroupItems>
									{#each results as r (r.result_type_key + r.result_id)}
										{@const Icon = RESULT_ICONS[r.result_type_key] ?? File}
										<Command.Item
											value={`res-${r.result_type_key}-${r.result_id}`}
											keywords={[search]}
											onSelect={() => pickResult(r)}
											class="csm-cmd-item"
										>
											<Icon class="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
											<span class="min-w-0 flex-1">
												<span class="block truncate text-fg"
													>{@html sanitizeHighlight(r.title)}</span
												>
												{#if r.snippet}
													<span class="block truncate text-xs text-muted"
														>{@html sanitizeHighlight(r.snippet)}</span
													>
												{/if}
											</span>
											<span class="shrink-0 text-[11px] tracking-wide text-subtle uppercase"
												>{r.result_type}</span
											>
										</Command.Item>
									{/each}
								</Command.GroupItems>
							</Command.Group>
						{/if}

						{#if !onPick}
							{#if creations.length}
								<Command.Group>
									<Command.GroupHeading class="csm-cmd-heading">Créer</Command.GroupHeading>
									<Command.GroupItems>
										{#each creations as c (c.href)}
											<Command.Item
												value={`Nouveau ${c.label}`}
												keywords={['nouveau', 'créer', 'ajouter']}
												onSelect={() => go(c.href)}
												class="csm-cmd-item"
											>
												<Plus class="size-4 shrink-0 text-accent" />
												<span class="flex-1 text-fg">Nouveau : {c.label}</span>
											</Command.Item>
										{/each}
									</Command.GroupItems>
								</Command.Group>
							{/if}

							{#each groups as group (group.id)}
								<Command.Group>
									<Command.GroupHeading class="csm-cmd-heading">{group.label}</Command.GroupHeading>
									<Command.GroupItems>
										{#each group.items as item (item.href)}
											<Command.Item
												value={item.label}
												keywords={item.keywords ?? []}
												onSelect={() => go(item.href)}
												class="csm-cmd-item"
											>
												<item.icon class="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
												<span class="flex-1 text-fg">{item.label}</span>
												{#if item.shortcut}<kbd>G {item.shortcut.toUpperCase()}</kbd>{/if}
											</Command.Item>
										{/each}
									</Command.GroupItems>
								</Command.Group>
							{/each}

							<Command.Group>
								<Command.GroupHeading class="csm-cmd-heading">Apparence</Command.GroupHeading>
								<Command.GroupItems>
									{#each THEMES as theme (theme.id)}
										<Command.Item
											value={`Thème ${theme.name}`}
											keywords={['thème', 'couleur', 'apparence', theme.description]}
											onSelect={() => {
												applyTheme(theme.id);
												open = false;
											}}
											class="csm-cmd-item"
										>
											<Palette class="size-4 shrink-0 text-subtle" strokeWidth={1.75} />
											<span class="flex-1 text-fg">Thème : {theme.name}</span>
											<span class="flex gap-0.5" aria-hidden="true">
												{#each theme.swatch as c, i (i)}<span
														class="size-3 rounded-full border border-line"
														style:background={c}
													></span>{/each}
											</span>
										</Command.Item>
									{/each}
								</Command.GroupItems>
							</Command.Group>
						{/if}
					</Command.Viewport>
				</Command.List>

				<div
					class="flex items-center gap-4 border-t border-line bg-surface-2/50 px-4 py-2 text-[11px] text-subtle"
				>
					<span class="flex items-center gap-1.5"><kbd>↑</kbd><kbd>↓</kbd> naviguer</span>
					<span class="flex items-center gap-1.5"
						><kbd><CornerDownLeft class="inline size-3" /></kbd> ouvrir</span
					>
					<span class="ml-auto flex items-center gap-1.5"
						><kbd>Ctrl</kbd><kbd>K</kbd> ouvrir / fermer</span
					>
				</div>
			</Command.Root>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.csm-cmd-heading) {
		padding: 0.5rem 0.75rem 0.25rem;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-subtle);
	}
	:global(.csm-cmd-item) {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 2.25rem;
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius-sm);
		font-size: 13px;
		cursor: pointer;
		user-select: none;
		scroll-margin: 0.5rem;
	}
	:global(.csm-cmd-item[data-selected]) {
		background: var(--surface-2);
		box-shadow: inset 0 0 0 1px var(--border);
	}
	:global(.csm-cmd-item mark) {
		background: color-mix(in oklab, var(--accent) 30%, transparent);
		color: inherit;
		border-radius: 2px;
	}
</style>
