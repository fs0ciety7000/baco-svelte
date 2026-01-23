<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    
    // Icons
    import { 
        Users, Search, Plus, X, Save, Trash2, Pencil, 
        LayoutGrid, List, Phone, Info, ChevronLeft, ChevronRight, PenTool, Loader2
    } from 'lucide-svelte';

    // Libs
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { PmrClientsService } from '$lib/services/pmrClients.service.js';

    // --- CONFIG ---
    const ROWS_PER_PAGE = 12;

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);
    let isSaving = $state(false);

    // Données
    let clients = $state([]);
    let totalRows = $state(0);
    
    // Pagination & Filtres
    let currentPage = $state(1);
    let searchQuery = $state("");
    let searchTimer;

    // Vue
    let viewMode = $state('grid');

    // Modal
    let isModalOpen = $state(false);
    let editingClient = $state(getInitialClient());

    // --- EFFECTS ---
    // Gestion du debounce pour la recherche
    function handleSearchInput(e) {
        searchQuery = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            currentPage = 1; 
            loadData();
        }, 300);
    }

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.PMR_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        
        // Récupération vue préférée
        const savedView = localStorage.getItem('baco-client-view');
        if (savedView) viewMode = savedView;

        await loadData();
    });

    async function loadData() {
        isLoading = true;
        try {
            const { data, total } = await PmrClientsService.loadClients({
                page: currentPage,
                limit: ROWS_PER_PAGE,
                search: searchQuery
            });
            clients = data;
            totalRows = total;
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement clients");
        } finally {
            isLoading = false;
        }
    }

    // --- ACTIONS ---

    function setView(mode) {
        viewMode = mode;
        try { localStorage.setItem('baco-client-view', mode); } catch (e) {}
    }

    function changePage(newPage) {
        const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE) || 1;
        if (newPage < 1 || newPage > maxPage) return;
        currentPage = newPage;
        loadData();
    }

    function openModal(client = null) {
        if (!hasPermission(currentUser, ACTIONS.PMR_WRITE)) return;
        if (client) {
            // Copie pour ne pas modifier la liste directement
            editingClient = { ...client };
        } else {
            editingClient = getInitialClient();
        }
        isModalOpen = true;
    }

    async function handleSave() {
        if (!editingClient.nom) return toast.warning("Nom requis");
        
        isSaving = true;
        try {
            await PmrClientsService.saveClient(editingClient);
            toast.success(editingClient.id ? "Modifié" : "Créé");
            isModalOpen = false;
            await loadData();
        } catch(e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSaving = false;
        }
    }

    function handleDelete(client) {
        if (!hasPermission(currentUser, ACTIONS.PMR_DELETE)) return;
        openConfirmModal(`Supprimer ${client.prenom || ''} ${client.nom} ?`, async () => {
            try {
                await PmrClientsService.deleteClient(client.id);
                toast.success("Supprimé");
                await loadData();
            } catch(e) {
                toast.error("Erreur suppression");
            }
        });
    }

    // --- HELPERS ---
    function getInitialClient() {
        return { id: null, prenom: "", nom: "", telephone: "", type: "", remarques: "" };
    }

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

    function getTypeBadgeClass(type) {
        if (!type) return 'bg-white/5 text-gray-400 border-white/10';
        if (['CRP', 'CRF'].includes(type)) return 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(248,113,113,0.15)]';
        if (['CRE'].includes(type)) return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 shadow-[0_0_8px_rgba(250,204,21,0.15)]';
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_8px_rgba(96,165,250,0.15)]';
    }

    const inputClass = "block w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none";
    const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";

</script>

