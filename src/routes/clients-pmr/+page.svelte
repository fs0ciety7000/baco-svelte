<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade } from 'svelte/transition';
  
  // Imports Stores
  import { toast } from '$lib/stores/toast.js';
  import { openConfirmModal } from '$lib/stores/modal.js';
  
  import { 
    Users, Search, Plus, X, Save, Trash2, Pencil, 
    LayoutGrid, List, Phone, Info, ChevronLeft, ChevronRight, PenTool
  } from 'lucide-svelte';

  // --- CONFIG ---
  const ROWS_PER_PAGE = 12;

  // --- ÉTAT ---
  let clients = [];
  let isLoading = true;
  let isSaving = false;
  let isModalOpen = false;
  
  // Pagination & Recherche
  let searchQuery = "";
  let searchTimer;
  let currentPage = 1;
  let totalRows = 0;
  
  // Vue (Grille par défaut)
  let viewMode = 'grid';
  
  // Objet Client (Édition/Création)
  let editingClient = {
    id: null,
    prenom: "",
    nom: "",
    telephone: "",
    type: "",
    remarques: ""
  };

  onMount(() => {
    try {
      const savedView = localStorage.getItem('baco-client-view');
      if (savedView) viewMode = savedView;
    } catch (e) {}
    loadClients();
  });

  // --- LOGIQUE MÉTIER ---

  function setView(mode) {
    viewMode = mode;
    try { localStorage.setItem('baco-client-view', mode);
    } catch (e) {}
  }

  function handleSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1; 
      loadClients();
    }, 300);
  }

  function changePage(newPage) {
    const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE) || 1;
    if (newPage < 1 || newPage > maxPage) return;
    currentPage = newPage;
    loadClients();
  }

  async function loadClients() {
    isLoading = true;
    try {
      const from = (currentPage - 1) * ROWS_PER_PAGE;
      const to = from + ROWS_PER_PAGE - 1;

      let query = supabase
        .from('pmr_clients')
        .select(`*`, { count: 'exact' })
        .order('nom', { ascending: true })
        .range(from, to);
      
      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`nom.ilike.%${q}%,prenom.ilike.%${q}%,telephone.ilike.%${q}%,type.ilike.%${q}%`);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      clients = data || [];
      totalRows = count || 0;
    } catch (error) {
      console.error("Erreur chargement:", error);
      toast.error("Erreur lors du chargement des clients : " + error.message);
    } finally {
      isLoading = false;
    }
  }

  async function saveClient() {
    isSaving = true;
    const payload = { ...editingClient };
    ['prenom', 'telephone', 'type', 'remarques'].forEach(k => {
      if (!payload[k] || payload[k].trim() === '') payload[k] = null;
    });
    delete payload.id; 

    try {
      let error;
      if (editingClient.id) {
        const res = await supabase.from('pmr_clients').update(payload).eq('id', editingClient.id);
        error = res.error;
      } else {
        const res = await supabase.from('pmr_clients').insert([payload]);
        error = res.error;
      }
      if (error) throw error;
      closeModal();
      loadClients();
      toast.success(`Client ${editingClient.nom} sauvegardé avec succès.`);
    } catch (error) {
      toast.error("Erreur de sauvegarde : " + error.message);
    } finally {
      isSaving = false;
    }
  }

  function executeDeleteClient(id, nom) {
    return async () => {
        const { error } = await supabase.from('pmr_clients').delete().eq('id', id);
        if (error) {
            toast.error("Erreur suppression: " + error.message);
        } else {
            loadClients();
            toast.success(`Le client "${nom}" a été supprimé.`);
        }
    };
  }

  async function deleteClient(id, nom) {
    openConfirmModal(
        `Voulez-vous vraiment supprimer le client "${nom}" définitivement ?`,
        executeDeleteClient(id, nom)
    );
  }

  function openModal(client = null) {
    editingClient = client ? { ...client } : { id: null, prenom: "", nom: "", telephone: "", type: "", remarques: "" };
    isModalOpen = true;
  }
  
  function closeModal() { isModalOpen = false; }

  // --- HELPERS UI ---
  
  function formatType(type) {
    if (!type) return '';
    if (type === "Difficultés de compréhension/orientation") return "Diff. Compr.";
    return type;
  }

  function formatPhone(tel) {
    if (!tel) return 'N/A';
    const cleaned = tel.replace(/\D/g, '');
    if (cleaned.length === 10) return cleaned.replace(/(\d{4})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
    if (cleaned.length === 9) return cleaned.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
    return tel; 
  }

  // Badges avec style Néon/Glass
  function getTypeBadgeClass(type) {
    if (!type) return 'bg-gray-700/50 text-gray-400 border-gray-600/50';
    if (['CRP', 'CRF'].includes(type)) return 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(248,113,113,0.1)]';
    if (type === 'CRE') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_8px_rgba(250,204,21,0.1)]';
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_8px_rgba(96,165,250,0.1)]';
  }

  // Styles Inputs Dark/Glass
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Users size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Clients PMR</h1>
          <p class="text-gray-500 text-sm mt-1">Répertoire et suivi des voyageurs PMR.</p>
        </div>
    </div>

    <div class="flex items-center gap-3">
        <div class="flex bg-black/20 rounded-xl p-1 border border-white/5">
          <button on:click={() => setView('grid')} class="p-2 rounded-lg transition-all {viewMode === 'grid' ? 'bg-white/10 text-blue-300 shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}" title="Vue Grille"><LayoutGrid size={18} /></button>
          <button on:click={() => setView('list')} class="p-2 rounded-lg transition-all {viewMode === 'list' ? 'bg-white/10 text-blue-300 shadow-sm' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}" title="Vue Liste"><List size={18} /></button>
        </div>
        
        <button 
  on:click={() => openModal()} 
  class="btn-themed px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border shadow-lg"
  style="--primary-rgb: var(--color-primary);"
