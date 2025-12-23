<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  
  import DashboardSkeleton from '$lib/components/DashboardSkeleton.svelte';
  import { zenMode } from '$lib/stores/zen';
  import { toast } from '$lib/stores/toast.js'; // Vérifiez que l'import est correct
  import { Minimize } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';

  // --- VARIABLES ---
  let user = null;
  let loading = true;
  let isChristmasTheme = false;
  let isHidden = false; // Initialisé à faux

  $: isLoginPage = $page.url.pathname === '/';

  function handleKeydown(event) {
    if (event.key === 'Escape' && $zenMode) {
        zenMode.set(false);
    }
  }

  onMount(async () => {
    // --- 1. GESTION DE LA VISIBILITÉ (FLOU) ---
    const handleVisibilityChange = () => {
      // Met à jour isHidden si l'onglet est caché OU si la fenêtre n'a plus le focus
      isHidden = document.hidden || !document.hasFocus();
    };

    // --- 2. GESTION DE LA TOUCHE PRINT SCREEN ---
    const handlePrintScreen = async (e) => {
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        toast.warning("Capture d'écran détectée : Les données sensibles sont protégées.");
        try {
          await navigator.clipboard.writeText("Contenu protégé - BACO");
        } catch (err) {
          console.error("Erreur presse-papier:", err);
        }
      }
    };

    // Ajout des écouteurs
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);
    window.addEventListener('focus', () => isHidden = false);
    window.addEventListener('keyup', handlePrintScreen);

    // --- 3. AUTHENTICATION ---
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    if (!user && !isLoginPage) {
        goto('/');
    } else if (user && isLoginPage) {
        goto('/accueil');
    }

    if (typeof localStorage !== 'undefined') {
      isChristmasTheme = localStorage.getItem('bacoChristmasTheme') !== 'false';
    }
    
    loading = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      user = session?.user;
      if (event === 'SIGNED_OUT') goto('/');
    });

    // --- 4. NETTOYAGE UNIQUE ---
    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
      window.removeEventListener('focus', () => isHidden = false);
      window.removeEventListener('keyup', handlePrintScreen);
      subscription.unsubscribe();
    };
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if loading && !isLoginPage}
  <DashboardSkeleton />
{:else}
  <div class="min-h-screen flex flex-col bg-deep-space text-gray-900 dark:text-gray-100 transition-all duration-500 relative {isHidden ? 'blur-2xl scale-[0.98] pointer-events-none select-none' : ''}">
    
    {#if !isLoginPage && !$zenMode}
      <div transition:fade={{ duration: 200 }}>
          <Nav {user} />
          <GlobalSearch />
      </div>
    {/if}

    {#if user}
      <div class="fixed inset-0 pointer-events-none z-[9999] opacity-[0.01] flex flex-wrap gap-20 overflow-hidden select-none">
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
      >
          <Minimize class="w-6 h-6" />
      </button>
    {/if}

    <ToastContainer />
    <ConfirmModal />
  </div>
{/if}

<style>
  @media print {
    :global(body) { display: none !important; }
  }
</style>