<svelte:head>
  <title>Clients PMR | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-blue-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
              <Users size={32} />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Clients PMR</h1>
              <p class="text-gray-500 text-sm mt-1">Répertoire et suivi des voyageurs.</p>
            </div>
        </div>

        <div class="flex items-center gap-3">
            <div class="flex bg-black/20 rounded-xl p-1 border border-white/5">
                <button onclick={() => setView('grid')} class="p-2 rounded-lg transition-all {viewMode === 'grid' ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}" title="Grille">
                    <LayoutGrid size={18} />
                </button>
                <button onclick={() => setView('list')} class="p-2 rounded-lg transition-all {viewMode === 'list' ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-300'}" title="Liste">
                    <List size={18} />
                </button>
            </div>
            
            {#if hasPermission(currentUser, ACTIONS.PMR_WRITE)}
                <button 
                  onclick={() => openModal()} 
                  class="px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold shadow-lg shadow-blue-500/10"
                >
                  <Plus size={20} />
                  <span class="hidden sm:inline">Nouveau</span>
                </button>
            {/if}
        </div>
      </header>

      <main class="space-y-6">
        
        <div class="max-w-lg relative group" in:fly={{ y: 20, delay: 100 }}>
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
            <input 
                type="text" 
                value={searchQuery}
                oninput={handleSearchInput}
                placeholder="Rechercher (Nom, Tél, Type...)" 
                class="block w-full pl-10 pr-4 py-3 bg-black/20 border border-white/10 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all placeholder-gray-600" 
            />
        </div>

        {#if isLoading}
          <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-blue-500/50" /></div>
        {:else if clients.length === 0}
          <div class="text-center py-24 bg-black/20 rounded-3xl border border-dashed border-white/10">
            <Users size={48} class="mx-auto text-gray-600 mb-4" />
            <h3 class="text-lg font-bold text-gray-400">Aucun client trouvé</h3>
            <p class="text-sm text-gray-600 mt-1">Modifiez votre recherche ou ajoutez un client.</p>
          </div>
        {:else}
        
          {#if viewMode === 'grid'}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" in:fly={{ y: 20 }}>
              {#each clients as client (client.id)}
               <div class="group bg-black/20 rounded-3xl border border-white/5 hover:border-blue-500/20 shadow-sm hover:shadow-xl hover:shadow-black/50 transition-all duration-300 flex flex-col overflow-hidden hover:-translate-y-1">
                  
                  <div class="px-6 py-5 border-b border-white/5 flex justify-between items-start bg-white/[0.02]">
                    <div>
                      <h3 class="text-lg font-bold text-gray-200 truncate max-w-[180px]" title="{client.prenom || ''} {client.nom}">
                        {client.prenom || ''} {client.nom}
                      </h3>
                      {#if client.type}
                        <span class="inline-flex items-center px-2 py-0.5 mt-1 rounded-md text-[10px] font-extrabold uppercase border {getTypeBadgeClass(client.type)}">
                          {formatType(client.type)}
                        </span>
                      {/if}
                    </div>
                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {#if hasPermission(currentUser, ACTIONS.PMR_WRITE)}
                        <button onclick={() => openModal(client)} class="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-colors"><Pencil size={16} /></button>
                      {/if}
                      {#if hasPermission(currentUser, ACTIONS.PMR_DELETE)}
                        <button onclick={() => handleDelete(client)} class="p-2 text-gray-400 hover:text-red-400 hover:bg-white/5 rounded-xl transition-colors"><Trash2 size={16} /></button>
                      {/if}
                    </div>
                  </div>

                  <div class="px-6 py-5 space-y-4 flex-grow text-sm">
                    {#if client.telephone}
                       <div class="flex items-center gap-3">
                           <div class="p-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20"><Phone size={14} /></div>
                           <a href="etrali:{client.telephone}" class="font-mono font-medium text-gray-300 hover:text-blue-400 transition-colors tracking-wide">{formatPhone(client.telephone)}</a>
                       </div>
                    {:else}
                        <div class="text-sm text-gray-600 italic pl-1 flex items-center gap-2"><Phone size={14} class="opacity-50"/> Pas de téléphone</div>
                    {/if}
              
                    {#if client.remarques}
                      <div class="flex items-start gap-3 pt-3 border-t border-white/5">
                        <div class="p-1.5 bg-yellow-500/10 text-yellow-400 rounded-lg mt-0.5 border border-yellow-500/20"><Info size={14} /></div>
                        <p class="text-gray-400 leading-relaxed text-xs line-clamp-3">{client.remarques}</p>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

          {:else}
            <div class="bg-black/20 rounded-3xl border border-white/5 overflow-hidden backdrop-blur-sm" in:fly={{ y: 20 }}>
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-white/5">
                  <thead class="bg-white/[0.02]">
                    <tr>
                      <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/4">Nom</th>
                      <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider w-1/6">Téléphone</th>
                      <th class="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Type</th>
                      <th class="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Remarques</th>
                      <th class="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    {#each clients as client (client.id)}
                      <tr class="group hover:bg-white/[0.03] transition-colors">
                        <td class="px-6 py-4 whitespace-nowrap">
                           <div class="flex flex-col">
                            <span class="text-sm font-bold text-gray-200">{client.prenom || ''} {client.nom}</span>
                            {#if client.updated_at}<span class="text-[10px] text-gray-600">Maj: {new Date(client.updated_at).toLocaleDateString()}</span>{/if}
                          </div>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            {#if client.telephone}
                                <a href="etrali:{client.telephone}" class="inline-flex items-center gap-2 text-xs font-mono text-gray-400 hover:text-blue-400 transition-colors bg-white/5 px-2 py-1 rounded-lg border border-white/5 hover:border-blue-500/30">
                                    <Phone size={12} /> {formatPhone(client.telephone)}
                                </a>
                            {:else}<span class="text-xs text-gray-700 italic px-2">—</span>{/if}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-center">
                          {#if client.type}
                             <span class="inline-flex items-center justify-center px-2 py-1 text-[10px] font-extrabold rounded-md border {getTypeBadgeClass(client.type)}">
                              {formatType(client.type)}
                            </span>
                          {:else}<span class="text-gray-700 text-lg leading-none">—</span>{/if}
                        </td>
                        <td class="px-6 py-4">
                          {#if client.remarques}
                             <div class="max-w-xs"><p class="text-sm text-gray-400 truncate" title={client.remarques}>{client.remarques}</p></div>
                          {:else}<span class="text-xs text-gray-700 italic">Aucune remarque</span>{/if}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-right">
                          <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {#if hasPermission(currentUser, ACTIONS.PMR_WRITE)}
                                <button onclick={() => openModal(client)} class="p-2 text-gray-500 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-all"><Pencil size={16} /></button>
                            {/if}
                            {#if hasPermission(currentUser, ACTIONS.PMR_DELETE)}
                                <button onclick={() => handleDelete(client)} class="p-2 text-gray-500 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all"><Trash2 size={16} /></button>
                            {/if}
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
              <button onclick={() => changePage(currentPage - 1)} disabled={currentPage === 1} class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /> Précédent</button>
              <button onclick={() => changePage(currentPage + 1)} disabled={currentPage >= (Math.ceil(totalRows / ROWS_PER_PAGE) || 1)} class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Suivant <ChevronRight size={16} /></button>
            </div>
          </div>

        {/if}
      </main>

      {#if isModalOpen}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
          <div 
            class="bg-[#1a1d24] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10"
            transition:fly={{ y: 20 }}
          >
            <div class="flex items-center justify-between px-8 py-6 border-b border-white/10 bg-white/[0.02]">
              <h2 class="text-xl font-bold text-gray-200 flex items-center gap-3">
                {#if editingClient.id} 
                    <div class="p-1.5 bg-blue-500/10 rounded-lg border border-blue-500/20"><PenTool size={18} class="text-blue-400"/></div>
                    Modifier
                {:else}
                    <div class="p-1.5 bg-green-500/10 rounded-lg border border-green-500/20"><Plus size={18} class="text-green-400"/></div>
                    Nouveau client
                {/if}
              </h2>
              <button onclick={() => isModalOpen = false} class="text-gray-500 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"><X size={20} /></button>
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

            <div class="px-8 py-5 border-t border-white/10 bg-white/[0.02] flex justify-end gap-3">
              <button onclick={() => isModalOpen = false} class="px-5 py-2.5 text-sm font-medium text-gray-300 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition-all">Annuler</button>
              <button 
                  onclick={handleSave} 
                  disabled={isSaving} 
                  class="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 border border-blue-500/30 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                >
                  {#if isSaving}<Loader2 size={18} class="animate-spin" />{:else}<Save size={18}/>{/if} Enregistrer
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
{/if}