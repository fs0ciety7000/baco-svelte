<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { presenceState } from '$lib/stores/presence.svelte.js';
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';
  
  import DashboardSkeleton from '$lib/components/DashboardSkeleton.svelte';
  import { zenMode } from '$lib/stores/zen';
  import { toast } from '$lib/stores/toast.js'; 
  import { Minimize } from 'lucide-svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';

  // --- VARIABLES ---
  let user = null;
  let loading = true;
  let isScreenshotFlashing = false;

  $: isLoginPage = $page.url.pathname === '/';

  function handleKeydown(event) {
    if (event.key === 'Escape' && $zenMode) {
        zenMode.set(false);
    }
  }

  onMount(async () => {
    // --- 1. LOGIQUE DE FLOU FLASH (SCREENSHOT) ---
    const handlePrintScreen = async (e) => {
      // On vérifie la touche PrintScreen (Code 44 ou 'PrintScreen')
      if (e.key === 'PrintScreen' || e.keyCode === 44) {
        // Activation immédiate du flou
        isScreenshotFlashing = true;
        
        toast.warning("Sécurité : Les données ont été floutées pour la capture.");

        // Tentative d'écrasement du presse-papier
        try {
          await navigator.clipboard.writeText("Contenu protégé - BACO");
        } catch (err) {
          // Échec silencieux si le navigateur bloque l'accès
        }

        // On laisse le flou pendant 1.5 seconde pour couvrir le délai du système
        setTimeout(() => {
          isScreenshotFlashing = false;
        }, 1500); 
      }
    };

    // IMPORTANT : On utilise 'keydown' pour flouter AVANT la capture système
    window.addEventListener('keydown', handlePrintScreen);

    // --- 2. AUTHENTICATION ---
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    if (!user && !isLoginPage) {
        goto('/');
    } else if (user && isLoginPage) {
        goto('/accueil');
    }
    
    loading = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      user = session?.user;
      if (event === 'SIGNED_OUT') goto('/');
    });

    // --- 3. NETTOYAGE ---
    return () => {
      window.removeEventListener('keydown', handlePrintScreen);
      subscription.unsubscribe();
    };
  });

  // Ajoutez cet effet pour initialiser la présence dès qu'on a le user
  $effect(() => {
    if (user) {
        presenceState.init(user);
    }
  });
</script>

<svelte:window on:keydown={handleKeydown} />

{#if loading && !isLoginPage}
  <DashboardSkeleton />
{:else}
  <div class="min-h-screen flex flex-col bg-deep-space text-gray-900 dark:text-gray-100 transition-all duration-300 relative {isScreenshotFlashing ? 'blur-3xl scale-95 pointer-events-none select-none' : ''}">
    
    {#if !isLoginPage && !$zenMode}
      <div transition:fade={{ duration: 200 }}>
          <Nav {user} />
          <GlobalSearch />
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