<svelte:head>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/flatpickr/dist/flatpickr.min.css">
  <script src="https://cdn.jsdelivr.net/npm/flatpickr"></script>
  <script src="https://npmcdn.com/flatpickr/dist/l10n/fr.js"></script>
</svelte:head>

<script>
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js'; 
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { fly, fade } from 'svelte/transition';
  import EmojiPicker from '$lib/components/EmojiPicker.svelte'; // <--- IMPORT

  import { 
    Send, Paperclip, Search, Filter, AlertTriangle, BookCopy, 
    Trash2, Pencil, FileText, Image, Loader2, X, Save, ThumbsUp, Eye, ChevronDown, Calendar, User
  } from 'lucide-svelte';

  // --- CONFIG ---
  const ROWS_PER_PAGE = 20;

  // --- ÉTAT ---
  let logs = [];
  let authors = [];
  let isLoading = true;
  let isSubmitting = false;
  let datePickerElement;
  let flatpickrInstance;

  // User & Rôles
  let currentUser = null;
  let userRole = 'user'; 

  // Autocomplétion
  let allUsers = [];
  let textareaElement;
  let showSuggestions = false;
  let filteredUsers = [];
  let tagSearchQuery = '';

  // Filtres
  let selectedAuthor = "all";
  let selectedDate = "";

  // Nouveau Message
  let newMessage = "";
  let isUrgent = false;
  let newFile = null;
  let fileInput;

  // Pagination
  let currentPage = 0;
  let hasMore = true;

  // Édition
  let editingLog = null;

  // Config Réactions
  const reactionConfig = {
    '👍': { 
      icon: ThumbsUp, 
      color: 'text-green-400', 
      activeClass: 'bg-green-500/20 border-green-500/30 text-green-400 shadow-[0_0_10px_rgba(74,222,128,0.2)]' 
    },
    '👀': { 
      icon: Eye, 
      color: 'text-blue-400', 
      activeClass: 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.2)]' 
    },
    '⚠️': { 
      icon: AlertTriangle, 
      color: 'text-amber-400', 
      activeClass: 'bg-amber-500/20 border-amber-500/30 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.2)]' 
    }
  };

  const normalizeName = (name) => {
    if (!name) return '';
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  onMount(async () => {
    await loadUserAndRole();
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
    if (flatpickrInstance) {
      flatpickrInstance.destroy();
    }
  });

  // --- AUTH & RÔLES ---
  async function loadUserAndRole() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    if (user) {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();
      if (profile) {
        userRole = (profile.role || 'user').toLowerCase();
        currentUser = { ...user, ...profile };
      } else if (error) {
        console.error("Erreur chargement profil:", error);
      }
    }
  }

  function canEdit(entry, currentRole) {
    if (!currentUser) return false;
    if (entry.user_id === currentUser.id) return true;
    const role = (currentRole || '').toLowerCase();
    return ['admin', 'moderator'].includes(role);
  }
  
  // --- CHARGEMENT ---
  async function loadAllProfiles() {
    const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').order('full_name', { ascending: true });
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
    const from = currentPage * ROWS_PER_PAGE;
    const to = from + ROWS_PER_PAGE - 1;

    let query = supabase
      .from('main_courante')
      .select(`
        *,
        profiles ( full_name, avatar_url ),
        log_reactions ( user_id, emoji )
      `)
      .order('created_at', { ascending: false }) 
      .range(from, to);

    if (selectedAuthor !== 'all') query = query.eq('user_id', selectedAuthor);
    if (selectedDate) {
      query = query.gte('created_at', `${selectedDate}T00:00:00`)
                   .lte('created_at', `${selectedDate}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Erreur:", error);
    } else {
      if (data.length < ROWS_PER_PAGE) hasMore = false;
      const processedData = data.map(log => {
        const reactionsMap = { '👍': 0, '👀': 0, '⚠️': 0 };
        let myReaction = null;
        if (log.log_reactions) {
          log.log_reactions.forEach(r => {
            if (reactionsMap[r.emoji] !== undefined) reactionsMap[r.emoji]++;
            if (r.user_id === currentUser?.id) myReaction = r.emoji;
          });
        }
        return { ...log, reactionsMap, myReaction };
      });
      logs = reset ? processedData : [...logs, ...processedData];
      currentPage++;
    }
    isLoading = false;
  }
  
  // --- HELPERS EMOJI [NOUVEAU] ---
  function handleEmoji(emojiChar) {
    newMessage += emojiChar;
    // Focus sur le textarea après ajout
    if(textareaElement) textareaElement.focus();
  }

  // --- AUTO-COMPLÉTION ---
  function handleInput(e) {
    const value = e.target.value;
    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) {
      showSuggestions = false;
      return;
    }

    const query = textBeforeCursor.substring(lastAtIndex + 1);
    if (query.includes('\n') || query.trim() !== query) {
        showSuggestions = false;
        return;
    }
    
    tagSearchQuery = query.trim();
    const lowerQuery = tagSearchQuery.toLowerCase();
    filteredUsers = allUsers.filter(user => {
        const usernameMatch = user.username && user.username.toLowerCase().startsWith(lowerQuery);
        const nameMatch = user.full_name && user.full_name.toLowerCase().includes(lowerQuery);
        return usernameMatch || nameMatch;
    }).slice(0, 5);
    showSuggestions = filteredUsers.length > 0;
  }

  function selectUser(user) {
    if (!textareaElement) return;

    const value = newMessage;
    const cursor = textareaElement.selectionStart;
    const textBefore = value.substring(0, cursor);
    const lastAtIndex = textBefore.lastIndexOf('@');
    const tagLabel = user.username || user.full_name.replace(/\s+/g, '.').toLowerCase();
    if (lastAtIndex === -1) return;

    const startReplaceIndex = lastAtIndex;
    const tagToInsert = `@${tagLabel} `;
    const newText = value.substring(0, startReplaceIndex) + tagToInsert + value.substring(cursor);
    
    newMessage = newText;
    const newCursorPosition = startReplaceIndex + tagToInsert.length;
    setTimeout(() => {
        textareaElement.selectionStart = newCursorPosition;
        textareaElement.selectionEnd = newCursorPosition;
        textareaElement.focus();
    }, 0);
    showSuggestions = false;
  }
  
  async function processTagsAndNotify(message) {
      if (!message || !currentUser) return;
      const tagRegex = /@([a-zA-Z0-9._-]+)/g; 
      let match;
      const taggedUserIds = new Set();
      while ((match = tagRegex.exec(message)) !== null) {
          const taggedLabel = match[1].trim().toLowerCase();
          const foundUser = allUsers.find(u => {
             const uname = u.username?.toLowerCase();
             const fname = u.full_name?.replace(/\s+/g, '.').toLowerCase();
             return uname === taggedLabel || fname === taggedLabel;
          });
          if (foundUser && foundUser.id !== currentUser.id) {
              taggedUserIds.add(foundUser.id);
          }
      }

      if (taggedUserIds.size === 0) return;
      const senderName = currentUser.full_name || currentUser.email;
      const notificationMessage = message.substring(0, 100) + (message.length > 100 ? '...' : '');
      const notificationsToInsert = Array.from(taggedUserIds).map(userId => ({
          user_id_target: userId,
          title: `Mentionné par ${senderName}`,
          message: notificationMessage,
          type: 'mention',
          link_to: `/journal`, 
          is_read: false
      }));
      await supabase.from('notifications').insert(notificationsToInsert);
  }

  // --- ACTIONS ---
  async function handlePost() {
    if (editingLog) {
      await saveEditedEntry();
      return;
    }

    if (!newMessage.trim() && !newFile) return;
    isSubmitting = true;
    try {
      let attachmentPath = null;
      let attachmentType = null;
      if (newFile) {
        const ext = newFile.name.split('.').pop();
        const fileName = `journal/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        const { error: upError } = await supabase.storage.from('documents').upload(fileName, newFile);
        if (upError) throw upError;
        attachmentPath = fileName;
        attachmentType = newFile.type.startsWith('image/') ? 'image' : 'file';
      }
      
      const { error } = await supabase.from('main_courante').insert({
        message_content: newMessage,
        is_urgent: isUrgent,
        user_id: currentUser.id,
        attachment_path: attachmentPath,
        attachment_type: attachmentType
      });
      if (error) throw error;

      await processTagsAndNotify(newMessage);
      
      newMessage = "";
      isUrgent = false;
      newFile = null;
      if (fileInput) fileInput.value = "";
      loadLogs(true);
      toast.success("Message publié.");

    } catch (e) {
      toast.error("Erreur : " + e.message);
    } finally {
      isSubmitting = false;
    }
  }

  async function saveEditedEntry() {
    if (!editingLog.message_content.trim()) return;
    isSubmitting = true;
    try {
      const { error } = await supabase
        .from('main_courante')
        .update({ 
          message_content: editingLog.message_content,
          is_urgent: editingLog.is_urgent,
          updated_at: new Date()
        })
        .eq('id', editingLog.id);
      if (error) throw error;

      closeModal();
      loadLogs(true);
      toast.success("Message modifié.");

    } catch (e) {
      toast.error("Erreur : " + e.message);
    } finally {
      isSubmitting = false;
    }
  }
  
  function executeDeleteLog(id) {
    return async () => {
      const { error } = await supabase.from('main_courante').delete().eq('id', id);
      if (!error) {
        loadLogs(true);
        toast.success("Message supprimé.");
      } else {
        toast.error("Erreur : " + error.message);
      }
    };
  }
  
  async function deleteLog(id) {
    openConfirmModal(
        "Supprimer ce message définitivement ?",
        executeDeleteLog(id) 
    );
  }

  async function toggleReaction(logId, emoji, currentReaction) {
    if (!currentUser) return;
    logs = logs.map(l => {
        if (l.id === logId) {
            const newMap = { ...l.reactionsMap };
            if (l.myReaction === emoji) {
                newMap[emoji] = Math.max(0, newMap[emoji] - 1);
                return { ...l, myReaction: null, reactionsMap: newMap };
            } else {
                if (l.myReaction) newMap[l.myReaction] = Math.max(0, newMap[l.myReaction] - 1);
                newMap[emoji] = (newMap[emoji] || 0) + 1;
                return { ...l, myReaction: emoji, reactionsMap: newMap };
            }
        }
        return l;
    });

    if (currentReaction === emoji) {
      await supabase.from('log_reactions').delete().match({ log_id: logId, user_id: currentUser.id });
    } else {
      await supabase.from('log_reactions').upsert(
        { log_id: logId, user_id: currentUser.id, emoji }, 
        { onConflict: 'log_id, user_id' }
      );
    }
  }

  // --- UI HELPERS ---
  function openModal(log) { editingLog = { ...log }; }
  function closeModal() { editingLog = null; }

  function getPublicUrl(path) {
    if (!path) return '';
    const { data } = supabase.storage.from('documents').getPublicUrl(path);
    return data.publicUrl;
  }

  function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) newFile = files[0];
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('fr-BE', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
  }
