<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { fly, fade } from 'svelte/transition';
  import { 
    Car, MapPin, Phone, Search, Plus, FileText, 
    Pencil, Trash2, X, CheckSquare, Square, Loader2, RefreshCw, 
    Info, Home, Mail 
  } from 'lucide-svelte';
  import jsPDF from 'jspdf';
  import autoTable from 'jspdf-autotable';
  
  // TOAST & PERMISSIONS
  import { toast } from '$lib/stores/toast.js';
  import { hasPermission, ACTIONS } from '$lib/permissions';

  // --- ÉTATS ---
  let currentUser = null;
  
  // 🔒 SÉCURITÉ : Bloqué par défaut pour éviter le "flash" de contenu
  let isAuthorized = false; 

  // Filtres
  let lieuxDisponibles = [];
  let loadingFilters = true;
  let selectedLieux = [];
  let taxis = [];
  let loading = false;
  let searchTerm = "";

  // Modale
  let showModal = false;
  let modalLoading = false;
  let isEditMode = false;
  let modalForm = {
    id: null,
    societe: '',
    lieux: '', 
    contacts: '',
    mail: '',
    adresse: '',    
    remarques: ''   
  };

  onMount(async () => {
    // 1. Récupérer la session (plus fiable que getUser directement)
    const { data: { session } } = await supabase.auth.getSession();
    
    // Si vraiment pas de session active -> Redirection vers le Login
    if (!session) {
        console.warn("Pas de session active -> Redirection Login");
        return goto('/');
    }

    // 2. Récupérer le profil complet (avec role et permissions)
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
    
    // Fusion des données auth et profil
    currentUser = { ...session.user, ...profile };

    // 3. VÉRIFICATION PERMISSION
    if (!hasPermission(currentUser, ACTIONS.TAXI_READ)) {
        toast.error("Accès refusé.");
        return goto('/accueil'); // Redirection vers l'accueil interne, pas le login
    }

    // 4. ✅ SUCCÈS : On débloque l'affichage et on charge les données
    isAuthorized = true;
    await loadFilters();
  });

  // --- LOGIQUE URL & RECHERCHE GLOBALE ---
  $: {
      const urlQuery = $page.url.searchParams.get('search');
      if (urlQuery && urlQuery !== searchTerm) {
          searchTerm = urlQuery;
      }
  }

  // --- CHARGEMENT DES FILTRES ---
  async function loadFilters() {
    loadingFilters = true;
    try {
      const { data, error } = await supabase.from('taxis').select('lieux');
      if (error) throw error;
      const allLieux = (data || []).flatMap(row => row.lieux || []);
      const uniqueLieux = [...new Set(allLieux)]
        .filter(l => l && l !== 'nihil' && l.trim() !== '')
        .sort();
      lieuxDisponibles = uniqueLieux;
    } catch (err) {
      console.error("Erreur chargement filtres:", err);
      toast.error("Erreur lors du chargement des secteurs.");
    } finally {
      loadingFilters = false;
    }
  }

  // --- CHARGEMENT DES TAXIS ---
  $: if (isAuthorized && (selectedLieux.length > 0 || searchTerm)) loadTaxis();
  
  async function loadTaxis() {
    if (selectedLieux.length === 0 && !searchTerm) {
      taxis = [];
      return;
    }

    loading = true;
    try {
      let query = supabase.from('taxis').select('*');
      if (selectedLieux.length > 0) {
          query = query.overlaps('lieux', selectedLieux);
      }
      query = query.order('nom');
      const { data, error } = await query;
      
      if (error) throw error;
      taxis = (data || []).map(t => ({
        ...t,
        societe: t.nom,
        lieux: t.lieux || [],
        contacts: t.contacts || [],
        mail: t.mail || [],
        adresse: t.adresse || [],
        remarques: t.remarques || []
      }));
    } catch (err) {
      console.error("Erreur chargement taxis:", err);
      toast.error("Impossible de charger la liste des taxis.");
    } finally {
      loading = false;
    }
  }

  $: filteredTaxis = taxis.filter(t => 
    (t.societe || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.contacts.some(c => c.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function toggleLieu(lieu) {
    if (selectedLieux.includes(lieu)) {
      selectedLieux = selectedLieux.filter(l => l !== lieu);
    } else {
      selectedLieux = [...selectedLieux, lieu];
    }
  }

  const cleanPhone = (tel) => tel ? tel.replace(/[^0-9]/g, '') : '';
  const joinArray = (arr) => (Array.isArray(arr) && arr.length > 0 && arr[0] !== 'nihil') ? arr.join('\n') : '';
  const splitString = (str) => str.split('\n').map(s => s.trim()).filter(Boolean);

  // --- GESTION MODALE ---
  function openModal(taxi = null) {
    // Vérification de sécurité supplémentaire avant d'ouvrir
    if (!hasPermission(currentUser, ACTIONS.TAXI_WRITE)) return; 

    isEditMode = !!taxi;
    if (isEditMode) {
      modalForm = {
        id: taxi.id,
        societe: taxi.societe,
        lieux: joinArray(taxi.lieux).replace(/\n/g, ', '), 
        contacts: joinArray(taxi.contacts),
        mail: joinArray(taxi.mail),
        adresse: joinArray(taxi.adresse),    
        remarques: joinArray(taxi.remarques)  
      };
    } else {
      modalForm = { id: null, societe: '', lieux: '', contacts: '', mail: '', adresse: '', remarques: '' };
    }
    showModal = true;
  }

  async function handleSubmit() {
    // Vérification permission écriture
    if (!hasPermission(currentUser, ACTIONS.TAXI_WRITE)) return toast.error("Action non autorisée.");

    if (!modalForm.societe) return toast.warning("Le nom de la société est requis.");
    modalLoading = true;

    const lieuxArray = modalForm.lieux.split(',').map(l => l.trim()).filter(Boolean);
    if (lieuxArray.length === 0) {
        toast.warning("Veuillez entrer au moins un secteur/lieu.");
        modalLoading = false;
        return;
    }

    const payload = {
      nom: modalForm.societe,
      lieux: lieuxArray,
      contacts: splitString(modalForm.contacts),
      mail: splitString(modalForm.mail),
      adresse: splitString(modalForm.adresse),    
      remarques: splitString(modalForm.remarques)  
    };

    let error;
    if (isEditMode) {
      const res = await supabase.from('taxis').update(payload).eq('id', modalForm.id);
      error = res.error;
    } else {
      const res = await supabase.from('taxis').insert([payload]);
      error = res.error;
    }

    modalLoading = false;
    if (error) {
      toast.error("Erreur: " + error.message);
    } else {
      toast.success(isEditMode ? "Taxi modifié avec succès !" : "Taxi ajouté avec succès !");
      showModal = false;
      await loadFilters();
      loadTaxis();
    }
  }

  async function deleteTaxi(id, nom) {
    // Vérification permission suppression
    if (!hasPermission(currentUser, ACTIONS.TAXI_DELETE)) return toast.error("Suppression non autorisée.");

    if (!confirm(`Supprimer le taxi "${nom}" ?`)) return;
    const { error } = await supabase.from('taxis').delete().eq('id', id);
    if (!error) {
        toast.success(`Taxi "${nom}" supprimé.`);
        await loadFilters();
        loadTaxis();
    } else {
        toast.error("Erreur lors de la suppression.");
    }
  }

  // --- EXPORT PDF ---
  function exportPDF() {
    if (filteredTaxis.length === 0) return toast.warning("Aucune donnée à exporter.");
    const doc = new jsPDF();
    doc.text(`Taxis - Lieux : ${selectedLieux.join(', ')}`, 14, 15);
    const rows = filteredTaxis.map(t => [
      t.societe,
      t.lieux.join(', '),
      t.contacts.join('\n'),
      t.mail.join('\n'),
      t.adresse.join('\n'),
      t.remarques.join('\n')
    ]);
    autoTable(doc, {
      startY: 25,
      head: [['Société', 'Lieux', 'Contacts', 'Emails', 'Adresse', 'Remarques']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 }
    });
    doc.save('taxis.pdf');
    toast.success("PDF téléchargé avec succès !");
  }

  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-yellow-500/50 focus:ring-yellow-500/50 transition-all outline-none";
  const labelClass = "block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide";
</script>

<svelte:head>
  <title>Taxis | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-yellow-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Vérification des accès...</p>
    </div>
{:else}
    <div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
      
      <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.15)]">
              <Car class="w-8 h-8" />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Répertoire Taxis</h1>
              <p class="text-gray-500 text-sm mt-1">Trouver un transporteur par secteur.</p>
            </div>
        </div>
        
        <div class="flex gap-2">
          {#if filteredTaxis.length > 0}
            <button on:click={exportPDF} class="flex items-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl transition-all hover:scale-105">
              <FileText class="w-4 h-4" /> <span class="hidden sm:inline font-bold">PDF</span>
            </button>
          {/if}

          {#if hasPermission(currentUser, ACTIONS.TAXI_WRITE)}
            <button 
              on:click={() => openModal()} 
              class="btn-themed px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border shadow-lg"
              style="--primary-rgb: var(--color-primary);"
            >
              <Plus class="w-5 h-5 group-hover:rotate-90 transition-transform" /> 
              <span class="font-semibold hidden sm:inline">Ajouter</span>
            </button>
          {/if}
        </div>
      </header>

      <div class="bg-black/20 border border-white/5 rounded-2xl p-6" in:fly={{ y: 20, duration: 600, delay: 100 }}>
        <div class="flex flex-col md:flex-row justify-between mb-6 gap-4">
          <div class="flex items-center gap-3">
            <h3 class="text-xs font-bold uppercase text-gray-500 flex items-center gap-2">
                <div class="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> Secteurs disponibles
            </h3>
            <button on:click={loadFilters} title="Rafraîchir les filtres" class="p-1.5 hover:bg-white/5 rounded-full transition-colors">
                <RefreshCw class="w-4 h-4 text-gray-500 {loadingFilters ? 'animate-spin' : ''}" />
            </button>
          </div>

          <div class="relative w-full md:w-72">
            <Search class="absolute left-3 top-3 h-4 w-4 text-gray-500" />
            <input 
                type="text" 
                bind:value={searchTerm} 
                placeholder="Rechercher une société..." 
                class="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/10 bg-black/40 text-gray-200 placeholder-gray-600 focus:ring-2 focus:ring-yellow-500/30 focus:border-transparent outline-none transition-all"
            >
          </div>
        </div>

        {#if loadingFilters && lieuxDisponibles.length === 0}
            <div class="text-sm text-gray-500 flex items-center gap-2"><Loader2 class="w-4 h-4 animate-spin"/> Chargement des secteurs...</div>
        {:else}
            <div class="flex flex-wrap gap-2">
            {#each lieuxDisponibles as lieu}
                <button 
                on:click={() => toggleLieu(lieu)}
                class="flex items-center space-x-2 px-3 py-1.5 border rounded-lg transition-all duration-300 text-xs font-medium uppercase tracking-wide
                {selectedLieux.includes(lieu) 
                    ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300 shadow-[0_0_10px_rgba(234,179,8,0.15)]' 
                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10 hover:text-white hover:border-white/20'}"
                >
                {#if selectedLieux.includes(lieu)}<CheckSquare class="w-3.5 h-3.5" />{:else}<Square class="w-3.5 h-3.5" />{/if}
                <span>{lieu}</span>
                </button>
            {/each}
            </div>
        {/if}
      </div>

      <div>
        {#if selectedLieux.length === 0 && !searchTerm}
          <div class="flex flex-col items-center justify-center h-64 text-gray-500 bg-black/20 rounded-2xl border border-dashed border-white/10" in:fade>
            <MapPin size={48} class="mb-4 opacity-30" />
            <p>Sélectionnez un secteur ci-dessus pour afficher les taxis.</p>
          </div>
        {:else if loading}
          <div class="flex flex-col items-center justify-center h-64 text-gray-500">
            <Loader2 class="w-10 h-10 animate-spin text-yellow-500/50 mb-3" />
            <p>Recherche des taxis...</p>
          </div>
        {:else if filteredTaxis.length === 0}
          <div class="text-center p-12 bg-black/20 rounded-2xl border border-dashed border-white/10">
            <p class="text-gray-500">Aucun taxi trouvé pour votre recherche.</p>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" in:fly={{ y: 20, duration: 400 }}>
            {#each filteredTaxis as taxi (taxi.id)}
              <div class="group bg-black/20 rounded-2xl border border-white/5 hover:border-yellow-500/30 p-5 hover:shadow-xl hover:shadow-black/50 transition-all duration-300 relative flex flex-col hover:-translate-y-1">
                
                <div class="flex justify-between items-start mb-4 pb-4 border-b border-white/5">
                  <h3 class="font-bold text-xl text-gray-200 group-hover:text-yellow-400 transition-colors">{taxi.societe}</h3>
                  <div class="flex flex-wrap gap-1 justify-end max-w-[50%]">
                      {#each taxi.lieux as l}
                        <span class="bg-yellow-500/10 text-yellow-500/80 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-500/10 {selectedLieux.includes(l) ? 'border-yellow-500/50 text-yellow-400 shadow-[0_0_5px_rgba(234,179,8,0.2)]' : ''}">
                            {l}
                        </span>
                      {/each}
                  </div>
                </div>

                <div class="space-y-3 flex-grow text-sm">
                  {#each taxi.contacts as contactLine}
                      <div class="flex justify-between items-center group/item hover:bg-white/5 p-1 rounded transition-colors -mx-1 px-1">
                        <span class="text-gray-400 font-medium">{contactLine}</span>
                        <a href="etrali:{cleanPhone(contactLine)}" class="text-yellow-400/80 hover:text-yellow-300 bg-yellow-500/10 p-1.5 rounded-lg border border-yellow-500/10 hover:border-yellow-500/30 transition-all">
                            <Phone class="w-3.5 h-3.5"/>
                        </a>
                      </div>
                  {/each}
                </div>

                {#if taxi.mail && taxi.mail.length > 0 && taxi.mail[0] !== 'nihil'}
                  <div class="mt-4 space-y-2 pt-3 border-t border-white/5">
                    {#each taxi.mail as email}
                      <a href="mailto:{email}" class="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-400 transition-colors group/mail">
                        <Mail class="w-3.5 h-3.5 flex-shrink-0 group-hover/mail:text-blue-400 transition-colors" />
                        <span class="truncate">{email}</span>
                      </a>
                    {/each}
                  </div>
                {/if}

                {#if taxi.adresse && taxi.adresse.length > 0 && taxi.adresse[0] !== 'nihil'}
                  <div class="mt-3 space-y-1">
                    {#each taxi.adresse as addr}
                      <div class="flex items-start gap-2 text-xs text-gray-500 bg-white/5 p-2 rounded border border-white/5">
                        <Home class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-gray-600" />
                        <span>{addr}</span>
                      </div>
                    {/each}
                  </div>
                {/if}

                {#if taxi.remarques && taxi.remarques.length > 0 && taxi.remarques[0] !== 'nihil'}
                  <div class="mt-3 space-y-1">
                    {#each taxi.remarques as rem}
                      <div class="flex items-start gap-2 text-xs bg-yellow-500/5 p-2 rounded text-yellow-200/70 border border-yellow-500/10">
                        <Info class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-yellow-500/50" />
                        <span>{rem}</span>
                      </div>
                    {/each}
                  </div>
                {/if}
                
                <div class="absolute top-4 right-14 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-black/60 backdrop-blur rounded-lg p-1 border border-white/10">
                    
                    {#if hasPermission(currentUser, ACTIONS.TAXI_WRITE)}
                        <button on:click={() => openModal(taxi)} class="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded transition-colors"><Pencil class="w-3.5 h-3.5" /></button>
                    {/if}

                    {#if hasPermission(currentUser, ACTIONS.TAXI_DELETE)}
                        <button on:click={() => deleteTaxi(taxi.id, taxi.societe)} class="p-1.5 text-red-400 hover:text-white hover:bg-red-500/20 rounded transition-colors"><Trash2 class="w-3.5 h-3.5" /></button>
                    {/if}

                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if showModal}
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
        <div 
            class="bg-[#0f1115] w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/10 ring-1 ring-white/5"
            transition:fly={{ y: 20, duration: 300 }}
        >
            <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/[0.02]">
                <h3 class="text-xl font-bold text-gray-200">
                    {isEditMode ? 'Modifier' : 'Ajouter'} une société
                </h3>
                <button on:click={() => showModal = false} class="text-gray-500 hover:text-gray-300 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <X class="w-5 h-5" />
                </button>
            </div>
            
            <div class="p-6 overflow-y-auto space-y-5 flex-grow custom-scrollbar">
                <div>
                    <label class={labelClass}>Nom société</label>
                    <input bind:value={modalForm.societe} placeholder="Nom société" class={inputClass}>
                </div>
                
                <div>
                    <label class={labelClass}>Lieux couverts (séparés par virgules)</label>
                    <input 
                        bind:value={modalForm.lieux} 
                        placeholder="Mons, La Louvière..." 
                        class={inputClass}
                    >
                </div>
                
                <div>
                    <label class={labelClass}>Contacts (Un par ligne)</label>
                    <textarea bind:value={modalForm.contacts} placeholder="Dispatche, 0477/..." rows="2" class="{inputClass} font-mono resize-none"></textarea>
                </div>

                <div>
                    <label class={labelClass}>E-mails (Un par ligne)</label>
                    <textarea bind:value={modalForm.mail} placeholder="contact@taxi.be" rows="2" class="{inputClass} font-mono resize-none"></textarea>
                </div>

                <div>
                    <label class={labelClass}>Adresses (Une par ligne)</label>
                    <textarea bind:value={modalForm.adresse} placeholder="Rue de la Gare 1, 7000 Mons" rows="2" class="{inputClass} resize-none"></textarea>
                </div>

                <div>
                    <label class={labelClass}>Remarques (Une par ligne)</label>
                    <textarea bind:value={modalForm.remarques} placeholder="Accepte les chèques..." rows="2" class="{inputClass} resize-none"></textarea>
                </div>
            </div>
            
            <div class="flex justify-end items-center px-6 py-4 bg-white/[0.02] border-t border-white/10 gap-3 relative">
                <div class="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none"></div>

                <button on:click={() => showModal = false} class="px-4 py-2 bg-white/5 border border-white/10 text-gray-300 rounded-xl hover:bg-white/10 hover:text-white transition-all">
                    Annuler
                </button>
                <button 
                  on:click={handleSubmit} 
                  disabled={modalLoading} 
                  class="btn-submit px-4 py-2 text-white rounded-xl flex items-center transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                  style="--primary-rgb: var(--color-primary);"
                >
                  {#if modalLoading}
                    <Loader2 class="w-4 h-4 animate-spin mr-2"/>
                  {/if}
                  Enregistrer
                </button>
            </div>
        </div>
      </div>
    {/if}
{/if} <style>
  .btn-themed {
    background-color: rgba(var(--primary-rgb), 0.2);
    border-color: rgba(var(--primary-rgb), 0.3);
    color: rgb(var(--primary-rgb));
  }

  .btn-themed:hover {
    background-color: rgba(var(--primary-rgb), 0.3);
    border-color: rgba(var(--primary-rgb), 0.5);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.2);
  }

  .btn-themed:active {
    transform: scale(0.95);
  }
  .btn-submit {
    background-color: rgba(var(--primary-rgb), 0.8);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
  }

  .btn-submit:hover:not(:disabled) {
    background-color: rgb(var(--primary-rgb));
    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.5);
    transform: translateY(-1px);
  }

  .btn-submit:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>