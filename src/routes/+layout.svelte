<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  // Import des transitions Svelte
  import { fly, fade } from 'svelte/transition';
  import { cubicIn, cubicOut } from 'svelte/easing';
import DashboardSkeleton from '$lib/components/DashboardSkeleton.svelte';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';

  let user = null;
  let loading = true;
  let isChristmasTheme = false;

  $: isLoginPage = $page.url.pathname === '/';

  onMount(async () => {
    // ... (votre code existant reste identique ici) ...
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    if (!user && !isLoginPage) {
        goto('/');
    }
    if (user && isLoginPage) {
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

    return () => subscription.unsubscribe();
  });
</script>
{#if loading && !isLoginPage}
  <DashboardSkeleton />
{:else}
  <div class="min-h-screen flex flex-col bg-deep-space text-gray-900 dark:text-gray-100 transition-colors duration-300">
    
    {#if !isLoginPage}
      <Nav {user} />
      <GlobalSearch />
    {/if}

    <main class="flex-grow grid grid-cols-1 grid-rows-1 {isLoginPage ? '' : 'container mx-auto px-4 py-8'}">
      {#key $page.url.pathname}
        <div 
          class="col-start-1 row-start-1 w-full"
          in:fly={{ y: 20, duration: 300, delay: 300, easing: cubicOut }} 
          out:fly={{ y: -20, duration: 300, easing: cubicIn }}
        >
          <slot />
        </div>
      {/key}
    </main>

    {#if !isLoginPage}
      <Footer /> 
    {/if}
    <ToastContainer />
    <ConfirmModal />
  </div>
{/if}