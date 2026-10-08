<script>
	import { goto, afterNavigate } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { Eye, X } from 'lucide-svelte';
	import Sidebar from './Sidebar.svelte';
	import Topbar from './Topbar.svelte';
	import MobileTabBar from './MobileTabBar.svelte';
	import CommandPalette from './CommandPalette.svelte';
	import ShortcutsDialog from './ShortcutsDialog.svelte';
	import { NAVIGATION, isVisible } from '$lib/navigation';
	import { ACTIONS, PREVIEW_ROLE_KEY, getPreviewRole, hasPermission } from '$lib/permissions';

	/** @type {{ user: any, profile: any, children: import('svelte').Snippet }} */
	let { user, profile, children } = $props();

	const COLLAPSE_KEY = 'csm-sidebar-collapsed';
	let collapsed = $state(readCollapsed());
	let mobileOpen = $state(false);
	let paletteOpen = $state(false);
	let shortcutsOpen = $state(false);
	const preview = getPreviewRole();

	function readCollapsed() {
		try {
			return localStorage.getItem(COLLAPSE_KEY) === '1';
		} catch {
			return false;
		}
	}
	$effect(() => {
		try {
			localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
		} catch {
			/* navigation privée */
		}
	});

	afterNavigate(() => (mobileOpen = false));

	// --- Raccourcis clavier ---------------------------------------------------
	let pendingG = false;
	let gTimer;
	const goTargets = Object.fromEntries(
		NAVIGATION.flatMap((g) => g.items)
			.filter((i) => i.shortcut)
			.map((i) => [i.shortcut, i])
	);

	/** @param {KeyboardEvent} e */
	function isTyping(e) {
		const t = /** @type {HTMLElement | null} */ (e.target);
		return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
	}

	/** @param {KeyboardEvent} e */
	function onkeydown(e) {
		// Ctrl/⌘ + K : toujours actif, même dans un champ
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			paletteOpen = !paletteOpen;
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || paletteOpen) return;

		if (pendingG) {
			pendingG = false;
			clearTimeout(gTimer);
			const target = goTargets[e.key.toLowerCase()];
			if (target && isVisible(target, profile)) {
				e.preventDefault();
				goto(target.href);
			}
			return;
		}
		switch (e.key) {
			case 'g':
			case 'G':
				pendingG = true;
				gTimer = setTimeout(() => (pendingG = false), 1200);
				break;
			case '/':
				e.preventDefault();
				paletteOpen = true;
				break;
			case '?':
				shortcutsOpen = true;
				break;
			case '[':
				collapsed = !collapsed;
				break;
			case 'n':
			case 'N':
				if (hasPermission(profile, ACTIONS.OTTO_WRITE)) goto('/otto?new=1');
				break;
		}
	}

	function exitPreview() {
		sessionStorage.removeItem(PREVIEW_ROLE_KEY);
		location.reload();
	}
</script>

<svelte:window {onkeydown} />

<a
	href="#main"
	class="sr-only z-[200] rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
	>Aller au contenu</a
>

{#if preview}
	<div
		class="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg"
		data-print="hide"
	>
		<Eye class="size-3.5" /> Aperçu avec le rôle « {preview} »
		<button
			type="button"
			onclick={exitPreview}
			class="rounded bg-black/15 px-2 py-0.5 hover:bg-black/25">Quitter</button
		>
	</div>
{/if}

<div class="flex min-h-dvh">
	<!-- Barre latérale (≥ md) -->
	<aside class="sticky top-0 hidden h-dvh shrink-0 md:block" data-print="hide">
		<Sidebar {profile} bind:collapsed />
	</aside>

	<!-- Tiroir mobile -->
	<Dialog.Root bind:open={mobileOpen}>
		<Dialog.Portal>
			<Dialog.Overlay
				class="csm-overlay fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px] md:hidden"
			/>
			<Dialog.Content
				class="csm-drawer fixed inset-y-0 left-0 z-[100] w-[min(300px,86vw)] shadow-e3 md:hidden"
				style="padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom);"
			>
				<Dialog.Title class="sr-only">Menu</Dialog.Title>
				<Dialog.Close
					class="csm-icon-btn absolute top-2.5 right-2 z-10"
					aria-label="Fermer le menu"
				>
					<X class="size-5" />
				</Dialog.Close>
				<Sidebar {profile} mobile onnavigate={() => (mobileOpen = false)} />
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<div class="flex min-w-0 flex-1 flex-col">
		<Topbar
			{user}
			{profile}
			onmenu={() => (mobileOpen = true)}
			onsearch={() => (paletteOpen = true)}
			onshortcuts={() => (shortcutsOpen = true)}
		/>
		<main
			id="main"
			tabindex="-1"
			class="csm-main min-w-0 flex-1 px-3 pt-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6 sm:pt-6 md:pb-10"
			style="view-transition-name: main-content;"
		>
			{@render children()}
		</main>
	</div>
</div>

<MobileTabBar {profile} onmenu={() => (mobileOpen = true)} />
<CommandPalette {profile} bind:open={paletteOpen} />
<ShortcutsDialog bind:open={shortcutsOpen} />
