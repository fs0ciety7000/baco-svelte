<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { marked } from 'marked';
  import MarkdownToolbar from '$lib/components/MarkdownToolbar.svelte';
  import { fly, fade } from 'svelte/transition';
  import { 
    Sparkles, Plus, Trash2, Calendar, User, 
    ArrowLeft, ArrowRight, Loader2, X, Save, 
    Zap, Bug, Star
  } from 'lucide-svelte';

  // IMPORT TOAST
  import { toast } from '$lib/stores/toast.js';

  // --- CONFIG ---
  const ROWS_PER_PAGE = 5;

  // --- ÉTAT ---
  let entries = [];
  let isLoading = true;
  let isSaving = false;
  let editingId = null;
  let textareaRef;
  // User & Rôles
  let currentUser = null;
  let canManage = false;

  // Pagination
  let currentPage = 1;
  let totalRows = 0;

  // Modale
  let isModalOpen = false;
  let newEntry = { title: "", type: "Amélioré", content: "" };

  onMount(async () => {
    await loadUserAndRole();
    loadChangelog();
  });

  // --- AUTH ---
  async function loadUserAndRole() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      currentUser = user;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      const role = profile?.role || 'user';
      canManage = ['admin', 'moderator'].includes(role);
    }
  }

  // --- CHARGEMENT ---
  async function loadChangelog() {
    isLoading = true;
    try {
      const { count, error: countError } = await supabase
        .from('changelog')
        .select('*', { count: 'exact', head: true });
      
      if (countError) throw countError;
      totalRows = count || 0;

      const from = (currentPage - 1) * ROWS_PER_PAGE;
      const to = from + ROWS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from('changelog')
        .select(`*, profiles ( full_name, avatar_url )`)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      entries = data || [];

    } catch (e) {
      console.error("Erreur chargement:", e);
      toast.error("Erreur lors du chargement des nouveautés.");
    } finally {
      isLoading = false;
    }
  }

  // --- ACTIONS ---

// ... imports existants
  import MarkdownToolbar from '$lib/components/MarkdownToolbar.svelte';

  // --- ÉTAT ---
  // ...
  let editingId = null; // ID de l'entrée en cours de modification
  let textareaRef;      // Référence pour la barre d'outils

  // ...

  // Modifier openModal pour accepter un mode "édition"
  function openModal(entry = null) {
    if (entry) {
      editingId = entry.id;
      newEntry = { 
        title: entry.title, 
        type: entry.type, 
        content: entry.content 
      };
    } else {
      editingId = null;
      newEntry = { title: "", type: "Amélioré", content: "" };
    }
    isModalOpen = true;
  }

  async function saveEntry() {
    if (!newEntry.title || !newEntry.content) return toast.warning("Veuillez remplir tous les champs.");
    isSaving = true;

    try {
      const payload = {
        title: newEntry.title,
        type: newEntry.type,
        content: newEntry.content,
        user_id: currentUser.id
      };

      let error;
      if (editingId) {
        // Mode Mise à jour
        const res = await supabase.from('changelog').update(payload).eq('id', editingId);
        error = res.error;
      } else {
        // Mode Insertion
        const res = await supabase.from('changelog').insert([payload]);
        error = res.error;
      }

      if (error) throw error;

      closeModal();
      loadChangelog();
      toast.success(editingId ? "Entrée mise à jour !" : "Entrée publiée !");
    } catch (e) {
      toast.error("Erreur : " + e.message);
    } finally {
      isSaving = false;
    }
  }

  async function deleteEntry(id) {
    if (!confirm("Supprimer cette entrée ?")) return;
    try {
      const { error } = await supabase.from('changelog').delete().eq('id', id);
      if (error) throw error;
      
      loadChangelog();
      toast.success("Entrée supprimée.");
    } catch (e) {
      toast.error("Erreur suppression : " + e.message);
    }
  }

  // --- UI HELPERS ---

 function openModal(entry = null) {
    if (entry) {
      editingId = entry.id;
      newEntry = { 
        title: entry.title, 
        type: entry.type, 
        content: entry.content 
      };
    } else {
      editingId = null;
      newEntry = { title: "", type: "Amélioré", content: "" };
    }
    isModalOpen = true;
  }


  function closeModal() { isModalOpen = false; }

  function changePage(newPage) {
    const maxPage = Math.ceil(totalRows / ROWS_PER_PAGE) || 1;
    if (newPage < 1 || newPage > maxPage) return;
    currentPage = newPage;
    loadChangelog();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('fr-FR', { 
      day: 'numeric', month: 'long', year: 'numeric' 
    });
  }

  function getBadgeStyle(type) {
    switch (type) {
      case 'Nouveau': return { 
        class: 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(74,222,128,0.2)]', 
        icon: Star 
      };
      case 'Corrigé': return { 
        class: 'bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_10px_rgba(248,113,113,0.2)]', 
        icon: Bug 
      };
      default: return { 
        class: 'bg-blue-500/20 text-blue-400 border-blue-500/30 shadow-[0_0_10px_rgba(96,165,250,0.2)]', 
        icon: Zap 
      };
    }
  }

  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none resize-none";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 ml-1";

