<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { goto, invalidate } from '$app/navigation';
  
  // --- IMPORT CRUCIAL POUR EVITER L'ERREUR 500 ---
  import { browser } from '$app/environment';

  // Composants UI
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte'; // Attention au chemin (ui/ ou racine ?)
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  import DashboardSkeleton from '$lib/components/DashboardSkeleton.svelte';
  import SeasonalDecorator from '$lib/components/SeasonalDecorator.svelte';
  import PwaReload from '$lib/components/PwaReload.svelte';

  // Composants Sécurité
  import Watermark from '$lib/components/ui/Watermark.svelte';
  import SecurityShield from '$lib/components/ui/SecurityShield.svelte';

  // Stores
  import { zenMode } from '$lib/stores/zen';
  import { toast } from '$lib/stores/toast'; 
  import { presenceState } from '$lib/stores/presence.svelte.js';

  // Icons & Transitions
  import { Minimize } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';

  // --- PROPS SVELTE 5 ---
  let { data, children } = $props();

  // --- ETATS REACTIFS (RUNES) ---
  // On dérive l'utilisateur directement des données SvelteKit (plus fiable)
  let session = $derived(data.session);
  let user = $derived(session?.user);
  
  let loading = $state(true);
  let isScreenshotFlashing = $state(false);
  let isLoginPage = $derived($page.url.pathname === '/');

  // --- LOGIQUE ---

  function handleKeydown(event) {
    if (event.key === 'Escape' && $zenMode) {
        zenMode.set(false);
    }
  }

  // Initialisation Présence
  $effect(() => {
    if (user && browser) {
        presenceState.init(user);
    }
  });

  onMount(async () => {
    loading = false;

    // --- 1. DETECTEUR SCREENSHOT (SIMULATION VISUELLE) ---
    const handlePrintScreen = async (e) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        isScreenshotFlashing = true;
        toast.warning("Sécurité : Contenu protégé.");
        try { await navigator.clipboard.writeText("⚠️ DONNÉES CONFIDENTIELLES - COPIE INTERDITE"); } catch (err) {}
        setTimeout(() => isScreenshotFlashing = false, 1500); 
      }
    };
    window.addEventListener('keydown', handlePrintScreen);

    // --- 2. GESTION AUTHENTIFICATION (CLIENT SIDE) ---
    // On écoute les changements pour garder la session à jour
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, _session) => {
      if (_session?.expires_at !== session?.expires_at) {
        invalidate('supabase:auth');
      }
      if (event === 'SIGNED_OUT') goto('/');
    });

    return () => {
      window.removeEventListener('keydown', handlePrintScreen);
      subscription.unsubscribe();
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if loading && !isLoginPage}
  <DashboardSkeleton />
{:else}
  <div class="min-h-screen flex flex-col bg-[#0f1115] text-gray-100 transition-all duration-300 relative {isScreenshotFlashing ? 'blur-3xl scale-95 pointer-events-none select-none' : ''}">
    
    <SeasonalDecorator />

    {#if !isLoginPage && !$zenMode}
      <div transition:fade={{ duration: 200 }} class="relative z-30">
          <Nav {user} />
          <GlobalSearch />
      </div>
    {/if}

    <main class="flex-grow grid grid-cols-1 grid-rows-1 relative z-10 {isLoginPage ? '' : ($zenMode ? 'h-screen overflow-hidden' : 'container mx-auto px-4 py-8')}">
      {#key $page.url.pathname}
        <div 
          class="col-start-1 row-start-1 w-full h-full"
          in:fly={{ y: 20, duration: 300, delay: 300, easing: cubicOut }} 
          out:fly={{ y: -20, duration: 300, easing: cubicIn }}
        >
             {@render children()}
        </div>
      {/key}
    </main>

    {#if !isLoginPage && !$zenMode}
      <div transition:fade={{ duration: 200 }}>
          <Footer />
      </div> 
    {/if}

    {#if $zenMode}
      <button 
          onclick={() => zenMode.set(false)}
          transition:fade
          class="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-white/10 hover:bg-red-500/20 text-white/50 hover:text-white border border-white/5 backdrop-blur-md shadow-2xl transition-all hover:scale-110 group cursor-pointer"
      >
          <Minimize class="w-6 h-6" />
      </button>
    {/if}

    <ToastContainer />
    <PwaReload />
    <ConfirmModal />

    {#if user && browser}
        <Watermark {user} />
        <SecurityShield />
    {/if}

  </div>
{/if}

<style>
  /* Sécurité Ultime : Bloque l'impression via CSS */
  @media print {
    :global(body) { display: none !important; }
    :global(html)::after {
        content: "CONFIDENTIEL - IMPRESSION INTERDITE";
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: black; color: white; display: flex;
        justify-content: center; align-items: center; font-size: 2em; z-index: 99999;
    }
  }
</style>