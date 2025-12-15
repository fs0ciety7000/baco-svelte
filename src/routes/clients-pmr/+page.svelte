<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  
  // >>> AJOUT DES IMPORTS POUR TOASTS ET MODALE
  import { toast } from '$lib/stores/toast.js';
  import { openConfirmModal } from '$lib/stores/modal.js';
  // <<<
  
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

      // >>> CORRECTION SUPABASE : Suppression de la jointure 'profiles'
      let query = supabase
        .from('pmr_clients')
        .select(`*`, { count: 'exact' }) // Était: .select(`*, profiles ( full_name )`, { count: 'exact' })
        .order('nom', { ascending: true })
        .range(from, to);
      // <<<
      
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
      // >>> REMPLACEMENT DE alert()
      toast.error("Erreur lors du chargement des clients : " + error.message);
      // <<<
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
      // >>> TOAST DE SUCCÈS
      toast.success(`Client ${editingClient.nom} sauvegardé avec succès.`);
      // <<<
    } catch (error) {
      // >>> REMPLACEMENT DE alert()
      toast.error("Erreur de sauvegarde : " + error.message);
      // <<<
    } finally {
      isSaving = false;
    }
  }

  // Fonction d'exécution de la suppression (callback de la modale)
  function executeDeleteClient(id, nom) {
    return async () => {
        const { error } = await supabase.from('pmr_clients').delete().eq('id', id);
        
        if (error) {
            // >>> UTILISATION DE toast.error
            toast.error("Erreur suppression: " + error.message);
        } else {
            loadClients();
            // >>> TOAST DE SUCCÈS
            toast.success(`Le client "${nom}" a été supprimé.`);
        }
    };
  }

  // Fonction qui appelle la modale de confirmation
  async function deleteClient(id, nom) {
    // >>> REMPLACEMENT DE confirm()
    openConfirmModal(
        `Voulez-vous vraiment supprimer le client "${nom}" définitivement ?`,
        executeDeleteClient(id, nom)
    );
    // <<<
  }

  function openModal(client = null) {
    editingClient = client ?
    { ...client } : { id: null, prenom: "", nom: "", telephone: "", type: "", remarques: "" };
    isModalOpen = true;
  }
  function closeModal() { isModalOpen = false;
  }

  // --- HELPERS UI ---
  
  // 1. Fonction ajoutée pour raccourcir les types longs
  function formatType(type) {
    if (!type) return '';
    if (type === "Difficultés de compréhension/orientation") return "Diff. Compr.";
    // Vous pouvez ajouter d'autres raccourcis ici si besoin
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
    if (!type) return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    if (['CRP', 'CRF'].includes(type)) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800';
    if (type === 'CRE') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800';
    return 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800';
  }

  const inputClass = "block w-full rounded-2xl border-gray-200 bg-white p-3 text-sm font-medium focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 transition-shadow shadow-sm";
  const labelClass = "block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide";
</script>

<div class="min-h-screen bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-10">
  
  <header class="sticky top-0 z-30 w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 rounded-b-3xl transition-colors duration-300">
    <div class="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2.5 bg-blue-100 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
          <Users size={24} />
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight 
text-gray-900 dark:text-white">Clients PMR</h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 font-medium hidden sm:block">Répertoire clients</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 border border-gray-200 dark:border-gray-600">
          <button on:click={() => setView('grid')} class="p-2 rounded-lg transition-all {viewMode === 'grid' ?
'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}" title="Vue Grille"><LayoutGrid size={18} /></button>
          <button on:click={() => setView('list')} class="p-2 rounded-lg transition-all {viewMode === 'list' ?
'bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}" title="Vue Liste"><List size={18} /></button>
        </div>
        <button on:click={() => openModal()} class="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-95">
          <Plus size={20} /> <span class="hidden sm:inline">Ajouter</span>
        </button>
      </div>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    
    <div class="mb-8 max-w-lg mx-auto 
