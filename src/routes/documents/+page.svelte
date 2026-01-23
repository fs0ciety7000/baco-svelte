<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast.js';
    import { openConfirmModal } from '$lib/stores/modal.js';
    
    // Icons
    import { 
        FileText, Folder, Search, Upload, Trash2, 
        Eye, Download, Loader2, FolderOpen, File 
    } from 'lucide-svelte';

    // Libs
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { DocumentsService } from '$lib/services/documents.service.js';

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);
    let isUploading = $state(false);

    // Données
    let documents = $state([]);
    let categories = $state([]);

    // Filtres
    let searchQuery = $state("");
    let selectedCategory = $state("all");
    let uploadStatus = $state("");

    // --- EFFECTS ---
    // Rechargement automatique lors du changement de filtres
    $effect(() => {
        if (isAuthorized) {
            loadDocuments();
        }
    });

    // --- INIT ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.DOCUMENTS_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        await loadCategories();
        // loadDocuments est déclenché par l'effet
    });

    // --- LOGIC ---

    async function loadCategories() {
        try {
            categories = await DocumentsService.loadCategories();
        } catch (e) {
            console.error(e);
        }
    }

    async function loadDocuments() {
        isLoading = true;
        try {
            documents = await DocumentsService.loadDocuments({
                category: selectedCategory,
                search: searchQuery
            });
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement documents");
        } finally {
            isLoading = false;
        }
    }

    // --- ACTIONS ---

    async function handleUpload(event) {
        if (!hasPermission(currentUser, ACTIONS.DOCUMENTS_WRITE)) return toast.error("Non autorisé");

        const file = event.target.files[0];
        if (!file) return;
        
        // Reset l'input pour permettre de ré-uploader le même fichier si besoin
        const input = event.target;
        
        const category = prompt(`Catégorie pour "${file.name}" :`, "Procédures");
        if (!category) {
            toast.warning("Annulé : catégorie requise.");
            input.value = null;
            return;
        }

        isUploading = true;
        uploadStatus = `Envoi de "${file.name}"...`;

        try {
            await DocumentsService.uploadDocument(file, category, currentUser.id);
            toast.success("Fichier importé !");
            await loadCategories();
            await loadDocuments();
        } catch (e) {
            toast.error("Erreur upload: " + e.message);
        } finally {
            isUploading = false;
            uploadStatus = "";
            input.value = null;
        }
    }

    function handleDelete(doc) {
        if (!hasPermission(currentUser, ACTIONS.DOCUMENTS_DELETE)) return toast.error("Non autorisé");

        openConfirmModal(`Supprimer définitivement "${doc.file_name}" ?`, async () => {
            try {
                await DocumentsService.deleteDocument(doc.file_name);
                toast.success("Supprimé");
                await loadCategories();
                await loadDocuments();
            } catch (e) {
                toast.error("Erreur suppression: " + e.message);
            }
        });
    }

    // --- HELPERS UI ---

    function isPreviewable(fileName) {
        return fileName.match(/\.(jpg|jpeg|png|gif|webp|pdf)$/i);
    }

    function openFile(fileName) {
        const url = DocumentsService.getPublicUrl(fileName);
        window.open(url, '_blank');
    }

</script>

