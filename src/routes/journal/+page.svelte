<script>
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores'; 
    import { goto } from '$app/navigation';
    import { toast } from '$lib/stores/toast.js'; 
    import { openConfirmModal } from '$lib/stores/modal.js';
    import { fly, fade, slide } from 'svelte/transition';
    import { marked } from 'marked'; 
    
    // Icons
    import { 
        Send, Paperclip, AlertTriangle, BookCopy, Trash2, Pencil, 
        FileText, Loader2, X, Save, ThumbsUp, Eye, ChevronDown, 
        Calendar, User, Search
    } from 'lucide-svelte';

    // Libs
    import { supabase } from '$lib/supabase';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { JournalService } from '$lib/services/journal.service.js';
    
    // Components
    import EmojiPicker from '$lib/components/EmojiPicker.svelte';
    import MarkdownToolbar from '$lib/components/MarkdownToolbar.svelte';

    // Config Marked (Markdown Renderer)
    marked.use({ 
        breaks: true, // <br> pour les sauts de ligne
        gfm: true     // GitHub Flavored Markdown
    });

    // --- ÉTAT (RUNES) ---
    let currentUser = $state(null);
    let isAuthorized = $state(false);
    let isLoading = $state(true);
    let isSubmitting = $state(false);

    // Data
    let logs = $state([]);
    let authors = $state([]);
    let allUsers = $state([]); 

    // Filtres & Recherche
    let textSearch = $state("");
    let selectedAuthor = $state("all");
    let selectedDate = $state("");
    
    // Pagination
    let currentPage = $state(0);
    let hasMore = $state(true);

    // Formulaire Nouveau
    let newMessage = $state("");
    let isUrgent = $state(false);
    let newFile = $state(null);
    let fileInput;

    // Autocomplétion
    let showSuggestions = $state(false);
    let filteredUsers = $state([]);
    
    // --- CORRECTION CLÉ : Les références DOM doivent être des Runes ---
    let textareaElement = $state(null);     // Pour le nouveau message
    let editTextareaElement = $state(null); // Pour l'édition

    // Édition
    let editingLog = $state(null);

    // Flatpickr
    let datePickerElement;
    let flatpickrInstance;

    // Config Réactions
    const reactionConfig = {
        '👍': { icon: ThumbsUp, color: 'text-green-400', activeClass: 'bg-green-500/20 border-green-500/30 text-green-400 shadow-[0_0_10px_rgba(74,222,128,0.2)]' },
        '👀': { icon: Eye, color: 'text-blue-400', activeClass: 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.2)]' },
        '⚠️': { icon: AlertTriangle, color: 'text-amber-400', activeClass: 'bg-amber-500/20 border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.2)]' }
    };

    // --- EFFECTS ---
    $effect(() => {
        const q = $page.url.searchParams.get('search');
        if (q && q !== textSearch) {
            textSearch = q;
            if (isAuthorized) loadLogs(true);
        }
    });

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.JOURNAL_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }

        isAuthorized = true;
        await Promise.all([loadAllProfiles(), loadLogs(true)]);

        if (typeof window !== 'undefined' && window.flatpickr && datePickerElement) {
            flatpickrInstance = window.flatpickr(datePickerElement, {
                locale: "fr",
                dateFormat: "Y-m-d",
                defaultDate: selectedDate,
                disableMobile: "true",
                onChange: (selectedDates, dateStr) => {
                    selectedDate = dateStr;
                    loadLogs(true);
                }
            });
        }
    });

    onDestroy(() => {
        if (flatpickrInstance) flatpickrInstance.destroy();
    });

    // --- LOGIC ---

    async function loadAllProfiles() {
        const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').order('full_name');
        if (data) {
            allUsers = data.filter(u => u.username || u.full_name);
            authors = data;
        }
    }

    async function loadLogs(reset = false) {
        if (reset) {
            logs = [];
            currentPage = 0;
            hasMore = true;
        }
        isLoading = true;

        try {
            const newLogs = await JournalService.loadLogs({
                page: currentPage,
                search: textSearch,
                author: selectedAuthor,
                date: selectedDate,
                currentUserId: currentUser.id
            });

            if (newLogs.length < 15) hasMore = false;
            logs = reset ? newLogs : [...logs, ...newLogs];
            currentPage++;
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement logs");
        } finally {
            isLoading = false;
        }
    }

    // --- HANDLERS ---

    async function handlePost() {
        if (!hasPermission(currentUser, ACTIONS.JOURNAL_WRITE)) return toast.error("Non autorisé.");
        if (editingLog) { await saveEditedEntry(); return; }
        if (!newMessage.trim() && !newFile) return;

        isSubmitting = true;
        try {
            await JournalService.createLog({
                content: newMessage,
                isUrgent,
                userId: currentUser.id,
                file: newFile
            });
            
            newMessage = "";
            isUrgent = false;
            newFile = null;
            if (fileInput) fileInput.value = "";
            loadLogs(true);
            toast.success("Publié !");
        } catch (e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    async function saveEditedEntry() {
        if (!editingLog.message_content.trim()) return;
        isSubmitting = true;
        try {
            await JournalService.updateLog(editingLog.id, editingLog.message_content, editingLog.is_urgent);
            editingLog = null;
            loadLogs(true);
            toast.success("Modifié !");
        } catch (e) {
            toast.error("Erreur: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    async function handleDelete(id) {
        if (!canDelete({ user_id: logs.find(l => l.id === id)?.user_id })) return toast.error("Non autorisé");
        
        openConfirmModal("Supprimer ce message ?", async () => {
            try {
                await JournalService.deleteLog(id);
                loadLogs(true);
                toast.success("Supprimé.");
            } catch(e) {
                toast.error("Erreur suppression");
            }
        });
    }

    async function handleReaction(logId, emoji) {
        const log = logs.find(l => l.id === logId);
        if (!log) return;
        
        const currentReaction = log.myReaction;
        
        const updatedLogs = logs.map(l => {
            if (l.id === logId) {
                const newMap = { ...l.reactionsMap };
                if (currentReaction === emoji) {
                    newMap[emoji] = Math.max(0, newMap[emoji] - 1);
                    return { ...l, myReaction: null, reactionsMap: newMap };
                } else {
                    if (currentReaction) newMap[currentReaction] = Math.max(0, newMap[currentReaction] - 1);
                    newMap[emoji] = (newMap[emoji] || 0) + 1;
                    return { ...l, myReaction: emoji, reactionsMap: newMap };
                }
            }
            return l;
        });
        logs = updatedLogs;

        try {
            await JournalService.toggleReaction(logId, currentUser.id, emoji, currentReaction);
        } catch (e) {
            console.error(e);
        }
    }

    // --- UTILS UI ---
    
    function isEdited(created_at, updated_at) {
        if (!updated_at) return false;
        if (!created_at) return false;
        // Seuil de 60 secondes pour éviter les faux positifs à la création
        return (new Date(updated_at).getTime() - new Date(created_at).getTime()) > 60000;
    }

    function canEdit(entry) {
        if (!currentUser) return false;
        if (entry.user_id === currentUser.id) return hasPermission(currentUser, ACTIONS.JOURNAL_WRITE);
        return hasPermission(currentUser, ACTIONS.USERS_MANAGE);
    }

    function canDelete(entry) {
        if (!currentUser) return false;
        if (entry.user_id === currentUser.id) return true;
        return hasPermission(currentUser, ACTIONS.JOURNAL_DELETE);
    }

    function handleInput(e) {
        const value = e.target.value;
        const cursor = e.target.selectionStart;
        const textBeforeCursor = value.substring(0, cursor);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex === -1) { showSuggestions = false; return; }
        
        const query = textBeforeCursor.substring(lastAtIndex + 1);
        if (query.includes('\n') || query.trim() !== query) { showSuggestions = false; return; }

        const lowerQuery = query.trim().toLowerCase();
        filteredUsers = allUsers.filter(u => 
            (u.username?.toLowerCase().startsWith(lowerQuery) || u.full_name?.toLowerCase().includes(lowerQuery))
        ).slice(0, 5);
        showSuggestions = filteredUsers.length > 0;
    }

    function selectUser(user) {
        if (!textareaElement) return;
        const value = newMessage;
        const cursor = textareaElement.selectionStart;
        const textBefore = value.substring(0, cursor);
        const lastAtIndex = textBefore.lastIndexOf('@');
        
        const tagLabel = user.username || user.full_name.replace(/\s+/g, '.').toLowerCase();
        const newText = value.substring(0, lastAtIndex) + `@${tagLabel} ` + value.substring(cursor);
        newMessage = newText;
        
        showSuggestions = false;
        setTimeout(() => textareaElement?.focus(), 0);
    }

    function formatDate(dateStr) {
        return new Date(dateStr).toLocaleString('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
</script>

<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
  <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  <script src="https://npmcdn.com/flatpickr/dist/l10n/fr.js"></script>
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
              <BookCopy size={32} />
            </div>
            <div>
              <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Journal</h1>
              <p class="text-gray-500 text-sm mt-1">Quoi de neuf aujourd'hui ?</p>
            </div>
        </div>
        
        <div class="flex items-center gap-3">
          <div class="relative group hidden lg:block">
             <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors"/>
             <input 
                type="text" 
                bind:value={textSearch}
                oninput={() => loadLogs(true)}
                placeholder="Rechercher..."
                class="pl-9 pr-4 py-2 text-xs rounded-xl bg-black/20 border border-white/10 text-gray-300 focus:ring-1 focus:ring-blue-500/50 focus:bg-black/40 transition-all outline-none w-48"
             />
          </div>

          <div class="relative hidden sm:block group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-hover:text-blue-400 transition-colors">
                <User size={14} />
            </div>
            <select 
                bind:value={selectedAuthor} 
                onchange={() => loadLogs(true)} 
                class="appearance-none pl-9 pr-8 py-2 text-xs rounded-xl bg-black/20 border border-white/10 text-gray-300 focus:ring-1 focus:ring-blue-500/50 hover:bg-white/5 transition-all cursor-pointer outline-none font-medium"
            >
              <option value="all" class="bg-gray-900 text-gray-300">Tous les auteurs</option>
              {#each authors as author}
                <option value={author.id} class="bg-gray-900 text-gray-300">{author.full_name}</option>
              {/each}
            </select>
            <ChevronDown size={14} class="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          </div>

          <div class="relative group">
            <div class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover:text-blue-400 transition-colors z-10"><Calendar size={14} /></div>
            <input 
                bind:this={datePickerElement} 
                type="text" 
                placeholder="Date..." 
                class="pl-9 pr-3 py-2 text-xs rounded-xl bg-black/20 border border-white/10 text-gray-300 placeholder-gray-500 focus:ring-1 focus:ring-blue-500/50 hover:bg-white/5 transition-all outline-none cursor-pointer w-32 font-medium" 
            />
          </div>
        </div>
      </header>

      <main class="max-w-3xl mx-auto space-y-8">
        
        {#if hasPermission(currentUser, ACTIONS.JOURNAL_WRITE)}
            <div 
                class="bg-black/20 backdrop-blur-sm border border-white/5 rounded-3xl p-4 transition-all focus-within:bg-black/30 focus-within:border-blue-500/30 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.1)] relative" 
                in:fly={{ y: 20, duration: 600, delay: 100 }}
            >
              <MarkdownToolbar textarea={textareaElement} bind:value={newMessage} />

              <textarea 
                bind:value={newMessage} 
                bind:this={textareaElement} 
                oninput={handleInput}
                rows="3" 
                class="w-full bg-transparent border-none p-2 focus:ring-0 resize-none text-base placeholder-gray-600 text-gray-200 mt-2 custom-scrollbar" 
                placeholder="Quoi de neuf aujourd'hui ? (@ pour taguer)"
              ></textarea>
              
              {#if showSuggestions}
                <div class="absolute z-40 top-[8rem] left-4 right-4 bg-[#1a1d24] rounded-xl shadow-2xl border border-white/10 max-h-48 overflow-y-auto custom-scrollbar" transition:slide>
                  {#each filteredUsers as user}
                    <button onclick={() => selectUser(user)} class="w-full text-left flex items-center gap-3 p-3 hover:bg-white/5 transition-colors cursor-pointer">
                      {#if user.avatar_url}
                         <img src={user.avatar_url} alt="avatar" class="w-6 h-6 rounded-full object-cover" />
                      {:else}
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-blue-500/20 text-blue-400">
                            {user.full_name?.charAt(0) || '?'}
                        </div>
                      {/if}
                      <span class="text-sm font-medium text-gray-200">{user.full_name}</span>
                    </button>
                  {/each}
                </div>
              {/if}

              {#if newFile}
                <div class="flex items-center gap-2 mb-3 mt-2 px-3 py-2 rounded-xl text-sm border bg-blue-500/10 text-blue-300 border-blue-500/20">
                  <Paperclip size={14} /> <span class="truncate max-w-xs">{newFile.name}</span>
                  <button onclick={() => { newFile = null; fileInput.value = ""; }} class="ml-auto hover:text-white"><X size={14}/></button>
                </div>
              {/if}

              <div class="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
                <div class="flex items-center gap-2">
                  <EmojiPicker onselect={(emoji) => newMessage += emoji} />
                  <label class="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-full cursor-pointer transition-colors" title="Joindre un fichier">
                    <Paperclip size={20} />
                    <input type="file" class="hidden" bind:this={fileInput} onchange={(e) => { if(e.target.files.length) newFile = e.target.files[0]; }} />
                  </label>
                  <button onclick={() => isUrgent = !isUrgent} class="p-2 rounded-full transition-colors {isUrgent ? 'text-red-400 bg-red-500/10' : 'text-gray-400 hover:text-red-400 hover:bg-white/5'}" title="Urgent">
                    <AlertTriangle size={20} />
                  </button>
                </div>
                
                <button 
                    onclick={handlePost} 
                    disabled={isSubmitting || (!newMessage && !newFile)} 
                    class="inline-flex items-center gap-2 px-6 py-2 rounded-xl font-bold text-white transition-all border border-blue-500/30 bg-blue-600/80 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                >
                  {#if isSubmitting}
                    <Loader2 size={18} class="animate-spin text-white/80" />
                  {:else}
                    <span>Publier</span>
                    <Send size={16} />
                  {/if}
                </button>
              </div>
            </div>
        {/if}

        <div class="space-y-6">
          {#if isLoading && logs.length === 0}
            <div class="flex justify-center py-10"><Loader2 class="animate-spin w-8 h-8 text-blue-500/50" /></div>
          {:else if logs.length === 0}
            <div class="text-center py-12 text-gray-500 bg-black/20 rounded-3xl border border-dashed border-white/5">Aucun message pour le moment.</div>
          {:else}
            {#each logs as log (log.id)}
              <div 
                class="group bg-black/20 backdrop-blur-sm rounded-3xl p-6 border transition-all hover:bg-black/30 {log.is_urgent ? 'border-red-500/30 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-white/5'}" 
                in:fly={{ y: 20, duration: 400 }}
              >
                <div class="flex justify-between items-start mb-4">
                  <div class="flex items-center gap-3">
                    {#if log.profiles?.avatar_url}
                     <img src={log.profiles.avatar_url} alt="avatar" class="w-10 h-10 rounded-full object-cover border border-white/10" />
                    {:else}
                      <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold border bg-white/5 border-white/10 text-gray-400">
                        {log.profiles?.full_name?.charAt(0) || '?'}
                      </div>
                    {/if}
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-gray-200">{log.profiles?.full_name || 'Inconnu'}</span>
                        {#if log.is_urgent}
                            <span class="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-extrabold uppercase animate-pulse">Urgent</span>
                        {/if}
                      </div>
                      <span class="text-xs text-gray-500 flex items-center gap-1">
                        {formatDate(log.created_at)}
                        {#if isEdited(log.created_at, log.updated_at)} 
                            <span class="italic ml-1 opacity-50">(Modifié)</span> 
                        {/if}
                      </span>
                    </div>
                  </div>
                  
                  <div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {#if canEdit(log)}
                        <button onclick={() => editingLog = { ...log }} class="p-2 text-gray-400 hover:text-blue-400 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5"><Pencil size={16} /></button>
                    {/if}
                    {#if canDelete(log)}
                        <button onclick={() => handleDelete(log.id)} class="p-2 text-gray-400 hover:text-red-400 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5"><Trash2 size={16} /></button>
                    {/if}
                  </div>
                </div>

                <div class="markdown-content text-gray-300 text-sm leading-relaxed mb-4 pl-[3.25rem]">
                    {@html marked.parse(log.message_content || '')}
                </div>

                {#if log.attachment_path}
                  <div class="mb-4 pl-[3.25rem]">
                    {#if log.attachment_type === 'image'}
                      <img src={JournalService.getPublicUrl(log.attachment_path)} alt="PJ" class="rounded-xl max-h-60 border border-white/10 shadow-lg" />
                    {:else}
                      <a href={JournalService.getPublicUrl(log.attachment_path)} target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors border border-white/5 text-gray-300">
                        <FileText size={16} /> Voir le fichier joint
                      </a>
                    {/if}
                  </div>
                {/if}

                <div class="flex gap-2 pt-4 border-t border-white/5 pl-[3.25rem]">
                  {#each Object.entries(reactionConfig) as [emojiKey, config]}
                     <button 
                        type="button" 
                        onclick={() => handleReaction(log.id, emojiKey)}
                        class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border backdrop-blur-sm {log.myReaction === emojiKey ? config.activeClass : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 hover:border-white/10'}"
                     >
                      <svelte:component this={config.icon} size={14} class={log.myReaction === emojiKey ? 'scale-110 transition-transform' : ''} />
                      {#if log.reactionsMap[emojiKey] > 0}<span>{log.reactionsMap[emojiKey]}</span>{/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          {/if}
          
          {#if hasMore}
            <div class="flex justify-center pt-4">
              <button onclick={() => loadLogs()} disabled={isLoading} class="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-all">
                {isLoading ? 'Chargement...' : 'Voir plus anciens'}
              </button>
            </div>
          {/if}
        </div>
      </main>
      
      {#if editingLog}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
          <div class="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10 bg-[#1a1d24]" transition:fly={{ y: 20 }}>
            <div class="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/[0.02]">
              <h2 class="text-xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
                <Pencil size={18} class="text-blue-400" /> Modifier
              </h2>
              <button onclick={() => editingLog = null} class="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            <div class="p-6 space-y-5">
                <MarkdownToolbar textarea={editTextareaElement} bind:value={editingLog.message_content} />
               
               <textarea 
                  rows="5" 
                  bind:value={editingLog.message_content} 
                  bind:this={editTextareaElement}
                  class="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm font-medium text-gray-200 placeholder-gray-600 focus:ring-1 focus:ring-blue-500/50 transition-all outline-none resize-none" 
               ></textarea>
               <label class="flex items-center gap-3 p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-all bg-black/40 group">
                  <input type="checkbox" bind:checked={editingLog.is_urgent} class="peer sr-only" />
                  <div class="w-5 h-5 border-2 border-gray-500 rounded peer-checked:bg-red-500 peer-checked:border-red-500 transition-all relative">
                      <AlertTriangle size={12} class="absolute top-0.5 left-0.5 text-white opacity-0 peer-checked:opacity-100" />
                  </div>
                  <span class="text-sm font-bold text-gray-400 group-hover:text-gray-200">Urgent</span>
               </label>
            </div>
            <div class="px-6 py-4 border-t border-white/10 bg-white/5 flex justify-end gap-3">
               <button onclick={() => editingLog = null} class="px-5 py-2.5 text-sm font-medium text-gray-300 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10">Annuler</button>
               <button onclick={saveEditedEntry} disabled={isSubmitting} class="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 border border-blue-500/30 rounded-xl flex items-center gap-2 shadow-lg">
                 {#if isSubmitting}<Loader2 size={16} class="animate-spin" />{/if} Enregistrer
               </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
{/if}

<style>
  /* STYLES MARKDOWN FORCÉS */
  /* Ces styles s'appliquent à l'intérieur de la div .markdown-content */
  .markdown-content :global(h1) { color: #e2e8f0; font-weight: bold; font-size: 1.5em; margin-top: 0.5em; margin-bottom: 0.5em; }
  .markdown-content :global(h2) { color: #e2e8f0; font-weight: bold; font-size: 1.25em; margin-top: 0.5em; margin-bottom: 0.5em; }
  .markdown-content :global(h3) { color: #e2e8f0; font-weight: bold; font-size: 1.1em; margin-top: 0.5em; margin-bottom: 0.5em; }
  
  .markdown-content :global(strong) { color: white; font-weight: bold; }
  .markdown-content :global(em) { font-style: italic; color: #d1d5db; }
  
  .markdown-content :global(a) { color: #60a5fa; text-decoration: underline; }
  .markdown-content :global(a:hover) { color: #93c5fd; }
  
  .markdown-content :global(ul) { list-style-type: disc; padding-left: 1.5em; margin: 0.5em 0; }
  .markdown-content :global(ol) { list-style-type: decimal; padding-left: 1.5em; margin: 0.5em 0; }
  
  .markdown-content :global(blockquote) { border-left: 4px solid #4b5563; padding-left: 1em; color: #9ca3af; font-style: italic; margin: 1em 0; background: rgba(255,255,255,0.05); padding-top:0.5em; padding-bottom:0.5em; border-radius: 0 8px 8px 0; }
  
  .markdown-content :global(code) { background: rgba(255,255,255,0.1); padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; color: #e2e8f0; }
  .markdown-content :global(pre) { background: #111827; padding: 1em; border-radius: 8px; overflow-x: auto; margin: 1em 0; border: 1px solid rgba(255,255,255,0.1); }
  .markdown-content :global(pre code) { background: transparent; padding: 0; color: #e5e7eb; }
  
  .markdown-content :global(p) { margin-bottom: 0.5em; }
  
  /* Overrides Flatpickr Dark Theme */
  :global(.flatpickr-calendar) { background: rgba(15, 23, 42, 0.95) !important; backdrop-filter: blur(12px) !important; border: 1px solid rgba(255, 255, 255, 0.1) !important; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important; }
  :global(.flatpickr-day.selected) { background: rgb(37, 99, 235) !important; border-color: transparent !important; }
  :global(.flatpickr-day) { color: #cbd5e1 !important; }
  :global(.flatpickr-day:hover) { background: rgba(255,255,255,0.1) !important; }
  :global(.flatpickr-months .flatpickr-month) { color: #fff !important; fill: #fff !important; }
  :global(.flatpickr-current-month .flatpickr-monthDropdown-months) { color: #fff !important; }
  :global(span.flatpickr-weekday) { color: #94a3b8 !important; }
</style>