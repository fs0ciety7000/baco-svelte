<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  
  // --- IMPORTS COMPOSANTS ---
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  
  // --- NOUVEAUX IMPORTS (Skeleton, Zen, Transitions) ---
  import DashboardSkeleton from '$lib/components/DashboardSkeleton.svelte';
  import { zenMode } from '$lib/stores/zen';
  import { Minimize } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';

  // --- VARIABLES ---
  let user = null;
  let loading = true; // État de chargement initial
  let isChristmasTheme = false;

  $: isLoginPage = $page.url.pathname === '/';

  // --- LOGIQUE ---
  function handleKeydown(event) {
    // Quitter le mode Zen avec Echap
    if (event.key === 'Escape' && $zenMode) {
        zenMode.set(false);
    }
  }

  onMount(async () => {

    const handleVisibilityChange = () => {
      // Flouter si l'onglet n'est plus actif ou si la fenêtre perd le focus
      isHidden = document.hidden || !document.hasFocus();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);
    window.addEventListener('focus', () => isHidden = false);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
      window.removeEventListener('focus', () => isHidden = false);
    };
    
    const handlePrintScreen = async (e) => {
    // Détecte la touche PrintScreen
    if (e.key === 'PrintScreen' || e.keyCode === 44) {
      // 1. Alerte l'utilisateur
      toast.warning("Capture d'écran détectée : Les données sensibles sont protégées.");
      
      // 2. Tente de vider le presse-papier (nécessite l'autorisation de l'utilisateur)
      try {
        await navigator.clipboard.writeText("Contenu protégé - BACO");
      } catch (err) {
        console.log("Impossible de vider le presse-papier sans interaction préalable.");
      }
    }
  };

  window.addEventListener('keyup', handlePrintScreen);
  return () => window.removeEventListener('keyup', handlePrintScreen);


    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    // Redirections de sécurité
    if (!user && !isLoginPage) {
        goto('/');
    }
    if (user && isLoginPage) {
        goto('/accueil');
    }

    // Récupération thème Noël (optionnel, si vous l'avez gardé)
    if (typeof localStorage !== 'undefined') {
      isChristmasTheme = localStorage.getItem('bacoChristmasTheme') !== 'false';
    }
    
    // Fin du chargement
    loading = false;

    // Écouteur Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      user = session?.user;
      if (event === 'SIGNED_OUT') goto('/');
    });

    return () => subscription.unsubscribe();
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if loading && !isLoginPage}
  <DashboardSkeleton />
{:else}
  <div class="min-h-screen flex flex-col bg-deep-space text-gray-900 dark:text-gray-100 transition-colors duration-300 relative">
    
    {#if !isLoginPage && !$zenMode}
      <div transition:fade={{ duration: 200 }}>
          <Nav {user} />
          <GlobalSearch />
      </div>
    {/if}

    {#if user}
  <div class="fixed inset-0 pointer-events-none z-[9999] opacity-[0.03] flex flex-wrap gap-20 overflow-hidden select-none">
    {#each Array(20) as _}
      <span class="text-white text-xl font-bold rotate-[-45deg] whitespace-nowrap">
        {user.email} - {new Date().toLocaleString()}
      </span>
    {/each}
  </div>
{/if}

    <main class="flex-grow grid grid-cols-1 grid-rows-1 {isLoginPage ? '' : ($zenMode ? 'h-screen overflow-hidden' : 'container mx-auto px-4 py-8')}">
      {#key $page.url.pathname}
        <div 
          class="col-start-1 row-start-1 w-full h-full"
          in:fly={{ y: 20, duration: 300, delay: 300, easing: cubicOut }} 
          out:fly={{ y: -20, duration: 300, easing: cubicIn }}
        >
          <slot />
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
          on:click={() => zenMode.set(false)}
          transition:fade
          class="fixed bottom-6 right-6 z-50 p-3 rounded-full bg-white/10 hover:bg-red-500/20 text-white/50 hover:text-white border border-white/5 backdrop-blur-md shadow-2xl transition-all hover:scale-110 group"
          title="Quitter le mode Zen (Échap)"
      >
          <Minimize class="w-6 h-6" />
          <span class="absolute right-full mr-3 top-1/2 -translate-y-1/2 px-2 py-1 bg-black/80 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              Quitter le mode Zen
          </span>
      </button>
    {/if}

    <ToastContainer />
    <ConfirmModal />
<div class="garland">
        <div class="garland-lights"></div>
    </div>
    <div class="sleigh-reindeer"></div>
    <div class="snowfall-effect"></div>

    <div class="ocean-bubbles">
        <div class="bubble-layer"></div>
    </div>

    <div class="forest-fireflies">
        <div class="firefly"></div>
        <div class="firefly"></div>
        <div class="firefly"></div>
        <div class="firefly"></div>
        <div class="firefly"></div>
    </div>

    <div class="cyber-grid"></div>

  </div> {/if}