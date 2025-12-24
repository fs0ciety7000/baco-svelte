<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { Heart, Loader2, ListChecks, ArrowUp, Github } from 'lucide-svelte';

  let currentYear = new Date().getFullYear();
  let latestVersion = null;
  let loadingVersion = true;
  let showGoTop = false;

  // Gestion du scroll
  function handleScroll() {
    showGoTop = window.scrollY > 300;
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onMount(async () => {
    try {
        const { data, error } = await supabase
        .from('changelog')
        .select('title, type')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
        if (data && !error) {
            // Petit nettoyage visuel du type
            const typeLabel = data.type === 'Nouveau' ? 'New' : (data.type === 'Corrigé' ? 'Fix' : 'Upd');
            latestVersion = `${typeLabel}: ${data.title}`;
        } else {
            latestVersion = 'v1.0.0';
        }
    } catch (e) {
        latestVersion = 'v1.0.0';
    } finally {
        loadingVersion = false;
    }
  });
</script>

<svelte:window on:scroll={handleScroll} />

<footer class="mt-20 border-t border-white/5 bg-black/20 backdrop-blur-md text-gray-400 text-xs sm:text-sm py-8 relative z-10">
  
  <div class="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent"></div>

  <div class="container mx-auto px-6 text-center">
    
    <div class="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 flex-wrap">
      
      <div class="flex items-center gap-2">
        <span class="font-bold text-gray-200 tracking-wide">BACO</span>
        <span class="text-white/10">&bull;</span>
        <span>{currentYear}</span>
      </div>

      <div class="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5 hover:bg-white/10 transition-colors cursor-default">
        <span>Made with</span>
        <Heart class="w-3.5 h-3.5 text-red-500 fill-red-500/20 animate-pulse" />
        <span class="hidden sm:inline">by Nicolas & Thomas</span>
      </div>

      <a href="/changelog" 
         class="group flex items-center gap-2 bg-black/30 hover:bg-blue-500/10 border border-white/5 hover:border-blue-500/30 px-3 py-1 rounded-full transition-all duration-300"
         title="Voir les nouveautés">
        {#if loadingVersion}
          <Loader2 class="w-3.5 h-3.5 animate-spin text-gray-500" />
        {:else}
          <ListChecks class="w-3.5 h-3.5 text-blue-400 group-hover:text-blue-300 transition-colors" />
          <span class="font-mono text-gray-400 group-hover:text-blue-200 transition-colors">{latestVersion}</span>
        {/if}
      </a>

    </div>
  </div>

<button
    onclick={scrollToTop}
    class="fixed bottom-6 right-6 z-50 p-3 rounded-xl transition-all duration-500 transform
    text-white backdrop-blur-md border hover:-translate-y-1 active:scale-95
    {showGoTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}"
    style="
        background-color: rgba(var(--color-primary), 0.8);
        border-color: rgba(var(--color-primary), 0.3);
        box-shadow: 0 0 15px rgba(var(--color-primary), 0.3);
    "
    onmouseenter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgb(var(--color-primary))';
        e.currentTarget.style.boxShadow = '0 0 25px rgba(var(--color-primary), 0.5)';
    }}
    onmouseleave={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(var(--color-primary), 0.8)';
        e.currentTarget.style.boxShadow = '0 0 15px rgba(var(--color-primary), 0.3)';
    }}
    title="Retour en haut"
>
    <ArrowUp class="w-5 h-5" />
</button>

</footer>