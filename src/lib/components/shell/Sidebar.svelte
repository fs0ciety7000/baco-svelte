<script>
	import { page } from '$app/state';
	import { crossfade, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { PanelLeftClose, PanelLeftOpen } from 'lucide-svelte';
	import Logo from './Logo.svelte';
	import { visibleNavigation } from '$lib/navigation';

	/**
	 * @type {{
	 *   profile: any,
	 *   collapsed?: boolean,
	 *   mobile?: boolean,
	 *   onnavigate?: () => void
	 * }}
	 */
	let { profile, collapsed = $bindable(false), mobile = false, onnavigate } = $props();

	const groups = $derived(visibleNavigation(profile));

	// Indicateur actif qui « glisse » d'une entrée à l'autre
	const [send, receive] = crossfade({ duration: 220, easing: cubicOut });

	/** @param {string} href */
	function isActive(href) {
		const path = page.url.pathname;
		if (href === '/deplacements') return path === href; // l'historique a sa propre entrée
		if (href === '/admin') return path === '/admin' || path.startsWith('/admin/utilisateur');
		return path === href || path.startsWith(`${href}/`);
	}

	const compact = $derived(collapsed && !mobile);
</script>

<nav
	aria-label="Navigation principale"
	class="flex h-full flex-col border-r border-line bg-surface/70 backdrop-blur-xl"
	style:width={mobile ? '100%' : compact ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)'}
	style:transition="width var(--d-slow) var(--ease-out)"
>
	<div
		class="flex h-[var(--topbar-h)] shrink-0 items-center px-4 {compact
			? 'justify-center px-0'
			: ''}"
	>
		<a href="/accueil" class="rounded-md" onclick={onnavigate} aria-label="CSM — tableau de bord">
			<Logo withText={!compact} />
		</a>
	</div>

	<div class="flex-1 overflow-x-hidden overflow-y-auto px-2 pb-4">
		{#each groups as group (group.id)}
			<div class="mt-4 first:mt-1">
				{#if !compact}
					<p
						class="mb-1 px-3 text-[10.5px] font-semibold tracking-[0.08em] text-subtle uppercase"
						transition:fade={{ duration: 120 }}
					>
						{group.label}
					</p>
				{:else}
					<div class="mx-3 mb-2 h-px bg-line" aria-hidden="true"></div>
				{/if}
				<ul class="space-y-0.5">
					{#each group.items as item (item.href)}
						{@const active = isActive(item.href)}
						<li>
							<a
								href={item.href}
								onclick={onnavigate}
								aria-current={active ? 'page' : undefined}
								title={compact ? item.label : undefined}
								class="group relative flex h-8 items-center gap-3 rounded-md px-3 text-[13px] font-medium transition-colors duration-[var(--d-fast)]
									{compact ? 'justify-center px-0' : ''}
									{active ? 'text-fg' : 'text-muted hover:bg-surface-2/70 hover:text-fg'}"
							>
								{#if active}
									<span
										class="absolute inset-0 rounded-md border border-line bg-surface-2 shadow-e1"
										in:receive={{ key: 'nav-active' }}
										out:send={{ key: 'nav-active' }}
										aria-hidden="true"
									>
										<span class="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-accent"
										></span>
									</span>
								{/if}
								<item.icon
									class="relative size-4 shrink-0 transition-colors {active
										? 'text-accent'
										: 'text-subtle group-hover:text-muted'}"
									strokeWidth={1.75}
								/>
								{#if !compact}
									<span class="relative truncate">{item.label}</span>
									{#if item.shortcut}
										<kbd
											class="relative ml-auto opacity-0 transition-opacity group-hover:opacity-100"
											aria-hidden="true">G {item.shortcut.toUpperCase()}</kbd
										>
									{/if}
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>

	{#if !mobile}
		<div class="shrink-0 border-t border-line p-2">
			<button
				type="button"
				onclick={() => (collapsed = !collapsed)}
				class="flex h-8 w-full items-center gap-3 rounded-md px-3 text-[13px] text-muted hover:bg-surface-2 hover:text-fg {compact
					? 'justify-center px-0'
					: ''}"
				aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
			>
				{#if collapsed}
					<PanelLeftOpen class="size-4" strokeWidth={1.75} />
				{:else}
					<PanelLeftClose class="size-4" strokeWidth={1.75} />
					<span>Replier</span>
					<kbd class="ml-auto">[</kbd>
				{/if}
			</button>
		</div>
	{/if}
</nav>
