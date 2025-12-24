<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import EasyEditor from '$lib/components/EasyEditor.svelte';
  import { marked } from 'marked';
  import { fly, fade, slide } from 'svelte/transition';
  
  // Import des icônes
  import { Search, Plus, Pencil, Trash2, X, Book, FolderOpen, FileText, Loader2, History, RotateCcw } from 'lucide-svelte';

  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- VARIABLES DE VERSIONING ---
  let showHistoryModal = false;
  let procedureVersions = [];
  let isLoadingVersions = false;

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

  let showDocPicker = false;
  let bucketFiles = []; 
  let currentProcedureDocs = []; // Liste des noms de fichiers liés


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

  // 1. Charger l'historique d'une procédure
  async function loadHistory(procId) {
      if (!procId) return;
      isLoadingVersions = true;
      showHistoryModal = true;
      
      const { data, error } = await supabase
          .from('procedure_versions')
          .select('*, profiles(full_name)') // On récupère le nom de celui qui a archivé
          .eq('procedure_id', procId)
          .order('archived_at', { ascending: false });

      if (error) {
          toast.error("Erreur chargement historique");
      } else {
          procedureVersions = data;
      }
      isLoadingVersions = false;
  }

  // 2. Restaurer une version
  function restoreVersion(version) {
      if (!confirm(`Remplacer le contenu actuel par la version du ${new Date(version.archived_at).toLocaleDateString()} ?`)) return;
      
      // On met à jour l'objet d'édition avec les anciennes données
      editingProcedure.titre = version.titre;
      editingProcedure.categorie = version.categorie;
      editingProcedure.contenu = version.contenu;
      
      toast.success("Version restaurée ! Cliquez sur Enregistrer pour valider.");
      showHistoryModal = false; // On ferme le modal d'historique
  }

async function loadProcedures() {
    isLoading = true;
    
    // 1. Récupération des procédures (inchangé)
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

    const { data: procs, error } = await query;

    if (error) {
      console.error("Erreur: " + error.message);
      toast.error("Impossible de charger les procédures.");
    } else {
      
      // 2. --- AJOUT : Récupération des documents liés ---
      const procIds = procs.map(p => p.id);
      
      // On cherche toutes les liaisons pour les procédures chargées
      const { data: links, error: linkError } = await supabase
         .from('liaisons_contenu')
         .select('source_content_id, target_content_id')
         .eq('source_content_type', 'procedure')
         .eq('target_content_type', 'document')
         .in('source_content_id', procIds);

         // AFFICHEZ CECI DANS LA CONSOLE DU NAVIGATEUR (F12)
      console.log("Procédures IDs:", procIds);
      console.log("Liens trouvés:", links);
      console.log("Erreur éventuelle:", linkError);

      // On "colle" les documents dans chaque objet procédure
     procedures = procs.map(proc => {
          const docs = links 
            // CORRECTION ICI : On convertit tout en String pour comparer "10" avec "10"
            ? links.filter(l => String(l.source_content_id) === String(proc.id)).map(l => l.target_content_id)
            : [];
          return { ...proc, attached_docs: docs };
      });
      // --------------------------------------------------
    }
    isLoading = false;
  }

