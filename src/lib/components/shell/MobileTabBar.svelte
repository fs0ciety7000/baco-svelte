<script>
	import { page } from '$app/state';
	import { LayoutDashboard, Bus, CarTaxiFront, Radio, Menu, Accessibility } from 'lucide-svelte';
	import { isVisible } from '$lib/navigation';
	import { ACTIONS } from '$lib/permissions';

	/** Barre d'onglets mobile : les 4 modules les plus utilisés + « Menu ». */
	/** @type {{ profile: any, onmenu: () => void }} */
	let { profile, onmenu } = $props();

	const CANDIDATES = [
		{ href: '/accueil', label: 'Accueil', icon: LayoutDashboard },
		{ href: '/otto', label: 'Bus', icon: Bus, permission: ACTIONS.OTTO_READ },
		{
			href: '/generateTaxi',
			label: 'Taxis',
			icon: CarTaxiFront,
			permission: ACTIONS.GENERATE_TAXI_READ
		},
		{
			href: '/deplacements',
			label: 'PMR',
			icon: Accessibility,
			permission: ACTIONS.DEPLACEMENTS_READ
		},
		{ href: '/live', label: 'Trains', icon: Radio, permission: ACTIONS.LIVE_READ }
	];
	const tabs = $derived(CANDIDATES.filter((t) => isVisible(t, profile)).slice(0, 4));

	/** @param {string} href */
	const active = (href) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<nav
	aria-label="Navigation rapide"
	class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl md:hidden"
	style:padding-bottom="env(safe-area-inset-bottom)"
	data-print="hide"
>
	<ul class="grid" style:grid-template-columns="repeat({tabs.length + 1}, minmax(0, 1fr))">
		{#each tabs as tab (tab.href)}
			{@const on = active(tab.href)}
			<li>
				<a
					href={tab.href}
					aria-current={on ? 'page' : undefined}
					class="flex h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors {on
						? 'text-accent'
						: 'text-subtle active:text-fg'}"
				>
					<tab.icon class="size-5" strokeWidth={on ? 2.1 : 1.75} />
					{tab.label}
				</a>
			</li>
		{/each}
		<li>
			<button
				type="button"
				onclick={onmenu}
				class="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium text-subtle active:text-fg"
			>
				<Menu class="size-5" strokeWidth={1.75} />
				Menu
			</button>
		</li>
	</ul>
</nav>
