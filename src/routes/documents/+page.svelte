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
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <FolderOpen size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Documents</h1>
          <p class="text-gray-500 text-sm mt-1">Bibliothèque opérationnelle et archives.</p>
        </div>
    </div>

    <div class="flex items-center gap-3">
        {#if isUploading}
          <div class="hidden sm:flex items-center gap-2 text-xs font-medium text-blue-400 animate-pulse mr-2 bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">
            <Loader2 size={16} class="animate-spin"/> {uploadStatus}
          </div>
        {/if}
        
        <label class="cursor-pointer bg-blue-600/20 hover:bg-blue-600/30 text-blue-100 border border-blue-500/30 px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 group shadow-lg shadow-blue-900/10">
          <Upload size={20} class="group-hover:-translate-y-0.5 transition-transform" /> 
          <span class="font-semibold hidden sm:inline">Importer</span>
          <input 
            type="file" 
            class="hidden" 
            on:change={handleUpload}
            disabled={isUploading} 
          />
        </label>
    </div>
  </header>

  <main class="flex flex-col lg:flex-row gap-8">
    
    <aside class="w-full lg:w-64 flex-shrink-0 space-y-6" in:fly={{ x: -20, duration: 600, delay: 100 }}>
      
      <div class="relative group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-blue-400 transition-colors">
          <Search size={16} />
        </div>
        <input 
          type="text" 
          placeholder="Nom du fichier..." 
          bind:value={searchQuery} 
          on:input={loadDocuments} 
          class="block w-full pl-9 pr-3 py-3 bg-black/20 border border-white/10 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/30 focus:border-transparent transition-all outline-none placeholder-gray-600"
        />
      </div>

      <nav class="space-y-2 bg-black/20 border border-white/5 rounded-2xl p-4">
        <h3 class="px-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Catégories</h3>
        
        <button 
          on:click={() => { selectedCategory = 'all'; loadDocuments(); }}
          class="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all 
          {selectedCategory === 'all' 
            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.15)]' 
            : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
        >
          <Folder size={16} class="mr-3 {selectedCategory === 'all' ? 'text-blue-400' : 'text-gray-500'}" /> 
          Tout voir
        </button>
        
        <div class="h-px bg-white/5 my-2 mx-2"></div>

        {#each categories as cat}
          <button 
            on:click={() => { selectedCategory = cat; loadDocuments(); }}
            class="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all 
            {selectedCategory === cat 
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.15)]' 
                : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
          >
            <Folder size={16} class="mr-3 {selectedCategory === cat ? 'text-blue-400' : 'text-gray-500'}" />
            {cat}
          </button>
        {/each}
      </nav>
    </aside>

    <div class="flex-grow" in:fade={{ duration: 600 }}>
      {#if isLoading}
        <div class="flex flex-col items-center justify-center py-20 text-gray-500">
          <Loader2 class="w-10 h-10 animate-spin text-blue-500/50 mb-3" />
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
            <div class="group bg-black/20 border border-white/5 hover:border-blue-500/20 rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.02] transition-all duration-200">
              
              <div class="flex items-center gap-4 overflow-hidden">
                <div class="p-3 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/10 flex-shrink-0">
                  <FileText size={20} />
                </div>
                <div class="min-w-0">
                  <h4 class="text-sm font-bold text-gray-200 truncate group-hover:text-blue-300 transition-colors" title={doc.file_name}>
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
                  class="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-xl transition-colors border border-transparent hover:border-white/10"
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