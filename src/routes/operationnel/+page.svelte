<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import EasyEditor from '$lib/components/EasyEditor.svelte';
  import { marked } from 'marked';
  // Import des icônes Lucide pour l'interface
  import { Search, Plus, Pencil, Trash2, X } from 'lucide-svelte';

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
    contenu: "" // C'est ici que le Markdown sera stocké
  };

  onMount(async () => {
    await Promise.all([loadCategories(), loadProcedures()]);
  });

  // --- CHARGEMENT DES DONNÉES ---

  async function loadCategories() {
    const { data, error } = await supabase
      .from('procedures')
      .select('categorie');
    if (!error && data) {
      // Dédoublonner et trier
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
      // Recherche textuelle (titre ou contenu)
      query = query.or(`titre.ilike.%${searchQuery}%,contenu.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Erreur: " + error.message);
      alert("Erreur: " + error.message);
    } else {
      procedures = data;
    }
    isLoading = false;
  }

  // --- ACTIONS (CRUD) ---

  async function saveProcedure() {
    isSaving = true;
    // On récupère l'user actuel (optionnel selon votre table)
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
        titre: editingProcedure.titre,
        categorie: editingProcedure.categorie,
        contenu: editingProcedure.contenu,
        // user_id: user?.id, // Décommentez si besoin
        updated_at: new Date()
    };
    
    let error;
    if (editingProcedure.id) {
        // UPDATE
        const res = await supabase
            .from('procedures')
            .update(payload)
            .eq('id', editingProcedure.id);
        error = res.error;
    } else {
        // INSERT
        const res = await supabase
            .from('procedures')
            .insert([payload]);
        error = res.error;
    }

    isSaving = false;
    if (error) {
        alert("Erreur lors de la sauvegarde : " + error.message);
    } else {
        closeModal();
        loadProcedures();
        loadCategories();
        // Rafraîchir au cas où une nouvelle cat est créée
    }
  }

  async function deleteProcedure(id, titre) {
    if (!confirm(`Supprimer la procédure "${titre}" ?`)) return;

    const { error } = await supabase
        .from('procedures')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Erreur : " + error.message);
    } else {
        loadProcedures();
    }
  }

  // --- MODAL ---

  function openModal(proc = null) {
    if (proc) {
        editingProcedure = { ...proc };
        // Copie pour éviter la modif en direct
    } else {
        editingProcedure = { id: null, titre: "", categorie: "", contenu: "" };
    }
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>


<div class="min-h-full">
  
  <header class="bg-white shadow-sm border-b border-gray-200">
    <div class="container mx-auto p-6 md:flex md:justify-between md:items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-800">Base de Connaissances</h1>
        <p class="mt-1 text-sm text-gray-500">Procédures, fiches réflexes et informations opérationnelles.</p>
      </div>
      <div class="mt-4 md:mt-0">
        <button on:click={() => openModal()} class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors">
          <Plus class="w-5 h-5" />
          <span>Ajouter une procédure</span>
        </button>
      </div>
    </div>
  </header>

  <div class="container mx-auto p-8">
    <div class="flex flex-col md:flex-row gap-8">
      
      <aside class="w-full md:w-1/4 sticky top-4">
        <div class="mb-6">
          <label for="search-bar" class="block text-sm font-medium text-gray-700 mb-1">Rechercher</label>
          <div class="relative">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search class="w-5 h-5 text-gray-400" />
            </div>
            <input 
              type="search" 
              id="search-bar" 
              bind:value={searchQuery} 
              on:input={loadProcedures} 
              placeholder="Incident, gare, L96..." 
              class="block w-full rounded-md border-gray-300 pl-10 pr-4 py-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <h3 class="text-lg font-semibold text-gray-800 mb-3">Catégories</h3>
        <div class="space-y-1 text-sm font-medium">
          <button 
            on:click={() => { selectedCategory = 'all'; loadProcedures(); }}
            class="block w-full text-left px-3 py-2 rounded-lg transition-colors 
            {selectedCategory === 'all' ? 'bg-blue-500 text-white hover:bg-blue-600' : 'text-gray-700 hover:bg-gray-100'}"
          >
            Tout voir
          </button>
          {#each categories as cat}
            <button 
              on:click={() => { selectedCategory = cat; loadProcedures(); }}
              class="block w-full text-left px-3 py-2 rounded-lg transition-colors 
              {selectedCategory === cat ? 'bg-blue-500 text-white hover:bg-blue-600' : 'text-gray-700 hover:bg-gray-100'}"
            >
              {cat}
            </button>
          {/each}
        </div>
      </aside>

      <main class="flex-1 space-y-6">
        {#if isLoading}
          <div class="text-center p-10 text-gray-500">
            <svg class="animate-spin h-5 w-5 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="mt-2">Chargement...</p>
          </div>
        {:else if procedures.length === 0}
          <div class="bg-white p-6 text-center text-gray-500 rounded-lg shadow">
            <p>Aucune procédure trouvée correspondant aux filtres.</p>
          </div>
        {:else}
          {#each procedures as proc}
            <div class="bg-white rounded-lg shadow-xl overflow-hidden border border-gray-200">
              <div class="px-6 py-4 bg-gray-50 flex justify-between items-center border-b border-gray-100">
                <div>
                  <h2 class="text-xl font-semibold text-gray-800">{proc.titre}</h2>
                  <span class="inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-800 mt-1">
                    {proc.categorie}
                  </span>
                </div>
                <div class="flex space-x-2">
                  <button 
                    on:click={() => openModal(proc)}
                    class="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                    title="Modifier"
                  >
                    <Pencil class="w-5 h-5" />
                  </button>
                  <button 
                    on:click={() => deleteProcedure(proc.id, proc.titre)}
                    class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 class="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div class="p-6">
                <div class="prose max-w-none prose-blue overflow-hidden max-h-48 relative">
                  {@html marked(proc.contenu || '')}
                  <div class="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                </div>
              </div>

              <div class="px-6 py-3 bg-gray-50 text-right text-xs text-gray-500 border-t border-gray-100">
                Modifié le {new Date(proc.updated_at || Date.now()).toLocaleDateString('fr-FR')}
              </div>
            </div>
          {/each}
        {/if}
      </main>
      
    </div>
  </div>

  {#if isModalOpen}
    <div class="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center p-4 transition-all duration-300 ease-out z-[1000]" on:click|self={closeModal}>
      <div class="bg-white rounded-lg shadow-2xl w-full max-w-3xl scale-100 transition-all duration-300 ease-out flex flex-col max-h-[90vh]">
        
        <div class="flex justify-between items-center p-4 border-b">
          <h3 class="text-xl font-semibold text-gray-800">
            {editingProcedure.id ? 'Modifier' : 'Ajouter'} une procédure
          </h3>
          <button type="button" on:click={closeModal} class="p-1 rounded-full text-gray-500 hover:bg-gray-200">
            <X class="w-5 h-5" />
          </button>
        </div>
        
        <div class="p-6 space-y-4 overflow-y-auto flex-grow">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="modal-titre" class="block text-sm font-medium text-gray-700">Titre</label>
              <input 
                type="text" 
                id="modal-titre" 
                bind:value={editingProcedure.titre} 
                required 
                placeholder="Ex: Prise en charge PMR" 
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div>
              <label for="modal-categorie" class="block text-sm font-medium text-gray-700">Catégorie</label>
              <input 
                type="text" 
                id="modal-categorie" 
                list="cats"
                bind:value={editingProcedure.categorie} 
                required 
                placeholder="Ex: Sécurité" 
                class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
              <datalist id="cats">
                {#each categories as c} <option value={c} /> {/each}
              </datalist>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contenu (Markdown)</label>
            <EasyEditor bind:value={editingProcedure.contenu} />
          </div>

          <div>
            <div class="flex justify-between items-center mb-2">
              <label class="block text-sm font-medium text-gray-700">Contenus Liés (Optionnel)</label>
              <button type="button" class="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-200">
                <Plus class="w-4 h-4" />
                Ajouter un lien
              </button>
            </div>
            <div class="space-y-2">
              <p class="text-sm text-gray-400 text-center p-2 border border-dashed rounded-md">Aucun lien.</p>
            </div>
          </div>
        </div>
        
        <div class="flex justify-end items-center p-4 bg-gray-50 border-t rounded-b-lg">
          <button type="button" on:click={closeModal} class="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none">
            Annuler
          </button>
          <button 
            type="submit" 
            on:click={saveProcedure}
            disabled={isSaving}
            class="ml-3 px-4 py-2 bg-blue-600 text-white border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {#if isSaving}
              Enregistrement...
            {:else}
              Enregistrer
            {/if}
          </button>
        </div>
      </div>
    </div>
  {/if}

</div>