sm:mx-0">
      <div class="relative group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-blue-500 transition-colors"><Search size={18} /></div>
        <input type="text" placeholder="Rechercher (Nom, Tél, Type...)" bind:value={searchQuery} on:input={handleSearchInput} class="block w-full pl-10 pr-3 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm" />
      </div>
    </div>

    {#if isLoading}
      <div class="flex flex-col items-center justify-center py-20 text-gray-400"><div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div><p>Chargement...</p></div>
    {:else 
if clients.length === 0}
      <div class="text-center py-24 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <Users size={48} class="mx-auto text-gray-300 dark:text-gray-600 mb-4" /><h3 class="text-lg font-bold text-gray-900 dark:text-white">Aucun client trouvé</h3>
      </div>
    {:else}
      
      {#if viewMode === 'grid'}
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each clients as client}
           
 <div class="group bg-white dark:bg-gray-800 rounded-3xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col overflow-hidden">
              <div class="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start bg-gray-50/50 dark:bg-gray-800/50">
                <div>
                  <h3 class="text-lg font-bold text-gray-900 dark:text-white truncate max-w-[180px]" title="{client.prenom ||
''} {client.nom}">{client.prenom || ''} {client.nom}</h3>
                  {#if client.type}
                    <span class="inline-flex items-center px-2.5 py-0.5 mt-1 rounded-full text-[10px] font-extrabold uppercase border {getTypeBadgeClass(client.type)}" title={client.type}>
                      {formatType(client.type)}
                    </span>
   
                {/if}
                </div>
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button on:click={() => openModal(client)} class="p-2 text-blue-600 hover:bg-white dark:hover:bg-blue-900/30 rounded-xl transition-colors"><Pencil size={16} /></button>
                  <button 
on:click={() => deleteClient(client.id, client.nom)} class="p-2 text-red-600 hover:bg-white dark:hover:bg-red-900/30 rounded-xl transition-colors"><Trash2 size={16} /></button>
                </div>
              </div>
              <div class="px-6 py-5 space-y-4 flex-grow">
                {#if client.telephone}
                  <div class="flex items-center gap-3 text-sm">
  
                   <div class="p-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-lg"><Phone size={14} /></div>
                    <a href="etrali:{client.telephone}" class="font-mono font-medium hover:text-blue-600 transition-colors">{formatPhone(client.telephone)}</a>
                  </div>
                {:else}<div class="text-sm text-gray-400 italic pl-1">Pas de téléphone</div>{/if}
          
                {#if client.remarques}
                  <div class="flex items-start gap-3 text-sm pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    <div class="p-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 rounded-lg mt-0.5"><Info size={14} /></div>
                    <p class="text-gray-600 dark:text-gray-300 leading-relaxed text-xs line-clamp-2">{client.remarques}</p>
              
              </div>
                {/if}
              </div>
              <div class="px-6 py-3 bg-gray-50/50 dark:bg-gray-900/30 border-t border-gray-100 dark:border-gray-700 text-[10px] text-gray-400 dark:text-gray-500">
                <!-- {#if client.updated_at}Modifié le {new Date(client.updated_at).toLocaleDateString()} {/* {#if client.profiles} par {client.profiles.full_name}{/if} }{/if} -->
              </div>
    
            </div>
          {/each}
        </div>

      {:else}
        <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead class="bg-gray-50/80 dark:bg-gray-900/50 backdrop-blur-sm">
        
                <tr>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-1/4">Nom</th>
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-1/6">Téléphone</th>
                  <th scope="col" class="px-6 py-4 text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Type</th>
     
                  <th scope="col" class="px-6 py-4 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remarques</th>
                  <th scope="col" class="px-6 py-4 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-700/50 
bg-white dark:bg-gray-800">
                {#each clients as client}
                  <tr class="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors duration-150">
                    <td class="px-6 py-4 whitespace-nowrap">
                      <div class="flex flex-col">
          
                        <span class="text-sm font-bold text-gray-900 dark:text-white">{client.prenom ||
''} {client.nom}</span>
                        {#if client.updated_at}<span class="text-[10px] text-gray-400 dark:text-gray-500">Maj: {new Date(client.updated_at).toLocaleDateString()}</span>{/if}
                      </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap align-middle">
   
                       {#if client.telephone}
                        <a href="etrali:{client.telephone}" class="inline-flex items-center gap-2 text-sm font-mono text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-600 hover:border-blue-200">
                          <Phone size={12} /> {formatPhone(client.telephone)}
       
                         </a>
                      {:else}<span class="text-xs text-gray-300 dark:text-gray-600 italic px-2">—</span>{/if}
                    </td>
                    
                
                    <td class="px-6 py-4 whitespace-nowrap text-center align-middle">
                      {#if client.type}
                        <span 
                          class="inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-extrabold rounded-full border shadow-sm {getTypeBadgeClass(client.type)}"
       
                          title={client.type}
                        >
                          {formatType(client.type)}
                        </span>
       
                      {:else}<span class="text-gray-300 dark:text-gray-600 text-lg leading-none">—</span>{/if}
                    </td>

                    <td class="px-6 py-4 align-middle">
                      {#if client.remarques}
               
                        <div class="relative group/tooltip max-w-xs"><p class="text-sm text-gray-600 dark:text-gray-300 truncate" title={client.remarques}>{client.remarques}</p></div>
                      {:else}<span class="text-xs text-gray-300 dark:text-gray-600 italic">Aucune remarque</span>{/if}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right align-middle">
           
                      <div class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button on:click={() => openModal(client)} class="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-all"><Pencil size={16} /></button>
                        <button on:click={() => deleteClient(client.id, client.nom)} class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-all"><Trash2 size={16} /></button>
          
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
        
          </div>
        </div>
      {/if}

      <div class="flex items-center justify-between mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
        <p class="text-sm text-gray-500 dark:text-gray-400">Page <span class="font-bold text-gray-900 dark:text-white">{currentPage}</span> sur <span class="font-bold text-gray-900 dark:text-white">{Math.ceil(totalRows / ROWS_PER_PAGE) || 
1}</span></p>
        <div class="flex gap-2">
          <button on:click={() => changePage(currentPage - 1)} disabled={currentPage === 1} class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={16} /> Précédent</button>
          <button on:click={() => changePage(currentPage + 1)} disabled={currentPage >= (Math.ceil(totalRows / ROWS_PER_PAGE) || 1)} class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Suivant <ChevronRight size={16} /></button>
    
        </div>
      </div>

    {/if}
  </main>

  {#if isModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-md transition-opacity" on:click={closeModal}></div>
      <div class="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
          <h2 class="text-2xl font-bold text-gray-900 
dark:text-white flex items-center gap-2">{#if editingClient.id} <PenTool size={20} class="text-blue-500"/> {/if} {editingClient.id ?
'Modifier' : 'Nouveau client'}</h2>
          <button on:click={closeModal} class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={24} /></button>
        </div>
        <div class="p-8 overflow-y-auto space-y-6 flex-grow bg-gray-50/50 dark:bg-gray-900/50">
          <div class="grid grid-cols-2 gap-4">
            <div><label class={labelClass}>Prénom</label><input type="text" bind:value={editingClient.prenom} class={inputClass} placeholder="Jean" /></div>
            <div><label class={labelClass}>Nom</label><input type="text" bind:value={editingClient.nom} class={inputClass} placeholder="Dupont" /></div>
     
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class={labelClass}>Téléphone</label><input type="text" bind:value={editingClient.telephone} class={inputClass} placeholder="0470..." /></div>
            <div><label class={labelClass}>Type</label><input type="text" bind:value={editingClient.type} class={inputClass} placeholder="NV, CRP..." /></div>
          </div>
          <div><label class={labelClass}>Remarques</label><textarea rows="3" bind:value={editingClient.remarques} class="{inputClass} resize-none" placeholder="Infos utiles..."></textarea></div>
        </div>
        <div class="px-8 
py-5 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 z-10">
          <button on:click={closeModal} class="px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 hover:shadow-sm transition-all">Annuler</button>
          <button on:click={saveClient} disabled={isSaving} class="px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2 shadow-md hover:shadow-lg transition-all transform active:scale-95 disabled:opacity-50"><Save size={18} /> Enregistrer</button>
        </div>
      </div>
    </div>
  {/if}
</div>