</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex items-center justify-between pb-6 border-b border-white/5" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <Sparkles size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Nouveautés</h1>
          <p class="text-gray-500 text-sm mt-1">Historique des mises à jour et correctifs.</p>
        </div>
    </div>
    
    {#if canManage}
        <button on:click={openModal} class="bg-blue-600/20 hover:bg-blue-600/30 text-blue-100 border border-blue-500/30 px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-blue-900/10">
            <Plus size={18} /> <span class="hidden sm:inline font-bold">Ajouter</span>
        </button>
    {/if}
  </header>

  <main class="py-4">
    
    {#if isLoading && entries.length === 0}
      <div class="flex justify-center py-20"><Loader2 class="animate-spin w-10 h-10 text-blue-500/50" /></div>
    {:else if entries.length === 0}
      <div class="text-center py-20 text-gray-500 bg-black/20 rounded-3xl border border-dashed border-white/10">
        <Sparkles size={48} class="mx-auto mb-4 opacity-50" />
        <p>Aucune note de mise à jour pour le moment.</p>
      </div>
    {:else}
      
      <div class="space-y-12 relative before:absolute before:inset-0 before:ml-6 md:before:ml-6 before:h-full before:w-0.5 before:bg-white/5 before:-translate-x-px">
        
        {#each entries as entry (entry.id)}
          {@const style = getBadgeStyle(entry.type)}
          {@const author = entry.profiles}
          
          <div class="relative pl-16 md:pl-16 group" in:fly={{ y: 20, duration: 600 }}>
            
            <div class="absolute left-0 top-0 w-12 h-12 rounded-full border-4 border-[#0f1115] bg-black/40 flex items-center justify-center shadow-lg z-10 backdrop-blur-md">
              <svelte:component this={style.icon} size={20} class={style.class.split(' ')[1]} />
            </div>

            <div class="bg-black/20 border border-white/5 rounded-3xl overflow-hidden hover:border-white/10 transition-all hover:bg-white/[0.02]">
              
              <div class="p-6 border-b border-white/5 bg-white/[0.02]">
                <div class="flex flex-wrap justify-between items-start gap-4 mb-4">
                  <div class="flex items-center gap-3">
                    <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider {style.class} backdrop-blur-sm">
                      {entry.type}
                    </span>
                    <span class="text-sm text-gray-500 flex items-center gap-1.5 font-mono">
                      <Calendar size={14} /> {formatDate(entry.created_at)}
                    </span>
                  </div>
                  
                  {#if canManage}

                  <button 
      on:click={() => openModal(entry)} 
      class="p-2 text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors border border-transparent hover:border-blue-500/20"
      title="Modifier"
    >
      <Save size={16} /> 
    </button>

                    <button on:click={() => deleteEntry(entry.id)} class="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors border border-transparent hover:border-red-500/20" title="Supprimer">
                      <Trash2 size={16} />
                    </button>
                  {/if}
                </div>
                
                <h2 class="text-2xl font-bold text-gray-100 mb-3 tracking-tight">{entry.title}</h2>
                
                <div class="flex items-center gap-2">
                  {#if author?.avatar_url}
                    <img src={author.avatar_url} alt="" class="w-6 h-6 rounded-full object-cover border border-white/10">
                  {:else}
                    <div class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-gray-400 border border-white/5">?</div>
                  {/if}
                  <span class="text-xs font-medium text-gray-500">
                    Par <span class="text-gray-300">{author?.full_name || 'Inconnu'}</span>
                  </span>
                </div>
              </div>

              <div class="p-6 prose prose-invert prose-sm max-w-none text-gray-300 prose-headings:text-gray-100 prose-a:text-blue-400">
                {@html marked.parse(entry.content || '')}
              </div>

            </div>
          </div>
        {/each}

      </div>

      {#if totalRows > ROWS_PER_PAGE}
        <div class="flex justify-between items-center pt-8 pl-16">
          <div class="text-sm text-gray-500">
            Page <span class="text-gray-300 font-bold">{currentPage}</span> / {Math.ceil(totalRows / ROWS_PER_PAGE)}
          </div>
          <div class="flex gap-2">
            <button on:click={() => changePage(currentPage - 1)} disabled={currentPage === 1} class="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ArrowLeft size={20} />
            </button>
            <button on:click={() => changePage(currentPage + 1)} disabled={currentPage * ROWS_PER_PAGE >= totalRows} class="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 hover:text-white text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      {/if}

    {/if}

  </main>

  {#if isModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      <div 
        class="bg-[#0f1115] w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-white/10 ring-1 ring-white/5 flex flex-col"
        transition:fly={{ y: 20, duration: 300 }}
      >
        <div class="flex justify-between items-center mb-6 border-b border-white/10 pb-4">
          <h3 class="text-xl font-bold text-gray-100">Ajouter une entrée</h3>
          <button on:click={closeModal} class="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"><X size={20}/></button>
        </div>
        
        <div class="space-y-5">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class={labelClass}>Titre</label>
              <input type="text" bind:value={newEntry.title} class={inputClass} placeholder="Ex: Version 2.0">
            </div>
            <div>
              <label class={labelClass}>Type</label>
              <select bind:value={newEntry.type} class="{inputClass} bg-[#0f1115]">
                <option value="Amélioré">Amélioré</option>
                <option value="Nouveau">Nouveau</option>
                <option value="Corrigé">Corrigé</option>
              </select>
            </div>
          </div>
          
        <div>
  <label class={labelClass}>Contenu (Markdown)</label>
  
  <div class="rounded-xl border border-white/10 overflow-hidden bg-black/40 focus-within:border-blue-500/50 transition-all">
    <MarkdownToolbar bind:textarea={textareaRef} bind:value={newEntry.content} />
    
    <textarea 
      bind:this={textareaRef}
      rows="8" 
      bind:value={newEntry.content} 
      class="block w-full bg-transparent p-3 text-sm font-mono text-white placeholder-gray-600 outline-none resize-none" 
      placeholder="- Liste des changements..."
    ></textarea>
  </div>
  
  <p class="text-[10px] text-gray-500 mt-2 text-right italic">
    Le format **barré** est supporté via ~~texte~~.
  </p>
</div>

        <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-white/10">
          <button on:click={closeModal} class="px-4 py-2 text-gray-400 hover:text-white hover:bg-white/5 border border-white/10 rounded-xl transition-all text-sm font-medium">Annuler</button>
          <button on:click={saveEntry} disabled={isSaving} class="px-4 py-2 bg-blue-600/80 hover:bg-blue-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-900/20 transition-all border border-blue-500/30">
            {#if isSaving} <Loader2 class="animate-spin" size={16}/> {:else} <Save size={16}/> {/if} Publier
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>