async function saveProcedure() {
    isSaving = true;
    const { data: { user } } = await supabase.auth.getUser();
    
    // --- CORRECTION : DÉFINITION DE PAYLOAD ---
    const payload = {
        titre: editingProcedure.titre,
        categorie: editingProcedure.categorie,
        contenu: editingProcedure.contenu,
        updated_at: new Date()
    };
    // ------------------------------------------

    let savedId = editingProcedure.id; // Par défaut, l'id existant
    let error;

   if (editingProcedure.id) {
        // --- ÉTAPE 1 : ARCHIVAGE (VERSIONING) ---
        // On récupère la version ACTUELLE en base avant de l'écraser
        const { data: currentData } = await supabase
            .from('procedures')
            .select('*')
            .eq('id', editingProcedure.id)
            .single();

        if (currentData) {
            // On sauvegarde cette version dans l'historique
            await supabase.from('procedure_versions').insert({
                procedure_id: currentData.id,
                titre: currentData.titre,
                categorie: currentData.categorie,
                contenu: currentData.contenu,
                modified_by: user.id, // L'utilisateur qui déclenche la nouvelle sauvegarde
                archived_at: new Date()
            });
        }

        // --- ÉTAPE 2 : MISE À JOUR ---
        const res = await supabase.from('procedures').update(payload).eq('id', editingProcedure.id);
        error = res.error;
    } else {
  
        // INSERT : On utilise .select() pour récupérer l'ID généré
        const res = await supabase.from('procedures').insert([payload]).select();
        error = res.error;
        if (res.data && res.data[0]) {
            savedId = res.data[0].id; // On récupère le nouvel ID
        }
    }

    if (!error && savedId) {
        // --- SAUVEGARDE DES LIENS ---
        // On attend que les liens soient sauvés avant de fermer
        await saveLinks(savedId, user?.id);
        // ----------------------------
        
        toast.success(editingProcedure.id ? "Procédure modifiée !" : "Procédure créée !");
        closeModal();
        loadProcedures();
        loadCategories();
    } else {
        toast.error("Erreur : " + (error?.message || "Inconnue"));
    }
    isSaving = false;
  }

