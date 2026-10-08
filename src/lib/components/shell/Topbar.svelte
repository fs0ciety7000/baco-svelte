<script>
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { DropdownMenu } from 'bits-ui';
	import { Menu, Search, Plus, ChevronRight } from 'lucide-svelte';
	import { findNavItem, QUICK_CREATE, isVisible } from '$lib/navigation';
	import ThemeMenu from './ThemeMenu.svelte';
	import NotificationsMenu from './NotificationsMenu.svelte';
	import UserMenu from './UserMenu.svelte';

	/**
	 * @type {{
	 *   user: { id: string, email?: string } | null,
	 *   profile: any,
	 *   onmenu: () => void,
	 *   onsearch: () => void,
	 *   onshortcuts: () => void
	 * }}
	 */
	let { user, profile, onmenu, onsearch, onshortcuts } = $props();

	const current = $derived(findNavItem(page.url.pathname));
	const creations = $derived(QUICK_CREATE.filter((c) => isVisible(c, profile)));
	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
</script>

<header
	class="sticky top-0 z-40 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-line bg-canvas/75 px-3 backdrop-blur-xl sm:px-4"
	data-print="hide"
>
	<button type="button" class="csm-icon-btn md:hidden" onclick={onmenu} aria-label="Ouvrir le menu">
		<Menu class="size-5" strokeWidth={1.75} />
	</button>

	<nav aria-label="Fil d’Ariane" class="min-w-0 flex-1">
		<ol class="flex items-center gap-1.5 text-[13px]">
			{#if current}
				<li class="hidden text-subtle sm:block">{current.group.label}</li>
				<li class="hidden text-subtle sm:block" aria-hidden="true">
					<ChevronRight class="size-3.5" />
				</li>
				<li class="truncate font-medium text-fg" aria-current="page">{current.item.label}</li>
			{:else}
				<li class="truncate font-medium text-fg">{page.data?.title ?? ''}</li>
			{/if}
		</ol>
	</nav>

	<button
		type="button"
		onclick={onsearch}
		class="group hidden h-8 w-64 items-center gap-2 rounded-md border border-line bg-surface/60 px-2.5 text-[13px] text-subtle transition-colors hover:border-line-strong hover:text-muted sm:flex lg:w-80"
	>
		<Search class="size-4" strokeWidth={1.75} />
		<span class="flex-1 text-left">Rechercher…</span>
		<kbd>{isMac ? '⌘' : 'Ctrl'} K</kbd>
	</button>
	<button type="button" class="csm-icon-btn sm:hidden" onclick={onsearch} aria-label="Rechercher">
		<Search class="size-[18px]" strokeWidth={1.75} />
	</button>

	{#if creations.length}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger
				class="flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[13px] font-medium text-accent-fg shadow-e1 transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
			>
				<Plus class="size-4" strokeWidth={2} />
				<span class="hidden sm:inline">Nouveau</span>
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					sideOffset={8}
					align="end"
					class="csm-pop z-[80] w-60 rounded-lg border border-line bg-surface p-1.5 shadow-e3"
				>
					{#each creations as c (c.href)}
						<DropdownMenu.Item class="csm-menu-item" onSelect={() => goto(c.href)}>
							<c.icon class="size-4 text-subtle" strokeWidth={1.75} />
							{c.label}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	{/if}

	<div class="flex items-center gap-0.5">
		<span class="hidden sm:contents"><ThemeMenu userId={user?.id} /></span>
		{#if user}<NotificationsMenu userId={user.id} />{/if}
	</div>
	<div class="mx-1 h-6 w-px bg-line" aria-hidden="true"></div>
	<UserMenu {profile} email={user?.email} {onshortcuts} />
</header>