</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20, duration: 600 }}>
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
          <BookCopy size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Journal</h1>
          <p class="text-gray-500 text-sm mt-1">Journal et actualités.</p>
        </div>
    </div>
    
   <div class="flex items-center gap-3">
      <div class="relative hidden sm:block group">
        <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-hover:text-blue-400 transition-colors">
            <User size={14} />
        </div>
        <select 
          bind:value={selectedAuthor} 
          on:change={() => loadLogs(true)} 
          class="appearance-none pl-9 pr-8 py-2 text-xs rounded-xl bg-black/20 border border-white/10 text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:bg-white/5 transition-all cursor-pointer outline-none shadow-sm font-medium"
        >
          <option value="all" class="bg-gray-900 text-gray-300">Tous les auteurs</option>
          {#each authors as author}
            <option value={author.id} class="bg-gray-900 text-gray-300">{author.full_name}</option>
          {/each}
        </select>
        <div class="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover:text-blue-400 transition-colors">
          <ChevronDown size={14} />
        </div>
      </div>

      <div class="relative group">
        <div class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover:text-blue-400 transition-colors z-10">
            <Calendar size={14} />
        </div>
        
        <input 
          bind:this={datePickerElement}
          type="text" 
          placeholder="Date..."
          class="pl-9 pr-3 py-2 text-xs rounded-xl bg-black/30 border border-white/10 text-gray-300 placeholder-gray-500 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 hover:bg-white/5 transition-all outline-none shadow-sm cursor-pointer w-32 font-medium" 
        />
      </div>
    </div>
  </header>

  <main class="max-w-3xl mx-auto space-y-8">
    
    <div class="bg-black/20 border border-white/5 rounded-3xl p-4 transition-all focus-within:bg-black/30 focus-within:border-white/10 relative shadow-sm" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <textarea 
        bind:value={newMessage} 
        bind:this={textareaElement}
        on:input={handleInput}
        rows="3" 
        class="w-full bg-transparent border-none p-2 focus:ring-0 resize-none text-base placeholder-gray-500 text-gray-200" 
        placeholder="Quoi de neuf aujourd'hui ? (@username pour taguer)"
      ></textarea>
      
      {#if showSuggestions}
        <div class="absolute z-40 top-[5.25rem] left-4 right-4 bg-[#0f1115] rounded-xl shadow-2xl border border-white/10 max-h-48 overflow-y-auto custom-scrollbar">
          {#each filteredUsers as user}
            <button on:click={() => selectUser(user)} class="w-full text-left flex items-center gap-3 p-3 hover:bg-white/5 transition-colors cursor-pointer">
              {#if user.avatar_url}
                 <img src={user.avatar_url} alt="avatar" class="w-6 h-6 rounded-full object-cover" />
              {:else}
                <div class="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 text-xs font-bold">
                  {user.full_name?.charAt(0) || '?'}
                </div>
              {/if}
              <span class="text-sm font-medium text-gray-200">{user.full_name}</span>
              <span class="text-xs text-gray-500 ml-auto">@{user.username}</span>
            </button>
          {:else}
            <div class="p-3 text-sm text-gray-500">Aucun utilisateur trouvé.</div>
          {/each}
        </div>
      {/if}

      {#if newFile}
        <div class="flex items-center gap-2 mb-3 mt-2 bg-blue-500/10 px-3 py-2 rounded-xl text-sm text-blue-300 border border-blue-500/20">
          <Paperclip size={14} /> 
          <span class="truncate max-w-xs">{newFile.name}</span>
          <button on:click={() => { newFile = null; fileInput.value = ""; }} class="ml-auto text-blue-400 hover:text-white"><X size={14}/></button>
        </div>
      {/if}

      <div class="flex items-center justify-between pt-2 border-t border-white/5 mt-2">
        <div class="flex items-center gap-2">
          
          <EmojiPicker onselect={handleEmoji} />

          <label class="p-2 text-gray-400 hover:text-blue-400 hover:bg-white/5 rounded-full cursor-pointer transition-colors" title="Joindre un fichier">
            <Paperclip size={20} />
            <input type="file" class="hidden" bind:this={fileInput} on:change={handleFileSelect} />
          </label>
          
          <button 
            on:click={() => isUrgent = !isUrgent} 
            class="p-2 rounded-full transition-colors {isUrgent ? 'text-red-400 bg-red-500/10' : 'text-gray-400 hover:text-red-400 hover:bg-white/5'}"
            title="Marquer comme Urgent"
          >
            <AlertTriangle size={20} />
          </button>
        </div>

        <button 
          on:click={handlePost} 
          disabled={isSubmitting || (!newMessage && !newFile)}
          class="inline-flex items-center gap-2 px-6 py-2 rounded-xl font-bold text-white transition-all duration-300
          bg-blue-600/80 hover:bg-blue-500 border border-blue-500/30 backdrop-blur-md
          shadow-[0_0_15px_rgba(59,130,246,0.4)] hover:shadow-[0_0_25px_rgba(59,130,246,0.6)]
          active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:bg-gray-500/20 group"
        >
          {#if isSubmitting}
            <Loader2 size={18} class="animate-spin text-white/80" />
          {:else}
            <span>Publier</span> 
            <Send size={16} class="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
          {/if}
        </button>
      </div>
    </div>

    <div class="space-y-6">
      {#if isLoading && logs.length === 0}
        <div class="flex justify-center py-10"><Loader2 class="animate-spin text-blue-600" /></div>
      {:else if logs.length === 0}
        <div class="text-center py-12 text-gray-500 bg-black/20 rounded-3xl border border-dashed border-white/5">Aucun message pour le moment.</div>
      {:else}
        {#each logs as log (log.id)}
          <div class="group bg-black/20 rounded-3xl p-6 border transition-all hover:bg-black/30 
            {log.is_urgent ? 'border-red-500/30 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-white/5'}"
            in:fly={{ y: 20, duration: 400 }}>
            
            <div class="flex justify-between items-start mb-4">
              <div class="flex items-center gap-3">
                {#if log.profiles?.avatar_url}
                 <img src={log.profiles.avatar_url} alt="avatar" class="w-10 h-10 rounded-full object-cover border border-white/10" />
                {:else}
                  <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 font-bold border border-blue-500/10">
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
                  <span class="text-xs text-gray-500">
                    {formatDate(log.created_at)}
                    {#if log.updated_at} <span class="italic ml-1 opacity-50">(Modifié)</span> {/if}
                  </span>
                </div>
              </div>

              {#if canEdit(log, userRole)}
                  <div class="flex gap-2">
                  <button on:click={() => openModal(log)} class="p-2 text-gray-400 hover:text-blue-400 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5" title="Modifier">
                    <Pencil size={16} />
                  </button>
                 <button on:click={() => deleteLog(log.id)} class="p-2 text-gray-400 hover:text-red-400 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5" title="Supprimer">
                    <Trash2 size={16} />
                  </button>
                </div>
              {/if}
            </div>

            <div class="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed mb-4 pl-[3.25rem]">
              {log.message_content}
            </div>

            {#if log.attachment_path}
              <div class="mb-4 pl-[3.25rem]">
                {#if log.attachment_type === 'image'}
                  <img src={getPublicUrl(log.attachment_path)} alt="Attachement" class="rounded-xl max-h-60 border border-white/10" />
                {:else}
                  <a href={getPublicUrl(log.attachment_path)} target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl text-sm font-medium hover:bg-white/10 transition-colors border border-white/5 text-gray-300">
                    <FileText size={16} /> Voir le fichier joint
                  </a>
                {/if}
              </div>
            {/if}

            <div class="flex gap-2 pt-4 border-t border-white/5 pl-[3.25rem]">
              {#each Object.entries(reactionConfig) as [emojiKey, config]}
                 <button 
                  type="button" 
                  on:click|preventDefault={() => toggleReaction(log.id, emojiKey, log.myReaction)}
                  class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border backdrop-blur-sm
                  {log.myReaction === emojiKey 
                    ? config.activeClass 
                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 hover:border-white/10'}"
                  title={emojiKey === '👍' ? 'Approuver' : emojiKey === '👀' ? 'Vu' : 'Important'}
                >
                  <svelte:component 
                    this={config.icon} 
                    size={14} 
                    class={log.myReaction === emojiKey ? 'scale-110 transition-transform' : ''} 
                  />
                  {#if log.reactionsMap[emojiKey] > 0}
                    <span>{log.reactionsMap[emojiKey]}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      {/if}

      {#if hasMore}
        <div class="flex justify-center pt-4">
          <button on:click={() => loadLogs()} disabled={isLoading} class="px-6 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-bold text-gray-400 hover:bg-white/10 hover:text-white transition-all">
            {isLoading ? 'Chargement...' : 'Voir plus anciens'}
          </button>
        </div>
      {/if}
    </div>
  </main>
  
  {#if editingLog}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" transition:fade>
      
      <div 
        class="w-full max-w-lg rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10 ring-1 ring-white/5 
        bg-gray-900/90 backdrop-blur-xl transition-all"
        transition:fly={{ y: 20, duration: 300 }}
      >
        
        <div class="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-white/5">
          <h2 class="text-xl font-bold text-gray-100 tracking-tight flex items-center gap-2">
            <Pencil size={18} class="text-blue-400" /> Modifier le message
          </h2>
          <button on:click={closeModal} class="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div class="p-6 space-y-5">
          <div>
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 ml-1">Contenu</label>
            <textarea 
              rows="5" 
              bind:value={editingLog.message_content} 
              class="w-full rounded-xl border border-white/10 bg-black/40 p-4 text-sm font-medium text-gray-200 placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 focus:bg-black/60 transition-all outline-none resize-none shadow-inner" 
              placeholder="Votre message..."
            ></textarea>
          </div>
          
          <div>
            <label class="flex items-center gap-3 p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-all bg-black/40 group">
              <div class="relative flex items-center">
                <input type="checkbox" bind:checked={editingLog.is_urgent} class="peer sr-only" />
                <div class="w-5 h-5 border-2 border-gray-500 rounded peer-checked:bg-red-500 peer-checked:border-red-500 transition-all"></div>
                <AlertTriangle size={12} class="absolute top-1 left-1 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
              </div>
              <span class="text-sm font-bold text-gray-400 group-hover:text-gray-200 transition-colors">
                Marquer comme <span class="{editingLog.is_urgent ? 'text-red-400' : ''}">Urgent</span>
              </span>
            </label>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-white/10 bg-white/5 flex justify-end gap-3 relative overflow-hidden">
          <div class="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none"></div>

          <button 
            on:click={closeModal} 
            class="px-5 py-2.5 text-sm font-medium text-gray-300 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 hover:text-white transition-all backdrop-blur-md"
          >
            Annuler
          </button>
          
          <button 
            on:click={saveEditedEntry} 
            disabled={isSubmitting} 
            class="px-5 py-2.5 text-sm font-bold text-white bg-blue-600/80 hover:bg-blue-500 border border-blue-500/30 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-md"
          >
            {#if isSubmitting}
                <Loader2 size={16} class="animate-spin" />
            {:else}
                <Save size={16} /> 
            {/if}
            Enregistrer
          </button>
        </div>

      </div>
    </div>
  {/if}
</div>

<style>
  /* --- CUSTOM FLATPICKR GLASSMORPHISM --- */
  
  /* Le conteneur principal du calendrier */
  :global(.flatpickr-calendar) {
    background: rgba(15, 23, 42, 0.85) !important; /* Fond sombre translucide */
    backdrop-filter: blur(12px) !important; /* Flou d'arrière-plan */
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
    border-radius: 16px !important;
    color: #e2e8f0 !important;
    font-family: inherit !important;
}

  /* La flèche du haut */
  :global(.flatpickr-calendar:before),
  :global(.flatpickr-calendar:after) {
    border-bottom-color: rgba(15, 23, 42, 0.85) !important;
}

  /* En-tête (Mois / Année) */
  :global(.flatpickr-months) {
    background: transparent !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
    padding-top: 10px !important;
}
  :global(.flatpickr-current-month .flatpickr-monthDropdown-months) {
    background: transparent !important;
    color: #fff !important;
    font-weight: 700 !important;
}
  :global(.flatpickr-current-month input.cur-year) {
    color: #fff !important;
    font-weight: 700 !important;
}
  :global(.flatpickr-prev-month), :global(.flatpickr-next-month) {
    fill: #94a3b8 !important; /* Gris clair */
  }
  :global(.flatpickr-prev-month:hover svg), :global(.flatpickr-next-month:hover svg) {
    fill: #60a5fa !important; /* Bleu au survol */
  }

  /* Jours de la semaine (Lun, Mar...) */
  :global(.flatpickr-weekdays) {
    background: transparent !important;
}
  :global(span.flatpickr-weekday) {
    color: #64748b !important; /* Gris muet */
    font-weight: 600 !important;
}

  /* Les jours (chiffres) */
  :global(.flatpickr-day) {
    color: #cbd5e1 !important; /* Texte clair */
    border-radius: 8px !important;
    border: 1px solid transparent !important;
    transition: all 0.2s ease !important;
}
  :global(.flatpickr-day:hover) {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: rgba(255, 255, 255, 0.1) !important;
}

  /* Jour sélectionné (Le Bleu Néon) */
  :global(.flatpickr-day.selected), 
  :global(.flatpickr-day.startRange), 
  :global(.flatpickr-day.endRange), 
  :global(.flatpickr-day.selected.inRange), 
  :global(.flatpickr-day.startRange.inRange), 
  :global(.flatpickr-day.endRange.inRange), 
  :global(.flatpickr-day.selected:focus), 
  :global(.flatpickr-day.startRange:focus), 
  :global(.flatpickr-day.endRange:focus), 
  :global(.flatpickr-day.selected:hover), 
  :global(.flatpickr-day.startRange:hover), 
  :global(.flatpickr-day.endRange:hover), 
  :global(.flatpickr-day.selected.prevMonthDay), 
  :global(.flatpickr-day.startRange.prevMonthDay), 
  :global(.flatpickr-day.endRange.prevMonthDay), 
  :global(.flatpickr-day.selected.nextMonthDay), 
  :global(.flatpickr-day.startRange.nextMonthDay), 
  :global(.flatpickr-day.endRange.nextMonthDay) {
    background: rgba(37, 99, 235, 0.8) !important; /* Bleu-600 avec transparence */
    box-shadow: 0 0 15px rgba(37, 99, 235, 0.5) !important; /* Lueur néon */
    border-color: transparent !important;
    color: #fff !important;
    font-weight: bold !important;
}

  /* Aujourd'hui */
  :global(.flatpickr-day.today) {
    border-color: rgba(96, 165, 250, 0.5) !important; /* Bordure bleu clair */
    color: #60a5fa !important;
}
  :global(.flatpickr-day.today:hover) {
    background: rgba(96, 165, 250, 0.1) !important;
    color: #fff !important;
}

  /* Jours désactivés / autre mois */
  :global(.flatpickr-day.flatpickr-disabled), 
  :global(.flatpickr-day.flatpickr-disabled:hover), 
  :global(.flatpickr-day.prevMonthDay), 
  :global(.flatpickr-day.nextMonthDay), 
  :global(.flatpickr-day.notAllowed), 
  :global(.flatpickr-day.notAllowed.prevMonthDay), 
  :global(.flatpickr-day.notAllowed.nextMonthDay) {
    color: #475569 !important; /* Gris très foncé */
  }
</style>