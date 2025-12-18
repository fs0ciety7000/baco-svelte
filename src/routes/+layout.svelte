<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores'; // <-- Import important
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { currentThemeId } from '$lib/stores/theme';
  import Nav from '$lib/components/Nav.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import GlobalSearch from '$lib/components/GlobalSearch.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import ConfirmModal from '$lib/components/ConfirmModal.svelte';

  let user = null;
  let loading = true;
let isChristmasTheme = false;
  // Détecter si on est sur la page de login (racine)
  $: isLoginPage = $page.url.pathname === '/';

  onMount(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    user = session?.user;

    if (user) {
      // Récupérer la préférence de thème
      const { data: profile } = await supabase
        .from('profiles')
        .select('theme')
        .eq('id', user.id)
        .single();
        
      if (profile?.theme) {
          currentThemeId.set(profile.theme);
      }
  }
  
    // Redirection automatique si non connecté et qu'on essaie d'accéder à une page interne
    if (!user && !isLoginPage) {
        goto('/');
    }
    // Redirection automatique si connecté et qu'on est sur le login
    if (user && isLoginPage) {
        goto('/accueil');
    }


// Lire l'état du thème depuis le localStorage
    if (typeof localStorage !== 'undefined') {
      isChristmasTheme = localStorage.getItem('bacoChristmasTheme') !== 'false';
    }
    
    // Écouter les changements de l'événement (nécessite d'émettre un événement dans Nav.svelte ou de passer un store)
    // Pour simplifier ici, le thème sera appliqué uniquement au chargement ou en utilisant l'état initial.



    loading = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      user = session?.user;
      if (event === 'SIGNED_OUT') goto('/');
    });

    return () => subscription.unsubscribe();
  });
</script>

<div class="min-h-screen flex flex-col bg-deep-space text-gray-900 dark:text-gray-100 transition-colors duration-300">
  
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