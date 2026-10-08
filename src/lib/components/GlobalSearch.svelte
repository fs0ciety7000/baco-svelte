<script>
  import { onMount, tick } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { goto } from '$app/navigation';
  import { sanitizeHighlight } from '$lib/utils/sanitize.js';
  import { fade, fly } from 'svelte/transition';
  import { 
    Search, Loader2, FileText, Users, Tag, Car, Bus, 
    BookUser, Shield, Train, File, X
  } from 'lucide-svelte';

  // --- ÉTATS ---
  let isOpen = false;
  let searchTerm = '';
  let results = [];
  let loading = false;
  let selectedIndex = -1;
  let searchTimer;
  let inputElement;
  let resultsContainer;
  
  // Mode "Sélection" (Callback) ou "Navigation" (Standard)
  let onSelectCallback = null; 

  // --- MAPPING ICÔNES ---
  const iconMap = {
    'contact_repertoire': BookUser,
    'procedure': Shield,
    'client_pmr': Users,
    'ptcar': Tag,
    'taxi': Car,
    'bus': Bus,
    'document': FileText,
    'train': Train,
    'otto_commande': Bus
  };

  // --- GESTION ---

  function open(callback = null) {
    isOpen = true;
    searchTerm = '';
    results = [];
    selectedIndex = -1;
    onSelectCallback = callback;
    tick().then(() => inputElement?.focus());
  }

  function close() {
    isOpen = false;
    onSelectCallback = null;
  }

  function handleWindowKeydown(e) {
    if ((e.ctrlKey || e.metaKey || e.shiftKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      isOpen ? close() : open();
    }
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  }

  onMount(() => {
    const openListener = (e) => open(e.detail?.callback);
    window.addEventListener('openGlobalSearch', openListener);
    window.showGlobalSearch = (cb) => open(cb);

    return () => {
      window.removeEventListener('openGlobalSearch', openListener);
      delete window.showGlobalSearch;
    };
  });

  // --- RECHERCHE ---

  function handleInput() {
    clearTimeout(searchTimer);
    if (searchTerm.length < 2) {
      results = [];
      loading = false;
      return;
    }
    searchTimer = setTimeout(executeSearch, 300);
  }

  async function executeSearch() {
    loading = true;
    try {
      const { data, error } = await supabase.rpc('global_search', { search_term: searchTerm });
      if (error) throw error;
      results = data || [];
      selectedIndex = -1;
    } catch (err) {
      console.error('Erreur recherche:', err);
      results = [];
    } finally {
      loading = false;
    }
  }

  // --- NAVIGATION ---

  function handleKeyNav(e) {
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % results.length;
      scrollToSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + results.length) % results.length;
      scrollToSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && results[selectedIndex]) {
        selectResult(results[selectedIndex]);
      }
    }
  }

  function scrollToSelected() {
    if (!resultsContainer) return;
    const selectedEl = resultsContainer.children[selectedIndex];
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function selectResult(result) {
    const resultObject = {
      id: result.result_id,
      type: result.result_type_key,
      title: result.title,
      snippet: result.snippet,
      url: result.url
    };

    if (onSelectCallback) {
      onSelectCallback(resultObject);
    } else {
      if (result.result_type_key === 'document') {
        window.open(result.url, '_blank');
      } else {
        goto(result.url);
      }
    }
    close();
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if isOpen}
  <div 
    class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm transition-opacity"
    transition:fade={{ duration: 150 }}
    on:click|self={close}
  >
    
    <div 
      class="w-full max-w-2xl bg-[#0f1115]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col transform transition-all ring-1 ring-white/5"
      in:fly={{ y: -20, duration: 200 }}
    >
      
      <div class="relative flex items-center p-4 border-b border-white/5 bg-white/[0.02]">
        <Search class="w-5 h-5 text-gray-400 absolute left-5" />
        
        <input 
          bind:this={inputElement}
          bind:value={searchTerm}
          on:input={handleInput}
          on:keydown={handleKeyNav}
          type="text" 
          placeholder={onSelectCallback ? "Chercher un contenu à lier..." : "Chercher partout..."}
          class="w-full bg-transparent border-0 text-lg text-gray-200 pl-10 pr-10 py-2 focus:outline-none placeholder-gray-500 font-medium"
          autocomplete="off"
        >

        {#if loading}
          <Loader2 class="w-5 h-5 text-blue-400 animate-spin absolute right-5" />
        {:else if searchTerm}
          <button on:click={() => { searchTerm = ''; inputElement.focus(); }} class="absolute right-5 text-gray-500 hover:text-white transition-colors">
            <X class="w-5 h-5" />
          </button>
        {/if}
      </div>

      <div 
        bind:this={resultsContainer}
        class="p-2 overflow-y-auto max-h-[60vh] custom-scrollbar space-y-1"
      >
        {#if searchTerm.length < 2}
          <div class="text-center py-12 text-gray-500">
            <Search class="w-8 h-8 mx-auto mb-3 opacity-20" />
            <p class="text-sm">Commencez à taper pour rechercher...</p>
          </div>
        
        {:else if !loading && results.length === 0}
          <div class="text-center py-12 text-gray-500">
            <p class="text-sm">Aucun résultat trouvé pour "{searchTerm}".</p>
          </div>
        
        {:else}
          {#each results as result, index}
            <button
              on:click={() => selectResult(result)}
              class="w-full flex items-center justify-between gap-4 p-3 rounded-xl cursor-pointer text-left transition-all duration-150 group
                     {index === selectedIndex ? 'bg-blue-600/20 shadow-[0_0_15px_rgba(59,130,246,0.15)] ring-1 ring-blue-500/30' : 'hover:bg-white/5 hover:text-gray-100'}"
            >
              <div class="flex items-center gap-4 overflow-hidden">
                <div class="p-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 group-hover:text-blue-300 group-hover:border-blue-500/30 transition-colors">
                    <svelte:component 
                      this={iconMap[result.result_type_key] || File} 
                      class="w-5 h-5" 
                    />
                </div>
                
                <div class="overflow-hidden">
                  <p class="text-sm font-bold text-gray-200 truncate group-hover:text-white transition-colors">
                    {@html sanitizeHighlight(result.title)} 
                  </p>
                  <p class="text-xs text-gray-500 truncate mt-0.5 group-hover:text-gray-400 transition-colors">
                    {@html sanitizeHighlight(result.snippet)}
                  </p>
                </div>
              </div>
              
              <span class="text-[10px] font-bold text-gray-500 bg-black/30 px-2 py-1 rounded border border-white/5 uppercase tracking-wide group-hover:text-gray-300 transition-colors">
                {result.result_type}
              </span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="px-4 py-3 bg-white/[0.02] border-t border-white/5 flex justify-between items-center text-xs text-gray-500">
        <span>Résultats : <strong class="text-gray-300">{results.length}</strong></span>
        <div class="flex items-center gap-3">
            <span class="flex items-center gap-1"><kbd class="font-mono bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-gray-300">↑↓</kbd> Naviguer</span>
            <span class="flex items-center gap-1"><kbd class="font-mono bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-gray-300">↵</kbd> Ouvrir</span>
            <span class="flex items-center gap-1"><kbd class="font-mono bg-white/10 border border-white/10 rounded px-1.5 py-0.5 text-gray-300">Esc</kbd> Fermer</span>
        </div>
      </div>

    </div>
  </div>
{/if}