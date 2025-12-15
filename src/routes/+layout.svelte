<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores'; // <-- Import important
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';

  let user = null;
  let loading = true;

  // Détecter si on est sur la page de login (racine)
  $: isLoginPage = $page.url.pathname === '/';

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    // Redirection automatique si non connecté et qu'on essaie d'accéder à une page interne
    if (!user && !isLoginPage) {
        goto('/');
    }
    // Redirection automatique si connecté et qu'on est sur le login
    if (user && isLoginPage) {
        goto('/accueil');
    }

    loading = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      user = session?.user;
      if (event === 'SIGNED_OUT') goto('/');
    });

    return () => subscription.unsubscribe();
  });
</script>

<div class="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-300">
  
  {#if !isLoginPage}
    <Nav {user} />
    <GlobalSearch />
  {/if}

  <main class="flex-grow {isLoginPage ? '' : 'container mx-auto px-4 py-8'}">
    <slot />
  </main>

  {#if !isLoginPage}
    <Footer /> 
  {/if}
  <ToastContainer />
  <ConfirmModal />
</div>