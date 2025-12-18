<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import EasyEditor from '$lib/components/EasyEditor.svelte';
  import { marked } from 'marked';
  import { fly, fade, slide } from 'svelte/transition';
  
  // Import des icônes
  import { Search, Plus, Pencil, Trash2, X, Book, FolderOpen, FileText, Loader2 } from 'lucide-svelte';

  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTAT ---
  let procedures = [];
  let categories = [];
  let isLoading = true;
  
  // Filtres
  let searchQuery = "";
  let selectedCategory = "all";

  // Modal
  let isModalOpen = false;
  let isSaving = false;

  // Objet Procédure en cours d'édition
  let editingProcedure = {
    id: null,
    titre: "",
    categorie: "",
    contenu: ""
  };

  onMount(async () => {
    await Promise.all([loadCategories(), loadProcedures()]);
  });

  // --- CHARGEMENT DES DONNÉES ---
  async function loadCategories() {
    const { data, error } = await supabase.from('procedures').select('categorie');
    if (!error && data) {
      categories = [...new Set(data.map(p => p.categorie))].sort();
    }
  }

  async function loadProcedures() {
    isLoading = true;
    let query = supabase
      .from('procedures')
      .select(`*, profiles ( full_name )`)
      .order('titre', { ascending: true });
      
    if (selectedCategory !== 'all') {
      query = query.eq('categorie', selectedCategory);
    }

    if (searchQuery.trim()) {
      query = query.or(`titre.ilike.%${searchQuery}%,contenu.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Erreur: " + error.message);
      toast.error("Impossible de charger les procédures.");
    } else {
      procedures = data;
    }
    isLoading = false;
  }

  // --- ACTIONS (CRUD) ---
  async function saveProcedure() {
    isSaving = true;
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
        titre: editingProcedure.titre,
        categorie: editingProcedure.categorie,
        contenu: editingProcedure.contenu,
        updated_at: new Date()
    };
    
    let error;
    if (editingProcedure.id) {
        const res = await supabase.from('procedures').update(payload).eq('id', editingProcedure.id);
        error = res.error;
    } else {
        const res = await supabase.from('procedures').insert([payload]);
        error = res.error;
    }

    isSaving = false;
    if (error) {
        toast.error("Erreur lors de la sauvegarde : " + error.message);
    } else {
        toast.success(editingProcedure.id ? "Procédure modifiée avec succès !" : "Nouvelle procédure créée !");
        closeModal();
        loadProcedures();
        loadCategories();
    }
  }

  async function deleteProcedure(id, titre) {
    if (!confirm(`Supprimer la procédure "${titre}" ?`)) return;
    
    const { error } = await supabase.from('procedures').delete().eq('id', id);
    if (!error) {
        toast.success("Procédure supprimée.");
        loadProcedures();
    } else {
        toast.error("Erreur lors de la suppression : " + error.message);
    }
  }

  // --- MODAL ---
  function openModal(proc = null) {
    if (proc) {
        editingProcedure = { ...proc };
    } else {
        editingProcedure = { id: null, titre: "", categorie: "", contenu: "" };
    }
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/10 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-500/30">
            <Book class="w-8 h-8" />
        </div>
        <h1 class="text-3xl font-bold text-white tracking-tight">Base de Connaissances</h1>
      </div>
      <p class="text-gray-400 pl-1">Procédures, fiches réflexes et documentation opérationnelle.</p>
    </div>
    
    <button on:click={() => openModal()} class="glass-panel hover:bg-blue-500/20 text-white px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] border-blue-500/30 group">
        <Plus class="w-5 h-5 group-hover:rotate-90 transition-transform" />
        <span class="font-semibold">Nouvelle Procédure</span>
    </button>
  </header>

  <div class="flex flex-col lg:flex-row gap-8">
    
    <aside class="w-full lg:w-1/4 space-y-6" in:fly={{ x: -20, duration: 600, delay: 200 }}>
      
      <div class="relative group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search class="w-5 h-5 text-gray-400 group-focus-within:text-blue-400 transition-colors" />
        </div>
        <input 
          type="search" 
          bind:value={searchQuery} 
          on:input={loadProcedures} 
          placeholder="Rechercher..." 
          class="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all shadow-inner"
        />
      </div>
      
      <div class="glass-panel rounded-2xl p-4 space-y-2">
        <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FolderOpen class="w-4 h-4" /> Catégories
        </h3>
        
        <button 
          on:click={() => { selectedCategory = 'all'; loadProcedures(); }}
          class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-between
          {selectedCategory === 'all' 
            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
            : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
        >
          <span>Tout voir</span>
          {#if selectedCategory === 'all'}<div class="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_5px_currentColor]"></div>{/if}
        </button>

        {#each categories as cat}
          <button 
            on:click={() => { selectedCategory = cat; loadProcedures(); }}
            class="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-between
            {selectedCategory === cat 
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)]' 
              : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
          >
            <span class="truncate">{cat}</span>
             {#if selectedCategory === cat}<div class="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_5px_currentColor]"></div>{/if}
          </button>
        {/each}
      </div>
    </aside>

    <main class="flex-1 space-y-6">
      {#if isLoading}
        <div class="flex flex-col items-center justify-center py-20 text-gray-400 animate-pulse">
          <Loader2 class="w-10 h-10 animate-spin mb-4 text-blue-500" />
          <p>Chargement des connaissances...</p>
        </div>
      {:else if procedures.length === 0}
        <div class="glass-panel rounded-2xl p-10 text-center border-dashed border-white/20" in:fade>
          <FileText class="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <p class="text-gray-400 text-lg">Aucune procédure ne correspond à votre recherche.</p>
          <button on:click={() => {searchQuery=''; selectedCategory='all'; loadProcedures();}} class="mt-4 text-blue-400 hover:text-blue-300 underline">Réinitialiser les filtres</button>
        </div>
      {:else}
        <div class="grid grid-cols-1 gap-6">
          {#each procedures as proc (proc.id)}
            <div class="glass-panel rounded-2xl overflow-hidden group hover:border-blue-500/30 transition-all duration-300" in:fly={{ y: 20, duration: 400 }}>
              
              <div class="px-6 py-4 border-b border-white/5 bg-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 class="text-xl font-bold text-white group-hover:text-blue-300 transition-colors flex items-center gap-2">
                    {proc.titre}
                  </h2>
                  <span class="inline-flex items-center rounded-lg bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-300 border border-blue-500/20 mt-2">
                    {proc.categorie}
                  </span>
                </div>

                <div class="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button 
                    on:click={() => openModal(proc)}
                    class="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Modifier"
                  >
                    <Pencil class="w-4 h-4" />
                  </button>
                  <button 
                    on:click={() => deleteProcedure(proc.id, proc.titre)}
                    class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div class="p-6">
                <div class="prose prose-invert max-w-none prose-p:text-gray-300 prose-headings:text-white prose-a:text-blue-400 prose-strong:text-white">
                  {@html marked(proc.contenu || '')}
                </div>
              </div>

              <div class="px-6 py-3 bg-black/20 text-right text-xs text-gray-500 border-t border-white/5 font-mono">
                Dernière màj : {new Date(proc.updated_at || Date.now()).toLocaleDateString('fr-FR')}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </main>
    
  </div>
</div>

{#if isModalOpen}
  <div class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" transition:fade>
    <div 
        class="bg-gray-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] ring-1 ring-white/10"
        on:click|stopPropagation
        transition:fly={{ y: 20, duration: 300 }}
    >
      
      <div class="flex justify-between items-center p-5 border-b border-white/10 bg-white/5">
        <h3 class="text-xl font-bold text-white flex items-center gap-2">
            {#if editingProcedure.id}<Pencil class="w-5 h-5 text-blue-400"/>{:else}<Plus class="w-5 h-5 text-green-400"/>{/if}
            {editingProcedure.id ? 'Modifier' : 'Nouvelle'} Procédure
        </h3>
        <button on:click={closeModal} class="text-gray-400 hover:text-white transition-colors">
          <X class="w-6 h-6" />
        </button>
      </div>
      
      <div class="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-grow">
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label for="modal-titre" class="block text-sm font-medium text-gray-400 mb-1">Titre</label>
            <input 
              type="text" 
              id="modal-titre" 
              bind:value={editingProcedure.titre} 
              required 
              class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none transition-all"
              placeholder="Ex: Procédure d'urgence..." 
            />
          </div>
          
          <div>
            <label for="modal-categorie" class="block text-sm font-medium text-gray-400 mb-1">Catégorie</label>
            <input 
              type="text" 
              id="modal-categorie" 
              list="cats"
              bind:value={editingProcedure.categorie} 
              required 
              class="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-transparent outline-none transition-all"
              placeholder="Ex: Sécurité..." 
            />
            <datalist id="cats">
              {#each categories as c} <option value={c} /> {/each}
            </datalist>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">Contenu (Markdown)</label>
          <div class="border border-white/10 rounded-xl overflow-hidden bg-black/20 min-h-[300px]">
             <EasyEditor bind:value={editingProcedure.contenu} />
          </div>
        </div>
      </div>
      
      <div class="flex justify-end items-center p-5 border-t border-white/10 bg-white/5 gap-3">
        <button on:click={closeModal} class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
          Annuler
        </button>
        <button 
          on:click={saveProcedure}
          disabled={isSaving}
          class="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isSaving}<Loader2 class="w-4 h-4 animate-spin"/>{/if}
          {isSaving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

    </div>
  </div>
{/if}

<style>
  /* 1. La zone de texte principale (CodeMirror) */
  :global(.EasyMDEContainer .CodeMirror) {
    background-color: rgba(0, 0, 0, 0.3) !important; /* Fond sombre translucide */
    color: #e2e8f0 !important; /* Texte gris clair (gray-200) */
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-top: none !important;
    border-radius: 0 0 0.75rem 0.75rem !important; /* Arrondi en bas */
    text-shadow: none !important;
  }

  /* 2. La barre d'outils (Toolbar) */
  :global(.EasyMDEContainer .editor-toolbar) {
    background-color: rgba(255, 255, 255, 0.05) !important; /* Légèrement plus clair */
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    border-radius: 0.75rem 0.75rem 0 0 !important; /* Arrondi en haut */
    opacity: 1 !important;
  }

  /* 3. Les boutons de la barre d'outils */
  :global(.EasyMDEContainer .editor-toolbar button) {
    color: #94a3b8 !important; /* Icônes gris (gray-400) */
    border: none !important;
    transition: all 0.2s;
  }
  :global(.EasyMDEContainer .editor-toolbar button:hover),
  :global(.EasyMDEContainer .editor-toolbar button.active) {
    background-color: rgba(255, 255, 255, 0.1) !important;
    color: #fff !important;
    border: none !important;
  }

  /* 4. Le curseur et autres détails */
  :global(.EasyMDEContainer .CodeMirror-cursor) {
    border-left: 1px solid #fff !important; /* Curseur blanc */
  }
  :global(.EasyMDEContainer .CodeMirror-scroll) {
    min-height: 300px;
  }
  :global(.EasyMDEContainer .editor-statusbar) {
    display: none !important; /* On cache la barre de statut souvent moche */
  }
  
  /* 5. La prévisualisation (Preview) */
  :global(.EasyMDEContainer .editor-preview) {
    background-color: #0f1115 !important; /* Fond très sombre opaque pour la lecture */
    color: #e2e8f0 !important;
  }
</style>