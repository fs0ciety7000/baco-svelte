<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto, onNavigate } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { Minimize } from 'lucide-svelte';
	import { supabase } from '$lib/supabase';
	import AppShell from '$lib/components/shell/AppShell.svelte';
	import PwaReload from '$lib/components/PwaReload.svelte';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { zenMode } from '$lib/stores/zen';
	import { toast } from '$lib/stores/toast.js';
	import { presenceState } from '$lib/stores/presence.svelte.js';

	let { data, children } = $props();

	const bare = $derived(
		!data.user || page.url.pathname === '/login' || page.url.pathname === '/maintenance'
	);

	// Transitions de page fluides (View Transitions API, si disponible)
	onNavigate((navigation) => {
		if (
			!document.startViewTransition ||
			navigation.from?.url.pathname === navigation.to?.url.pathname
		)
			return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	$effect(() => {
		if (data.user) presenceState.init(data.user);
	});

	$effect(() => {
		if (page.url.searchParams.get('denied') === '1') {
			toast.error("Vous n'avez pas accès à ce module.");
		}
	});

	onMount(() => {
		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((event) => {
			if (event === 'SIGNED_OUT') goto('/login');
		});
		return () => subscription.unsubscribe();
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && $zenMode && zenMode.set(false)} />

{#if bare}
	{@render children()}
{:else if $zenMode}
	<main class="h-dvh overflow-hidden">{@render children()}</main>
	<button
		onclick={() => zenMode.set(false)}
		transition:fade
		aria-label="Quitter le mode plein écran"
		class="fixed right-6 bottom-6 z-50 grid size-11 place-items-center rounded-full border border-line bg-surface/80 text-muted shadow-e3 backdrop-blur-md hover:text-fg"
	>
		<Minimize class="size-5" />
	</button>
{:else}
	<AppShell user={data.user} profile={data.profile}>
		{@render children()}
	</AppShell>
{/if}

<ToastContainer />
<PwaReload />
<ConfirmModal />
