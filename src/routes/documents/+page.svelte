<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { fly, fade } from 'svelte/transition';
  import { 
    FileText, Folder, Search, Upload, Trash2, 
    Eye, Download, Loader2, FolderOpen, File 
  } from 'lucide-svelte';

  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- ÉTAT ---
  let documents = [];
  let categories = [];
  let isLoading = true;
  let isUploading = false;
  
  let searchQuery = "";
  let selectedCategory = "all";
  let uploadStatus = ""; 

  onMount(async () => {
    await loadCategories();
    await loadDocuments();
  });

  // --- CHARGEMENT DONNÉES ---

  async function loadCategories() {
    const { data, error } = await supabase
      .from('document_metadata')
      .select('categorie');
      
    if (data) {
      categories = [...new Set(data.map(p => p.categorie))].sort();
    }
  }

  async function loadDocuments() {
    isLoading = true;
    let query = supabase
      .from('document_metadata')
      .select('file_name, categorie')
      .order('file_name', { ascending: true });

    if (selectedCategory !== 'all') {
      query = query.eq('categorie', selectedCategory);
    }
    
    if (searchQuery.trim()) {
      query = query.ilike('file_name', `%${searchQuery.trim()}%`);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Erreur:", error);
      toast.error("Erreur lors du chargement des documents.");
    } else {
      documents = data || [];
    }
    isLoading = false;
  }

  // --- ACTIONS ---

  async function handleUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const categorie = prompt(`Catégorie pour "${file.name}" :`, "Procédures");
    if (!categorie) {
      toast.warning("Upload annulé : catégorie requise.");
      event.target.value = null; 
      return;
    }

    isUploading = true;
    uploadStatus = `Envoi de "${file.name}"...`;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error: uploadError } = await supabase
        .storage
        .from('documents')
        .upload(file.name, file, { upsert: true }); 
        
      if (uploadError) throw uploadError;

      const { error: metadataError } = await supabase
        .from('document_metadata')
        .upsert({ 
          file_name: file.name, 
          categorie: categorie,
          uploaded_by: user?.id 
        }, { 
          onConflict: 'file_name' 
        });

      if (metadataError) throw metadataError;

      uploadStatus = "";
      toast.success(`Fichier importé avec succès !`);
      
      await Promise.all([loadCategories(), loadDocuments()]);

    } catch (error) {
      console.error(error);
      toast.error(`Erreur d'upload : ${error.message}`);
      uploadStatus = "";
    } finally {
      isUploading = false;
      event.target.value = null;
    }
  }

  async function deleteDocument(fileName) {
    if (!confirm(`Supprimer définitivement "${fileName}" ?`)) return;
    
    try {
      const { error: metadataError } = await supabase
        .from('document_metadata')
        .delete()
        .eq('file_name', fileName);
        
      if (metadataError) throw metadataError;
        
      const { error: storageError } = await supabase
        .storage
        .from('documents')
        .remove([fileName]);

      if (storageError) throw storageError;

      toast.success("Document supprimé.");
      await loadCategories(); 
      await loadDocuments();

    } catch (error) {
      toast.error(`Erreur suppression : ${error.message}`);
    }
  }

  // --- HELPERS UI ---

  function getPublicUrl(fileName) {
    const { data } = supabase.storage.from('documents').getPublicUrl(fileName);
    return data.publicUrl;
  }

  function isPreviewable(fileName) {
    return fileName.match(/\.(jpg|jpeg|png|gif|webp|pdf)$/i);
  }

  function openFile(fileName) {
    const url = getPublicUrl(fileName);
    window.open(url, '_blank');
  }

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
<header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }} style="--primary-rgb: var(--color-primary);">
  <div class="flex items-center gap-3">
    <div class="main-icon-container p-3 rounded-xl border transition-all duration-500">
      <FolderOpen size={32} />
    </div>
    <div>
      <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Documents</h1>
      <p class="text-gray-500 text-sm mt-1">Bibliothèque opérationnelle et archives.</p>
    </div>
  </div>

  <div class="flex items-center gap-3">
    {#if isUploading}
      <div class="upload-badge hidden sm:flex items-center gap-2 text-xs font-medium animate-pulse mr-2 px-3 py-1.5 rounded-lg border">
        <Loader2 size={16} class="animate-spin"/> {uploadStatus}
      </div>
    {/if}
    
    <label class="btn-import cursor-pointer px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group shadow-lg border">
      <Upload size={20} class="group-hover:-translate-y-0.5 transition-transform" /> 
      <span class="font-semibold hidden sm:inline">Importer</span>
      <input type="file" class="hidden" on:change={handleUpload} disabled={isUploading} />
    </label>
  </div>
</header>

  <main class="flex flex-col lg:flex-row gap-8">
    
<aside class="w-full lg:w-64 flex-shrink-0 space-y-6" in:fly={{ x: -20, duration: 600, delay: 100 }} style="--primary-rgb: var(--color-primary);">
  
  <div class="relative group">
    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 search-icon transition-colors">
      <Search size={16} />
    </div>
    <input 
      type="text" 
      placeholder="Nom du fichier..." 
      bind:value={searchQuery} 
      on:input={loadDocuments} 
      class="block w-full pl-9 pr-3 py-3 bg-black/20 border border-white/10 rounded-2xl text-sm text-gray-200 input-search transition-all outline-none placeholder-gray-600"
    />
  </div>

  <nav class="space-y-2 bg-black/20 border border-white/5 rounded-2xl p-4">
    <h3 class="px-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Catégories</h3>
    
    <button 
      on:click={() => { selectedCategory = 'all'; loadDocuments(); }}
      class="nav-item w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all 
      {selectedCategory === 'all' ? 'active' : 'inactive'}"
    >
      <Folder size={16} class="mr-3 icon-state" /> 
      Tout voir
    </button>
    
    <div class="h-px bg-white/5 my-2 mx-2"></div>

    {#each categories as cat}
      <button 
        on:click={() => { selectedCategory = cat; loadDocuments(); }}
        class="nav-item w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all 
        {selectedCategory === cat ? 'active' : 'inactive'}"
      >
        <Folder size={16} class="mr-3 icon-state" />
        {cat}
      </button>
    {/each}
  </nav>

</aside>

 <div class="flex-grow" in:fade={{ duration: 600 }} style="--primary-rgb: var(--color-primary);">
  {#if isLoading}
    <div class="flex flex-col items-center justify-center py-20 text-gray-500">
      <Loader2 class="w-10 h-10 animate-spin mb-3" style="color: rgba(var(--primary-rgb), 0.5)" />
      <p>Chargement...</p>
    </div>
  {:else if documents.length === 0}
    <div class="text-center py-24 bg-black/20 rounded-3xl border border-dashed border-white/10">
      <FileText size={48} class="mx-auto text-gray-600 mb-4 opacity-50" />
      <h3 class="text-lg font-bold text-gray-400">Dossier vide</h3>
      <p class="text-sm text-gray-600 mt-1">Aucun document trouvé dans cette catégorie.</p>
    </div>
  {:else}
    <div class="grid gap-3">
      {#each documents as doc}
        <div class="group doc-row bg-black/20 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.02] transition-all duration-200">
          
          <div class="flex items-center gap-4 overflow-hidden">
            <div class="icon-box p-3 rounded-xl border flex-shrink-0 transition-all">
              <FileText size={20} />
            </div>
            
            <div class="min-w-0">
              <h4 class="text-sm font-bold text-gray-200 truncate doc-title transition-colors" title={doc.file_name}>
                {doc.file_name}
              </h4>
              <span class="text-xs text-gray-500 inline-flex items-center gap-1 mt-0.5">
                <Folder size={10} /> {doc.categorie}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button 
              on:click={() => openFile(doc.file_name)}
              class="btn-action p-2 rounded-xl transition-all border border-transparent"
              title={isPreviewable(doc.file_name) ? "Prévisualiser" : "Télécharger"}
            >
              {#if isPreviewable(doc.file_name)}
                <Eye size={18} />
              {:else}
                <Download size={18} />
              {/if}
            </button>

            <button 
              on:click={() => deleteDocument(doc.file_name)}
              class="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
              title="Supprimer"
            >
              <Trash2 size={18} />
            </button>
          </div>

        </div>
      {/each}
    </div>
  {/if}
</div>

  </main>
</div>

<style>
  /* États inactifs */
  .nav-item.inactive {
    color: rgb(156, 163, 175); /* text-gray-400 */
  }
  
  .nav-item.inactive .icon-state {
    color: rgb(107, 114, 128); /* text-gray-500 */
  }

  .nav-item.inactive:hover {
    background-color: rgba(255, 255, 255, 0.05);
    color: white;
  }
  
  .nav-item.inactive:hover .icon-state {
    color: white;
  }

  /* État Actif (Thématisé) */
  .nav-item.active {
    background-color: rgba(var(--primary-rgb), 0.2);
    color: rgb(var(--primary-rgb));
    border: 1px solid rgba(var(--primary-rgb), 0.3);
    box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.15);
  }

  .nav-item.active .icon-state {
    color: rgb(var(--primary-rgb));
    /* Petit effet de lueur sur l'icône active */
    filter: drop-shadow(0 0 3px rgba(var(--primary-rgb), 0.4));
  }

  /* Conteneur de l'icône FolderOpen */
  .main-icon-container {
    background-color: rgba(var(--primary-rgb), 0.1);
    color: rgb(var(--primary-rgb));
    border-color: rgba(var(--primary-rgb), 0.2);
    box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);
  }

  /* Badge de statut d'upload */
  .upload-badge {
    color: rgb(var(--primary-rgb));
    background-color: rgba(var(--primary-rgb), 0.1);
    border-color: rgba(var(--primary-rgb), 0.2);
  }

  /* Bouton Importer (Label) */
  .btn-import {
    background-color: rgba(var(--primary-rgb), 0.2);
    border-color: rgba(var(--primary-rgb), 0.3);
    color: rgb(var(--primary-rgb));
  }

  .btn-import:hover {
    background-color: rgba(var(--primary-rgb), 0.3);
    border-color: rgba(var(--primary-rgb), 0.4);
    box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.2);
  }

  /* État désactivé quand on upload */
  .btn-import:has(input:disabled) {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }

  /* Bordure de la ligne au hover */
  .doc-row:hover {
    border-color: rgba(var(--primary-rgb), 0.2);
  }

  /* Boite de l'icône FileText */
  .icon-box {
    background-color: rgba(var(--primary-rgb), 0.1);
    color: rgb(var(--primary-rgb));
    border-color: rgba(var(--primary-rgb), 0.1);
  }

  /* Titre du document au hover */
  .doc-row:hover .doc-title {
    color: rgb(var(--primary-rgb));
  }

  /* Bouton Voir/Télécharger */
  .btn-action {
    color: rgb(156, 163, 175); /* gray-400 */
  }

  .btn-action:hover {
    color: rgb(var(--primary-rgb));
    background-color: rgba(var(--primary-rgb), 0.1);
    border-color: rgba(var(--primary-rgb), 0.2);
    box-shadow: 0 0 10px rgba(var(--primary-rgb), 0.1);
  }

  /* Style pour la recherche */
  .input-search:focus {
    border-color: rgba(var(--primary-rgb), 0.4);
    box-shadow: 0 0 0 2px rgba(var(--primary-rgb), 0.2);
  }

  .group:focus-within .search-icon {
    color: rgb(var(--primary-rgb));
  }
</style>