// 1. Charger les fichiers du bucket (inchangé)
  async function loadBucketFiles() {
      const { data, error } = await supabase
        .storage
        .from('documents')
        .list('', { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
      
      if (!error) {
          bucketFiles = data;
          showDocPicker = true;
      }
  }

  // 2. Charger les liaisons existantes pour une procédure
  async function loadLinkedDocs(procedureId) {
      if (!procedureId) {
          currentProcedureDocs = [];
          return;
      }

      const { data, error } = await supabase
          .from('liaisons_contenu')
          .select('target_content_id')
          .eq('source_content_type', 'procedure')
          .eq('source_content_id', procedureId)
          .eq('target_content_type', 'document');

      if (!error && data) {
          // On récupère juste les noms de fichiers
          currentProcedureDocs = data.map(l => l.target_content_id);
      }
  }

  // 3. Sauvegarder les liaisons (à appeler après la sauvegarde de la procédure)
  async function saveLinks(procedureId, userId) {
      // A. On nettoie les anciennes liaisons "documents" de cette procédure
      await supabase
          .from('liaisons_contenu')
          .delete()
          .eq('source_content_type', 'procedure')
          .eq('source_content_id', procedureId)
          .eq('target_content_type', 'document');

      // B. On insère les nouvelles
      if (currentProcedureDocs.length > 0) {
          const linksToInsert = currentProcedureDocs.map(docName => ({
              source_content_type: 'procedure',
              source_content_id: procedureId, // UUID de la procédure
              target_content_type: 'document',
              target_content_id: docName,     // Nom du fichier
              created_by: userId
          }));

          await supabase.from('liaisons_contenu').insert(linksToInsert);
      }
  }

  // 4. Basculer la sélection (pour le modal)
  function toggleFileSelection(fileName) {
      if (currentProcedureDocs.includes(fileName)) {
          currentProcedureDocs = currentProcedureDocs.filter(f => f !== fileName);
      } else {
          currentProcedureDocs = [...currentProcedureDocs, fileName];
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
        // CHARGEMENT DES LIENS
        loadLinkedDocs(proc.id); 
    } else {
        editingProcedure = { id: null, titre: "", categorie: "", contenu: "" };
        currentProcedureDocs = []; // Reset pour nouvelle procédure
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
    
    <button 
  on:click={() => openModal()} 
  class="btn-themed px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group border"
  style="--primary-rgb: var(--color-primary);"
>
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

              {#if proc.attached_docs && proc.attached_docs.length > 0}
                <div class="px-6 pb-4 flex flex-wrap gap-2">
                    {#each proc.attached_docs as doc}
                        <a 
                            href={supabase.storage.from('documents').getPublicUrl(doc).data.publicUrl} 
                            target="_blank"
                            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-300 text-xs font-medium border border-blue-500/20 hover:bg-blue-500/20 transition-colors z-10 relative"
                            on:click|stopPropagation
                        >
                            <FileText class="w-3.5 h-3.5" />
                            {doc}
                        </a>
                    {/each}
                </div>
              {/if}

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
        {#if editingProcedure.id}
                <button 
                    on:click={() => loadHistory(editingProcedure.id)}
                    class="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 px-3 py-1.5 rounded-lg flex items-center gap-2 transition-colors"
                >
                    <History class="w-3.5 h-3.5" /> Historique
                </button>
            {/if}
        <button on:click={closeModal} class="text-gray-400 hover:text-white transition-colors">
          <X class="w-6 h-6" />
        </button>
      </div>
      
      <div class="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-grow">
        
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

        <div class="pt-4 border-t border-white/5">
            <label class="block text-sm font-medium text-gray-400 mb-3">Documents liés</label>
            
            <div class="flex flex-wrap gap-2 mb-3">
                {#each currentProcedureDocs as docName}
                    <span class="bg-blue-500/10 text-blue-300 border border-blue-500/20 px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 group hover:border-red-500/30 hover:bg-red-500/10 transition-colors">
                        <FileText class="w-3.5 h-3.5 text-blue-400 group-hover:text-red-400 transition-colors"/> 
                        <span class="truncate max-w-[200px]">{docName}</span>
                        <button 
                            type="button" 
                            on:click={() => toggleFileSelection(docName)} 
                            class="ml-1 text-blue-400 group-hover:text-red-400 focus:outline-none"
                            title="Retirer"
                        >
                            <X class="w-3.5 h-3.5" />
                        </button>
                    </span>
                {/each}
            </div>

            <button 
                type="button"
                on:click={loadBucketFiles} 
                class="text-sm bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 text-gray-300 hover:text-white group"
            >
                <FolderOpen class="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" /> 
                Sélectionner depuis le stock
            </button>
        </div>

      </div>
      
      <div class="flex justify-end items-center p-5 border-t border-white/10 bg-white/5 gap-3">
        <button on:click={closeModal} class="px-4 py-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
          Annuler
        </button>
       <button 
  on:click={saveProcedure}
  disabled={isSaving}
  class="btn-save px-5 py-2 text-white rounded-xl font-medium transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
  style="--primary-rgb: var(--color-primary);"
>
  {#if isSaving}
    <Loader2 class="w-4 h-4 animate-spin"/>
  {/if}
  {isSaving ? 'Enregistrement...' : 'Enregistrer'}
</button>
      </div>

    </div>
  </div>
{/if}

{#if showDocPicker}
    <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" transition:fade>
        <div class="bg-[#1a1d24] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh]">
            
            <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 class="font-bold text-white">Documents disponibles</h3>
                <button on:click={() => showDocPicker = false} class="text-gray-400 hover:text-white">
                    <X class="w-5 h-5"/>
                </button>
            </div>

            <div class="overflow-y-auto p-2 space-y-1 flex-1 custom-scrollbar">
                {#if bucketFiles.length === 0}
                    <div class="text-center py-8 text-gray-500">
                        <p>Aucun fichier trouvé dans le dossier "documents".</p>
                    </div>
                {:else}
                    {#each bucketFiles as file}
                        <button 
                            class="w-full text-left px-4 py-3 rounded-xl flex items-center justify-between transition-colors
                            {currentProcedureDocs.includes(file.name) ? 'bg-blue-600/20 border border-blue-500/50' : 'hover:bg-white/5 border border-transparent'}"
                            on:click={() => toggleFileSelection(file.name)}
                        >
                            <div class="flex items-center gap-3 overflow-hidden">
                                <FileText class="w-5 h-5 text-gray-400"/>
                                <span class="truncate text-gray-200 text-sm">{file.name}</span>
                            </div>
                            {#if currentProcedureDocs.includes(file.name)}
                                <div class="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_5px_currentColor]"></div>
                            {/if}
                        </button>
                    {/each}
                {/if}
            </div>

            <div class="p-4 border-t border-white/10 bg-white/5 text-right">
                <button on:click={() => showDocPicker = false} class="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">
                    Terminer
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showHistoryModal}
    <div class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md" transition:fade>
        <div class="bg-[#1a1d24] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">
            
            <div class="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                <h3 class="font-bold text-white flex items-center gap-2">
                    <History class="w-5 h-5 text-purple-400"/> Historique des versions
                </h3>
                <button on:click={() => showHistoryModal = false} class="text-gray-400 hover:text-white"><X class="w-5 h-5"/></button>
            </div>

            <div class="overflow-y-auto p-4 space-y-3 flex-1 custom-scrollbar">
                {#if isLoadingVersions}
                    <div class="text-center py-8 text-gray-500"><Loader2 class="w-6 h-6 animate-spin mx-auto"/> Chargement...</div>
                {:else if procedureVersions.length === 0}
                    <div class="text-center py-8 text-gray-500">Aucune ancienne version disponible.</div>
                {:else}
                    {#each procedureVersions as version}
                        <div class="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:border-white/10 transition-colors">
                            <div>
                                <div class="text-white font-medium">
                                    {new Date(version.archived_at).toLocaleString('fr-FR')}
                                </div>
                                <div class="text-xs text-gray-400 mt-1">
                                    Par: <span class="text-gray-300">{version.profiles?.full_name || 'Utilisateur inconnu'}</span>
                                </div>
                                <div class="text-xs text-gray-500 mt-0.5">
                                    Titre: {version.titre}
                                </div>
                            </div>
                            
                            <button 
                                on:click={() => restoreVersion(version)}
                                class="flex items-center gap-2 px-3 py-2 bg-purple-600/20 text-purple-300 hover:bg-purple-600 hover:text-white border border-purple-500/30 rounded-lg text-xs font-bold transition-all"
                            >
                                <RotateCcw class="w-3.5 h-3.5" /> Restaurer
                            </button>
                        </div>
                    {/each}
                {/if}
            </div>

            <div class="p-4 border-t border-white/10 bg-white/5 text-right text-xs text-gray-500">
                La restauration remplace le contenu de l'éditeur (sans sauvegarder immédiatement).
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

  .btn-themed {
    /* Utilise le panneau de verre (glass-panel) avec la teinte du thème */
    background-color: rgba(var(--primary-rgb), 0.1);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-color: rgba(var(--primary-rgb), 0.2);
    color: white;
  }

  .btn-themed:hover {
    /* Accentuation de la couleur et lueur au survol */
    background-color: rgba(var(--primary-rgb), 0.2);
    border-color: rgba(var(--primary-rgb), 0.4);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.4);
  }

  .btn-themed:active {
    transform: scale(0.95);
  }
  .btn-save {
    /* Utilisation de l'opacité 0.8 pour l'action principale */
    background-color: rgba(var(--primary-rgb), 0.8);
    /* Lueur basée sur la couleur du thème (ex: Bleu pour Deep Space, Vert pour Forest) */
    box-shadow: 0 10px 15px -3px rgba(var(--primary-rgb), 0.2);
  }

  .btn-save:hover:not(:disabled) {
    /* Passage à l'opacité pleine au survol */
    background-color: rgb(var(--primary-rgb));
    transform: translateY(-1px);
    box-shadow: 0 20px 25px -5px rgba(var(--primary-rgb), 0.3);
  }

  .btn-save:active:not(:disabled) {
    transform: scale(0.98);
  }
</style>