<svelte:head>
  <title>Documents | BACO</title>
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
              <FolderOpen size={32} />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Documents</h1>
              <p class="text-gray-500 text-sm mt-1">Bibliothèque opérationnelle et archives.</p>
            </div>
        </div>

        <div class="flex items-center gap-3">
            {#if isUploading}
               <div class="hidden sm:flex items-center gap-2 text-xs font-medium animate-pulse mr-2 px-3 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400">
                <Loader2 size={16} class="animate-spin"/> {uploadStatus}
              </div>
            {/if}
            
            {#if hasPermission(currentUser, ACTIONS.DOCUMENTS_WRITE)}
                <label class="cursor-pointer px-5 py-3 rounded-xl flex items-center gap-2 transition-all hover:scale-105 bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold shadow-lg shadow-blue-500/10 hover:bg-blue-500/20">
                  <Upload size={20} /> 
                  <span class="hidden sm:inline">Importer</span>
                  <input type="file" class="hidden" onchange={handleUpload} disabled={isUploading} />
                </label>
            {/if}
        </div>
      </header>

      <div class="flex flex-col lg:flex-row gap-8">
        
        <aside class="w-full lg:w-72 flex-shrink-0 space-y-6" in:fly={{ x: -20, duration: 600, delay: 100 }}>
          
          <div class="relative group">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Nom du fichier..." 
              bind:value={searchQuery}
              class="block w-full pl-10 pr-3 py-3 bg-black/20 border border-white/10 rounded-2xl text-sm text-gray-200 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all placeholder-gray-600"
            />
          </div>

          <nav class="bg-black/20 border border-white/5 rounded-2xl p-2 space-y-1">
            <h3 class="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Catégories</h3>
            
            <button 
              onclick={() => selectedCategory = 'all'}
              class="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all {selectedCategory === 'all' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-sm' : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
            >
              <Folder size={16} class="mr-3 {selectedCategory === 'all' ? 'text-blue-400' : 'text-gray-500'}" /> 
              Tout voir
            </button>
            
            <div class="h-px bg-white/5 my-1 mx-2"></div>

            {#each categories as cat}
              <button 
                onclick={() => selectedCategory = cat}
                class="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all {selectedCategory === cat ? 'bg-blue-500/20 text-blue-400 border border-blue-500/20 shadow-sm' : 'text-gray-400 hover:bg-white/5 hover:text-white'}"
              >
                <Folder size={16} class="mr-3 {selectedCategory === cat ? 'text-blue-400' : 'text-gray-500'}" />
                {cat}
              </button>
            {/each}
          </nav>

        </aside>

        <div class="flex-grow min-h-[400px]" in:fade={{ duration: 600 }}>
          {#if isLoading}
            <div class="flex flex-col items-center justify-center py-20 text-gray-500">
              <Loader2 class="w-10 h-10 animate-spin mb-3 text-blue-500/50" />
              <p>Chargement...</p>
            </div>
          {:else if documents.length === 0}
            <div class="text-center py-24 bg-black/20 rounded-3xl border border-dashed border-white/10">
              <FileText size={48} class="mx-auto text-gray-600 mb-4 opacity-50" />
              <h3 class="text-lg font-bold text-gray-400">Dossier vide</h3>
              <p class="text-sm text-gray-600 mt-1">Aucun document trouvé.</p>
            </div>
          {:else}
            <div class="grid gap-3">
              {#each documents as doc}
                <div class="group bg-black/20 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.02] hover:border-blue-500/20 transition-all duration-200">
                  
                  <div class="flex items-center gap-4 overflow-hidden">
                    <div class="p-3 rounded-xl border border-white/5 bg-white/[0.02] flex-shrink-0 text-blue-400">
                      <FileText size={20} />
                    </div>
                    
                    <div class="min-w-0">
                      <h4 class="text-sm font-bold text-gray-200 truncate transition-colors group-hover:text-blue-300" title={doc.file_name}>
                        {doc.file_name}
                      </h4>
                      <div class="flex items-center gap-2 mt-0.5">
                          <span class="text-xs text-gray-500 inline-flex items-center gap-1">
                            <Folder size={10} /> {doc.categorie}
                          </span>
                          {#if doc.created_at}
                            <span class="text-[10px] text-gray-600 border-l border-white/10 pl-2">
                                {new Date(doc.created_at).toLocaleDateString()}
                            </span>
                          {/if}
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button 
                      onclick={() => openFile(doc.file_name)}
                      class="p-2.5 rounded-xl transition-all border border-transparent hover:bg-blue-500/10 hover:text-blue-400"
                      title={isPreviewable(doc.file_name) ? "Prévisualiser" : "Télécharger"}
                    >
                      {#if isPreviewable(doc.file_name)}
                        <Eye size={18} />
                      {:else}
                        <Download size={18} />
                      {/if}
                    </button>

                    {#if hasPermission(currentUser, ACTIONS.DOCUMENTS_DELETE)}
                        <button 
                          onclick={() => handleDelete(doc)}
                          class="p-2.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20"
                          title="Supprimer"
                        >
                          <Trash2 size={18} />
                        </button>
                    {/if}
                  </div>

                </div>
              {/each}
            </div>
          {/if}
        </div>

      </div>
    </div>
{/if}