<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase'; // Votre config Supabase
  import EasyEditor from '$lib/components/EasyEditor.svelte';
  import { marked } from 'marked'; // Pour convertir le Markdown en HTML pour l'affichage

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
        loadCategories(); // Rafraîchir au cas où une nouvelle cat est créée
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
        editingProcedure = { ...proc }; // Copie pour éviter la modif en direct
    } else {
        editingProcedure = { id: null, titre: "", categorie: "", contenu: "" };
    }
    isModalOpen = true;
  }

  function closeModal() {
    isModalOpen = false;
  }
</script>

<div class="page-container">
  
  <header class="header">
    <div>
      <h1>Base de Connaissances</h1>
      <p class="subtitle">Procédures opérationnelles et fiches réflexes</p>
    </div>
    <button class="btn-primary" on:click={() => openModal()}>
      + Nouvelle procédure
    </button>
  </header>

  <div class="layout">
    
    <aside class="sidebar">
      <div class="search-box">
        <input 
          type="text" 
          placeholder="Rechercher..." 
          bind:value={searchQuery} 
          on:input={loadProcedures} 
        />
      </div>

      <div class="cat-list">
        <h3>Catégories</h3>
        <button 
          class:active={selectedCategory === 'all'} 
          on:click={() => { selectedCategory = 'all'; loadProcedures(); }}
        >
          Tout voir
        </button>
        {#each categories as cat}
          <button 
            class:active={selectedCategory === cat} 
            on:click={() => { selectedCategory = cat; loadProcedures(); }}
          >
            {cat}
          </button>
        {/each}
      </div>
    </aside>

    <main class="content">
      {#if isLoading}
        <div class="loading">Chargement...</div>
      {:else if procedures.length === 0}
        <div class="empty">Aucune procédure trouvée.</div>
      {:else}
        <div class="grid">
          {#each procedures as proc}
            <div class="card">
              <div class="card-header">
                <div>
                  <h3>{proc.titre}</h3>
                  <span class="badge">{proc.categorie}</span>
                </div>
                <div class="actions">
                  <button class="icon-btn" on:click={() => openModal(proc)}>✏️</button>
                  <button class="icon-btn delete" on:click={() => deleteProcedure(proc.id, proc.titre)}>🗑️</button>
                </div>
              </div>
              
              <div class="card-body markdown-preview">
                {@html marked(proc.contenu || '')}
              </div>

              <div class="card-footer">
                Modifié le {new Date(proc.updated_at || Date.now()).toLocaleDateString()}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </main>
  </div>

  {#if isModalOpen}
    <div class="modal-backdrop" on:click|self={closeModal}>
      <div class="modal">
        <div class="modal-header">
          <h2>{editingProcedure.id ? 'Modifier' : 'Ajouter'} une procédure</h2>
          <button class="close-btn" on:click={closeModal}>&times;</button>
        </div>
        
        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label>Titre</label>
              <input type="text" bind:value={editingProcedure.titre} placeholder="Ex: Prise en charge PMR" />
            </div>
            <div class="form-group">
              <label>Catégorie</label>
              <input type="text" list="cats" bind:value={editingProcedure.categorie} placeholder="Ex: Sécurité" />
              <datalist id="cats">
                {#each categories as c} <option value={c} /> {/each}
              </datalist>
            </div>
          </div>

          <div class="form-group">
            <label>Contenu</label>
            <EasyEditor bind:value={editingProcedure.contenu} />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" on:click={closeModal}>Annuler</button>
          <button class="btn-primary" on:click={saveProcedure} disabled={isSaving}>
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  {/if}

</div>

<style>
  /* -- Layout -- */
  .page-container { max-width: 1200px; margin: 0 auto; padding: 20px; font-family: sans-serif; color: #333; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
  .layout { display: flex; gap: 30px; }
  .sidebar { width: 250px; flex-shrink: 0; }
  .content { flex-grow: 1; }
  
  /* -- Sidebar -- */
  .search-box input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 20px; }
  .cat-list button { display: block; width: 100%; text-align: left; padding: 8px 10px; background: none; border: none; cursor: pointer; border-radius: 4px; margin-bottom: 2px; }
  .cat-list button:hover { background: #f5f5f5; }
  .cat-list button.active { background: #e6f7ff; color: #0077cc; font-weight: bold; }

  /* -- Cards -- */
  .card { background: white; border: 1px solid #e0e0e0; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow: hidden; }
  .card-header { padding: 15px; background: #f9f9f9; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
  .card-header h3 { margin: 0 0 5px 0; font-size: 1.1rem; }
  .badge { font-size: 0.75rem; background: #ddd; padding: 2px 6px; border-radius: 4px; color: #555; }
  
  /* Style du Markdown rendu dans la carte */
  .markdown-preview { padding: 20px; max-height: 200px; overflow: hidden; position: relative; font-size: 0.95rem; line-height: 1.5; }
  .markdown-preview::after { content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 50px; background: linear-gradient(transparent, white); }
  
  /* Ces styles affectent le HTML généré par marked() */
  .markdown-preview :global(h1), .markdown-preview :global(h2), .markdown-preview :global(h3) { font-size: 1rem; margin: 10px 0 5px; font-weight: bold; }
  .markdown-preview :global(ul) { padding-left: 20px; list-style: disc; }
  
  .card-footer { padding: 10px 15px; font-size: 0.8rem; color: #999; border-top: 1px solid #eee; background: #fff; }

  /* -- Boutons -- */
  .btn-primary { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
  .btn-primary:hover { background: #0056b3; }
  .btn-secondary { background: white; border: 1px solid #ccc; padding: 10px 20px; border-radius: 5px; cursor: pointer; margin-right: 10px; }
  .icon-btn { background: none; border: none; cursor: pointer; font-size: 1.1rem; padding: 5px; }
  .icon-btn:hover { background: #eee; border-radius: 50%; }
  .icon-btn.delete:hover { background: #ffe6e6; }

  /* -- Modal -- */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .modal { background: white; width: 90%; max-width: 800px; max-height: 90vh; border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
  .modal-header { padding: 15px 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
  .modal-body { padding: 20px; overflow-y: auto; }
  .modal-footer { padding: 15px 20px; border-top: 1px solid #eee; text-align: right; background: #f9f9f9; border-radius: 0 0 8px 8px; }
  
  .form-row { display: flex; gap: 20px; margin-bottom: 15px; }
  .form-group { flex: 1; margin-bottom: 15px; }
  .form-group label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9rem; }
  .form-group input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
</style>