>
  <Plus size={20} class="group-hover:rotate-90 transition-transform" />
  <span class="font-semibold hidden sm:inline">Nouveau Client</span>
</button>
    </div>
  </header>

  <main>
    
    <div class="mb-8 max-w-lg" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <div class="relative group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-blue-400 transition-colors">
            <Search size={18} />
        </div>
        <input 
            type="text" 
            placeholder="Rechercher (Nom, Tél, Type...)" 
            bind:value={searchQuery} 
            on:input={handleSearchInput} 
            class="block w-full pl-10 pr-3 py-3 bg-black/20 border border-white/5 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/30 focus:border-transparent transition-all outline-none placeholder-gray-600" 
        />
      </div>
    </div>

    {#if isLoading}
      <div class="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
          <div class="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p>Chargement du répertoire...</p>
      </div>
    {:else if clients.length === 0}
      <div class="text-center py-24 bg-black/20 rounded-3xl border border-dashed border-white/10" in:fade>
        <Users size={48} class="mx-auto text-gray-700 mb-4" />
        <h3 class="text-lg font-bold text-gray-400">Aucun client trouvé</h3>
        <p class="text-sm text-gray-600">Modifiez votre recherche ou ajoutez un nouveau client.</p>
      </div>
    {:else}
      
      {#if viewMode === 'grid'}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each clients as client (client.id)}
           <div class="group bg-black/20 rounded-3xl border border-white/5 hover:border-blue-500/20 shadow-sm hover:shadow-xl hover:shadow-black/50 transition-all duration-300 flex flex-col overflow-hidden hover:-translate-y-1" in:fly={{ y: 20, duration: 300 }}>
              
              <div class="px-6 py-5 border-b border-white/5 flex justify-between items-start bg-white/[0.02]">
                <div>
                  <h3 class="text-lg font-bold text-gray-200 truncate max-w-[180px]" title="{client.prenom || ''} {client.nom}">
                    {client.prenom || ''} {client.nom}
                  </h3>
                  {#if client.type}
                    <span class="inline-flex items-center px-2 py-0.5 mt-1 rounded-md text-[10px] font-extrabold uppercase border {getTypeBadgeClass(client.type)}" title={client.type}>
                      {formatType(client.type)}
                    </span>
                  {/if}
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button on:click={() => openModal(client)} class="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-colors"><Pencil size={16} /></button>
                  <button on:click={() => deleteClient(client.id, client.nom)} class="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-xl transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>

              <div class="px-6 py-5 space-y-4 flex-grow text-sm">
                {#if client.telephone}
                  <div class="flex items-center gap-3">
                   <div class="p-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20"><Phone size={14} /></div>
                    <a href="etrali:{client.telephone}" class="font-mono font-medium text-gray-300 hover:text-blue-400 transition-colors tracking-wide">{formatPhone(client.telephone)}</a>
                  </div>
                {:else}
                    <div class="text-sm text-gray-600 italic pl-1">Pas de téléphone</div>
                {/if}
          
                {#if client.remarques}
                  <div class="flex items-start gap-3 pt-2 border-t border-white/5">
                    <div class="p-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg mt-0.5 border border-yellow-500/20"><Info size={14} /></div>
                    <p class="text-gray-400 leading-relaxed text-xs line-clamp-3">{client.remarques}</p>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>

      {:else}
        <div class="bg-black/20 rounded-3xl border border-white/5 overflow-hidden backdrop-blur-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-white/5">
              <thead class="bg-white/[0.02]">
                <tr>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">Nom</th>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/6">Téléphone</th>
                  <th scope="col" class="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Type</th>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Remarques</th>
                  <th scope="col" class="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                {#each clients as client (client.id)}
                  <tr class="group hover:bg-white/[0.03] transition-colors duration-150">
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="flex flex-col">
                        <span class="text-sm font-bold text-gray-200">{client.prenom || ''} {client.nom}</span>
                        {#if client.updated_at}<span class="text-[10px] text-gray-600">Maj: {new Date(client.updated_at).toLocaleDateString()}</span>{/if}
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap align-middle">
                       {#if client.telephone}
                        <a href="etrali:{client.telephone}" class="inline-flex items-center gap-2 text-sm font-mono text-gray-400 hover:text-blue-400 transition-colors bg-white/5 px-2 py-1 rounded-lg border border-white/5 hover:border-blue-500/30">
                          <Phone size={12} /> {formatPhone(client.telephone)}
                         </a>
                      {:else}<span class="text-xs text-gray-700 italic px-2">—</span>{/if}
                    </td>
                    
                    <td class="px-6 py-4 whitespace-nowrap text-center align-middle">
                      {#if client.type}
                        <span class="inline-flex items-center justify-center px-2 py-1 text-[10px] font-extrabold rounded-md border {getTypeBadgeClass(client.type)}" title={client.type}>
                          {formatType(client.type)}
                        </span>
                      {:else}<span class="text-gray-700 text-lg leading-none">—</span>{/if}
                    </td>

                    <td class="px-6 py-4 align-middle">
                      {#if client.remarques}
                        <div class="max-w-xs"><p class="text-sm text-gray-400 truncate" title={client.remarques}>{client.remarques}</p></div>
                      {:else}<span class="text-xs text-gray-700 italic">Aucune remarque</span>{/if}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right align-middle">
                      <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button on:click={() => openModal(client)} class="p-2 text-gray-500 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-all"><Pencil size={16} /></button>
                        <button on:click={() => deleteClient(client.id, client.nom)} class="p-2 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/if}

      <div class="flex items-center justify-between mt-8 border-t border-white/10 pt-6">
        <p class="text-sm text-gray-500">Page <span class="font-bold text-gray-300">{currentPage}</span> sur <span class="font-bold text-gray-300">{Math.ceil(totalRows / ROWS_PER_PAGE) || 1}</span></p>
        <div class="flex gap-2">
          <button on:click={() => changePage(currentPage - 1)} disabled={currentPage === 1} class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /> Précédent</button>
          <button on:click={() => changePage(currentPage + 1)} disabled={currentPage >= (Math.ceil(totalRows / ROWS_PER_PAGE) || 1)} class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Suivant <ChevronRight size={16} /></button>
        </div>
      </div>

    {/if}
  </main>

  {#if isModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm" transition:fade>
      <div 
        class="bg-[#0f1115] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10 ring-1 ring-white/5"
        transition:fly={{ y: 20, duration: 300 }}
      >
        <div class="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/[0.02]">
          <h2 class="text-xl font-bold text-gray-200 flex items-center gap-3">
            {#if editingClient.id} 
                <div class="p-1.5 bg-blue-500/20 rounded-lg"><PenTool size={18} class="text-blue-400"/></div>
                Modifier
            {:else}
                <div class="p-1.5 bg-green-500/20 rounded-lg"><Plus size={18} class="text-green-400"/></div>
                Nouveau client
            {/if}
          </h2>
          <button on:click={closeModal} class="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-white/5 transition-colors"><X size={20} /></button>
        </div>

        <div class="p-8 overflow-y-auto space-y-6 flex-grow custom-scrollbar">
          <div class="grid grid-cols-2 gap-4">
            <div><label class={labelClass}>Prénom</label><input type="text" bind:value={editingClient.prenom} class={inputClass} placeholder="Jean" /></div>
            <div><label class={labelClass}>Nom</label><input type="text" bind:value={editingClient.nom} class={inputClass} placeholder="Dupont" /></div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class={labelClass}>Téléphone</label><input type="text" bind:value={editingClient.telephone} class={inputClass} placeholder="0470..." /></div>
            <div><label class={labelClass}>Type</label><input type="text" bind:value={editingClient.type} class={inputClass} placeholder="NV, CRP..." /></div>
          </div>
          <div>
            <label class={labelClass}>Remarques</label>
            <textarea rows="3" bind:value={editingClient.remarques} class="{inputClass} resize-none" placeholder="Infos utiles..."></textarea>
          </div>
        </div>

        <div class="px-8 py-5 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3 relative">
          <div class="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none"></div>

          <button 
            on:click={closeModal} 
            class="px-5 py-2.5 text-sm font-medium text-gray-300 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300"
          >
            Annuler
          </button>
          <button 
  on:click={saveClient} 
  disabled={isSaving} 
  class="btn-save px-5 py-2.5 text-sm font-bold text-white border rounded-xl transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
  style="--primary-rgb: var(--color-primary);"
>
  <Save size={18} class="group-hover:scale-110 transition-transform"/> 
  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .btn-themed {
    /* Fond léger basé sur le thème (20% d'opacité) */
    background-color: rgba(var(--primary-rgb), 0.2);
    /* Bordure assortie (30% d'opacité) */
    border-color: rgba(var(--primary-rgb), 0.3);
    /* Texte à la couleur du thème */
    color: rgb(var(--primary-rgb));
  }

  .btn-themed:hover {
    /* Augmentation de l'opacité et lueur au survol */
    background-color: rgba(var(--primary-rgb), 0.3);
    border-color: rgba(var(--primary-rgb), 0.5);
    /* Lueur (glow) dynamique basée sur la couleur du thème actuel */
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.4);
  }

  .btn-themed:active {
    transform: scale(0.95);
  }
  .btn-save {
    /* Utilise l'opacité 0.8 pour l'action principale comme votre original */
    background-color: rgba(var(--primary-rgb), 0.8);
    border-color: rgba(var(--primary-rgb), 0.3);
    /* Lueur dynamique basée sur la couleur du thème actuel */
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
  }

  .btn-save:hover:not(:disabled) {
    /* Opacité pleine et lueur accentuée au survol */
    background-color: rgba(var(--primary-rgb), 0.9);
    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.5);
    transform: translateY(-1px);
  }

  .btn-save:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>