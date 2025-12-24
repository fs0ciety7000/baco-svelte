<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade } from 'svelte/transition';
  import { 
    Database, Search, ChevronLeft, ChevronRight, Loader2
  } from 'lucide-svelte';

  // --- CONFIG ---
  const ROWS_PER_PAGE = 15;

  // --- ÉTAT ---
  let ebpData = [];
  let isLoading = true;
  
  // Pagination & Recherche
  let searchQuery = "";
  let searchTimer;
  let currentPage = 1;
  let totalRows = 0;

  onMount(() => {
    loadData();
  });

  // --- LOGIQUE MÉTIER ---

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1; 
      loadData();
    }, 300);
  }

  function changePage(newPage) {
    const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE) || 1;
    if (newPage < 1 || newPage > maxPage) return;
    currentPage = newPage;
    loadData();
    const table = document.getElementById('result-table');
    if(table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadData() {
    isLoading = true;
    try {
      const from = (currentPage - 1) * ROWS_PER_PAGE;
      const to = from + ROWS_PER_PAGE - 1;

      let query = supabase
        .from('ebp')
        .select('Lignes, PtCar, Abbr, Vue_EBP', { count: 'exact' })
        .order('PtCar', { ascending: true })
        .range(from, to);

      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`Lignes.ilike.%${q}%,PtCar.ilike.%${q}%,Abbr.ilike.%${q}%,Vue_EBP.ilike.%${q}%`);
      }

      const { data, count, error } = await query;
      
      if (error) throw error;

      ebpData = data || [];
      totalRows = count || 0;

    } catch (error) {
      console.error("Erreur chargement:", error);
    } finally {
      isLoading = false;
    }
  }

  // --- HELPERS UI ---
  $: fromRow = (currentPage - 1) * ROWS_PER_PAGE + 1;
  $: toRow = Math.min(currentPage * ROWS_PER_PAGE, totalRows);

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" 
          in:fly={{ y: -20, duration: 600 }}
          style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl border transition-all duration-500"
             style="background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);">
          <Database size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Données EBP</h1>
          <p class="text-gray-500 text-sm mt-1">Répertoire des vues EBP et correspondances.</p>
        </div>
    </div>
  </header>

  <main class="space-y-8" style="--primary-rgb: var(--color-primary);">
    
    <div class="max-w-xl mx-auto" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <div class="relative group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-themed transition-colors">
          <Search size={18} />
        </div>
        <input 
          type="text" 
          placeholder="Rechercher (ex: 90, Acren, FXA...)" 
          bind:value={searchQuery}
          on:input={handleSearchInput}
          class="block w-full pl-10 pr-3 py-3 bg-black/40 border border-white/10 rounded-2xl text-sm text-gray-200 placeholder-gray-600 focus:ring-2 focus:border-transparent transition-all outline-none"
          style="--tw-ring-color: rgba(var(--primary-rgb), 0.3); border-color: rgba(var(--primary-rgb), 0.1);"
        />
      </div>
    </div>

    <div id="result-table" class="min-h-[400px]">
      {#if isLoading}
        <div class="flex flex-col items-center justify-center py-20 text-gray-500">
          <Loader2 class="w-10 h-10 animate-spin themed-spinner mb-3" />
          <p>Chargement des données...</p>
        </div>
      
      {:else if ebpData.length === 0}
        <div class="text-center py-24 bg-black/20 rounded-3xl border border-dashed border-white/10" in:fade>
          <Database size={48} class="mx-auto text-gray-600 mb-4 opacity-50" />
          <h3 class="text-lg font-bold text-gray-400">Aucun résultat</h3>
          <p class="text-sm text-gray-600 mt-1">Aucune donnée EBP ne correspond à votre recherche.</p>
        </div>

      {:else}
        <div class="bg-black/20 rounded-3xl shadow-sm border border-white/5 overflow-hidden backdrop-blur-sm" in:fly={{ y: 20, duration: 600 }}>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-white/5">
              <thead class="bg-white/[0.02]">
                <tr>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">Lignes</th>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">PtCar</th>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">Abréviation</th>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">Vue EBP</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each ebpData as row}
                  <tr class="group hover:bg-white/[0.03] transition-colors duration-150">
                    
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400 font-medium">
                      {row.Lignes || '—'}
                    </td>

                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-200 font-bold">
                      {row.PtCar || '—'}
                    </td>

                    <td class="px-6 py-4 whitespace-nowrap">
                      {#if row.Abbr}
                        <span class="abbr-badge">
                          {row.Abbr}
                        </span>
                      {:else}
                        <span class="text-gray-600">—</span>
                      {/if}
                    </td>

                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono group-hover:text-gray-400 transition-colors">
                      {row.Vue_EBP || '—'}
                    </td>

                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between mt-8 border-t border-white/10 pt-6 gap-4">
          
          <div class="text-sm text-gray-400 bg-white/5 border border-white/10 rounded-xl px-4 py-2 shadow-sm">
            Données <span class="font-bold text-gray-200">{totalRows > 0 ? fromRow : 0}</span> à <span class="font-bold text-gray-200">{toRow}</span> sur
            <span class="font-bold text-gray-200">{totalRows}</span>
          </div>

          <div class="flex gap-2">
            <button 
              on:click={() => changePage(currentPage - 1)} 
              disabled={currentPage === 1}
              class="page-btn"
            >
              <ChevronLeft size={16} /> Précédent
            </button>
            <button 
              on:click={() => changePage(currentPage + 1)} 
              disabled={currentPage >= Math.ceil(totalRows / ROWS_PER_PAGE)}
              class="page-btn"
            >
              Suivant <ChevronRight size={16} />
            </button>
          </div>
        </div>

      {/if}
    </div>

  </main>
</div>

<style>
  .text-themed { color: rgb(var(--primary-rgb)); }
  .themed-spinner { color: rgba(var(--primary-rgb), 0.5); }

  .abbr-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.625rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: bold;
    font-family: monospace;
    background-color: rgba(var(--primary-rgb), 0.1);
    color: rgb(var(--primary-rgb));
    border: 1px solid rgba(var(--primary-rgb), 0.2);
    box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.1);
    transition: all 0.2s;
  }

  .group:hover .abbr-badge {
    background-color: rgba(var(--primary-rgb), 0.2);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.2);
  }

  .page-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #9ca3af;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    transition: all 0.2s;
  }

  .page-btn:hover:not(:disabled) {
    background-color: rgba(var(--primary-rgb), 0.1);
    border-color: rgba(var(--primary-rgb), 0.3);
    color: rgb(var(--primary-rgb));
  }

  .page-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
</style>