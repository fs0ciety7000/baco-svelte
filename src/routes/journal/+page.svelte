<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js'; 
  import { openConfirmModal } from '$lib/stores/modal.js';
  import { 
    Send, Paperclip, Search, Filter, AlertTriangle, BookCopy, 
    Trash2, Pencil, FileText, Image, Loader2, X, Save 
  } from 'lucide-svelte';

  // --- CONFIG ---
  const ROWS_PER_PAGE = 20;

  // --- ÉTAT ---
  let logs = [];
  let authors = [];
  let isLoading = true;
  let isSubmitting = false;
  
  // User & Rôles
  let currentUser = null;
  let userRole = 'user'; // 'user', 'moderator', 'admin'

  // --- NOUVEAU : Utilisateurs pour le tagging et l'Auto-Complétion ---
  let allUsers = []; 
  let textareaElement; // Référence à la zone de texte
  let showSuggestions = false;
  let filteredUsers = [];
  let tagSearchQuery = '';
  // --- FIN NOUVEAU ---

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

  onMount(async () => {
    await loadUserAndRole();
    // MODIFIÉ : Chargement de tous les profils pour le tagging et le filtre
    await Promise.all([loadAllProfiles(), loadLogs(true)]);
  });

  // --- AUTH & RÔLES ---

  async function loadUserAndRole() {
    const { data: { user } } = await supabase.auth.getUser();
    currentUser = user;

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name, email')
        .eq('id', user.id)
        .single();
      if (profile) {
        userRole = profile.role || 'user';
        currentUser = { ...user, ...profile };
      }
    }
  }

  function canEdit(entry) {
    if (!currentUser) return false;
    return entry.user_id === currentUser.id || ['admin', 'moderator'].includes(userRole);
  }
  
  // --- CHARGEMENT ---
  
  // MODIFIÉ : Correction de la requête RLS pour éviter l'erreur 400
  async function loadAllProfiles() {
    // RLS FIX: Sélectionne uniquement les champs non sensibles (id, full_name) + avatar_url pour l'UI
    const { data } = await supabase.from('profiles').select('id, full_name, avatar_url').order('full_name', { ascending: true });
    if (data) {
      allUsers = data; 
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
  
  // --- NOUVEAU : Logique d'Auto-Complétion et de Tagging ---

  // Gère l'affichage de l'auto-complétion
  function handleInput(e) {
    const value = e.target.value;
    const cursor = e.target.selectionStart;

    // 1. Trouver le dernier '@' avant le curseur
    const textBeforeCursor = value.substring(0, cursor);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex === -1) {
      showSuggestions = false;
      return;
    }

    // 2. Extraire la requête de recherche
    // Récupère tout ce qui suit le dernier '@' jusqu'au curseur
    const query = textBeforeCursor.substring(lastAtIndex + 1);
    
    // Si la requête contient une nouvelle ligne ou plusieurs espaces après le '@', on arrête
    if (query.includes('\n')) {
        showSuggestions = false;
        return;
    }
    
    tagSearchQuery = query.trim();

    // 3. Filtrer les utilisateurs
    if (tagSearchQuery.length >= 0) {
      const lowerQuery = tagSearchQuery.toLowerCase();
      
      // Filtrer sur le début du full_name
      filteredUsers = allUsers.filter(user => 
        user.full_name?.toLowerCase().startsWith(lowerQuery)
      ).slice(0, 5); // Limiter à 5 suggestions
      showSuggestions = filteredUsers.length > 0 || tagSearchQuery.length > 0;
    } else {
      // Afficher tous les utilisateurs (ou les 5 premiers) si l'utilisateur vient de taper '@'
      filteredUsers = allUsers.slice(0, 5); 
      showSuggestions = true;
    }

    // Cacher les suggestions si l'utilisateur a tapé un espace après un '@' vide, ou si la recherche est vide
    if(tagSearchQuery.length === 0 && query.trim() !== query) {
         showSuggestions = false;
    }
  }

  // Insère le nom complet de l'utilisateur à la position du tag
  function selectUser(user) {
    if (!textareaElement) return;

    const value = newMessage;
    const cursor = textareaElement.selectionStart;
    const textBefore = value.substring(0, cursor);
    const lastAtIndex = textBefore.lastIndexOf('@');

    if (lastAtIndex === -1) return;

    // Déterminer la partie à remplacer (du '@' jusqu'au curseur)
    const startReplaceIndex = lastAtIndex;

    // Le format de tag utilisé pour la détection est @Nom Prénom 
    const tagToInsert = `@${user.full_name} `; 
    
    // Nouvelle construction du message
    const newText = value.substring(0, startReplaceIndex) + tagToInsert + value.substring(cursor);
    newMessage = newText;

    // Positionner le curseur après le nom inséré
    const newCursorPosition = startReplaceIndex + tagToInsert.length;

    // Utiliser un timeout pour s'assurer que Svelte met à jour la valeur avant de repositionner le curseur
    setTimeout(() => {
        textareaElement.selectionStart = newCursorPosition;
        textareaElement.selectionEnd = newCursorPosition;
        textareaElement.focus();
    }, 0); 

    showSuggestions = false;
  }
  
 // --- NOUVEAU : Fonction de traitement des tags et de notification (CORRIGÉE) ---
async function processTagsAndNotify(message) {
    if (!message || !currentUser) return;

    // Regex améliorée: capture le @ et tout ce qui suit (lettres, chiffres, espaces, tirets, apostrophes, accents)
    // jusqu'à ce qu'un autre caractère soit trouvé ou que la chaîne se termine.
    const tagRegex = /@([\w\s'-]+)/g; 
    let match;
    const taggedUserIds = new Set();
    
    while ((match = tagRegex.exec(message)) !== null) {
        // La chaîne capturée par le groupe 1, nettoyée des espaces superflus
        const taggedName = match[1].trim(); 

        // 2. Chercher l'ID correspondant
        // Utilise trim() et toLowerCase() sur les deux côtés pour une correspondance tolérante
        const foundUser = allUsers.find(u => 
            u.full_name?.trim().toLowerCase() === taggedName.toLowerCase()
        );
        
        // Ajouter l'ID s'il est trouvé et n'est pas l'utilisateur courant
        if (foundUser && foundUser.id !== currentUser.id) {
            taggedUserIds.add(foundUser.id);
        }
    }

    if (taggedUserIds.size === 0) return;
    
    // 4. Préparer et insérer les notifications
    const senderName = currentUser.full_name || currentUser.email;
    const notificationMessage = message.substring(0, 100) + (message.length > 100 ? '...' : '');

    const notificationsToInsert = Array.from(taggedUserIds).map(userId => ({
        user_id_target: userId,
        title: `Vous avez été mentionné par ${senderName}`,
        message: notificationMessage,
        type: 'mention',
        link_to: `/journal`, 
        is_read: false
    }));

    // Insérer dans Supabase
    const { error } = await supabase
        .from('notifications')
        .insert(notificationsToInsert);

    if (error) {
        console.error("Erreur insertion notifications:", error);
    }
}
  // --- FIN NOUVEAU : Logique d'Auto-Complétion et de Tagging ---


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
        // ... (Upload de fichier) ...
        const ext = newFile.name.split('.').pop();
        const fileName = `journal/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${ext}`;
        const { error: upError } = await supabase.storage.from('documents').upload(fileName, newFile);
        if (upError) throw upError;
        attachmentPath = fileName;
        attachmentType = newFile.type.startsWith('image/') ?
        'image' : 'file';
      }

      const { error } = await supabase.from('main_courante').insert({
        message_content: newMessage,
        is_urgent: isUrgent,
        user_id: currentUser.id,
        attachment_path: attachmentPath,
        attachment_type: attachmentType
      });
      if (error) throw error;

      // Traiter les tags après la publication réussie
      await processTagsAndNotify(newMessage);
      
      newMessage = "";
      isUrgent = false;
      newFile = null;
      if (fileInput) fileInput.value = "";
      loadLogs(true);
      toast.success("Le message a été publié avec succès.");

    } catch (e) {
      toast.error("Erreur lors de la publication: " + e.message);
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
      toast.success("Le message a été modifié avec succès.");

    } catch (e) {
      toast.error("Erreur lors de la modification: " + e.message);
    } finally {
      isSubmitting = false;
    }
  }
  
 // Fonction qui exécute la suppression après confirmation
  function executeDeleteLog(id) {
    return async () => {
      const { error } = await supabase.from('main_courante').delete().eq('id', id);
      
      if (!error) {
        loadLogs(true);
        toast.success("Le message a été supprimé du journal.");
      } else {
        toast.error("Erreur: " + error.message);
      }
    };
  }
  
  // Fonction qui appelle la modale de confirmation
  async function deleteLog(id) {
    openConfirmModal(
        "Voulez-vous vraiment supprimer ce message du journal ? Cette action est irréversible.",
        executeDeleteLog(id) 
    );
  }

  async function toggleReaction(logId, emoji, currentReaction) {
    if (!currentUser) return;
    if (currentReaction === emoji) {
      await supabase.from('log_reactions').delete().match({ log_id: logId, user_id: currentUser.id });
    } else {
      await supabase.from('log_reactions').upsert(
        { log_id: logId, user_id: currentUser.id, emoji }, 
        { onConflict: 'log_id, user_id' }
      );
    }
    loadLogs(true); 
  }

  // --- UI HELPERS ---

  function openModal(log) {
    editingLog = { ...log };
  }
  function closeModal() {
    editingLog = null;
  }

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

  // Styles CSS corrigés pour le mode sombre (Background explicite)
  const inputClass = "block w-full rounded-2xl border-gray-200 bg-white p-3 text-sm font-medium focus:border-blue-500 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 transition-shadow shadow-sm";

</script>

<div class="min-h-screen bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-10">
  
  <header class="sticky top-0 z-30 w-full bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 rounded-b-3xl transition-colors duration-300">
    <div class="max-w-3xl mx-auto px-6 h-20 flex items-center justify-between">
      <h1 class="text-3xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-3">
    <BookCopy class="w-8 h-8 text-blue-500" />
    Journal
</h1>
      
      <div class="flex items-center gap-2">
        <div class="relative hidden sm:block">
          <select bind:value={selectedAuthor} on:change={() => loadLogs(true)} class="pl-3 pr-8 py-1.5 text-xs rounded-xl bg-gray-100 dark:bg-gray-700 border-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-gray-700 dark:text-gray-200">
            <option value="all">Tous les auteurs</option>
            {#each authors as author}
              <option value={author.id}>{author.full_name}</option>
            {/each}
          </select>
        </div>
        <input type="date" bind:value={selectedDate} on:change={() => loadLogs(true)} class="py-1.5 px-3 text-xs rounded-xl bg-gray-100 dark:bg-gray-700 border-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-gray-200" />
      </div>
    </div>
  </header>

  <main class="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-8">
    
    <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 transition-all focus-within:shadow-md focus-within:border-blue-300 relative">
      <textarea 
        bind:value={newMessage} 
        bind:this={textareaElement}
        on:input={handleInput}
        rows="3" 
        class="w-full bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 rounded-2xl p-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none text-base placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white transition-colors" 
        placeholder="Quoi de neuf aujourd'hui ? (Utilisez @Nom Prénom pour taguer un utilisateur, ex: @Jean Dupont)"
      ></textarea>
      
      {#if showSuggestions}
        <div class="absolute z-40 top-[5.25rem] left-4 right-4 mt-1 bg-white dark:bg-gray-700 rounded-xl shadow-lg border border-gray-200 dark:border-gray-600 max-h-48 overflow-y-auto">
          {#each filteredUsers as user}
            <button on:click={() => selectUser(user)} class="w-full text-left flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer">
              {#if user.avatar_url}
                <img src={user.avatar_url} alt="avatar" class="w-6 h-6 rounded-full object-cover" />
              {:else}
                <div class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300 text-xs font-bold">
                  {user.full_name?.charAt(0) || '?'}
                </div>
              {/if}
              <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{user.full_name}</span>
            </button>
          {:else}
            <div class="p-3 text-sm text-gray-500 dark:text-gray-400">Aucun utilisateur trouvé.</div>
          {/each}
        </div>
      {/if}
      {#if newFile}
        <div class="flex items-center gap-2 mb-3 mt-3 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-xl text-sm text-blue-700 dark:text-blue-300">
          <Paperclip size={14} /> 
          <span class="truncate max-w-xs">{newFile.name}</span>
          <button on:click={() => { newFile = null; fileInput.value = ""; }} class="ml-auto text-blue-500 hover:text-blue-700"><X size={14}/></button>
        </div>
      {/if}

      <div class="flex items-center justify-between pt-3">
        <div class="flex items-center gap-3">
          <label class="p-2 text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full cursor-pointer transition-colors" title="Joindre un fichier">
            <Paperclip size={20} />
            <input type="file" class="hidden" bind:this={fileInput} on:change={handleFileSelect} />
          </label>
          
          <button 
            on:click={() => isUrgent = !isUrgent} 
            class="p-2 rounded-full transition-colors {isUrgent ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700'}"
            title="Marquer comme Urgent"
          >
            <AlertTriangle size={20} />
          </button>
        </div>

        <button 
          on:click={handlePost} 
          disabled={isSubmitting || (!newMessage && !newFile)}
          class="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-sm hover:shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isSubmitting}
            <Loader2 size={18} class="animate-spin" />
          {:else}
            <span>Publier</span> <Send size={16} />
          {/if}
        </button>
      </div>
    </div>

    <div class="space-y-4">
      {#if isLoading && logs.length === 0}
        <div class="flex justify-center py-10"><Loader2 class="animate-spin text-blue-600" /></div>
      {:else if logs.length === 0}
        <div class="text-center py-10 text-gray-500">Aucun message pour le moment.</div>
      {:else}
        {#each logs as log}
          <div class="group bg-white dark:bg-gray-800 rounded-3xl p-5 border shadow-sm transition-all hover:shadow-md 
            {log.is_urgent ? 'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/10' : 'border-gray-200 dark:border-gray-700'}">
            
            <div class="flex justify-between items-start mb-3">
              <div class="flex items-center gap-3">
                {#if log.profiles?.avatar_url}
                  <img src={log.profiles.avatar_url} alt="avatar" class="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
                {:else}
                  <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold">
                    {log.profiles?.full_name?.charAt(0) || '?'}
                  </div>
                {/if}
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-bold text-gray-900 dark:text-white">{log.profiles?.full_name || 'Inconnu'}</span>
                    {#if log.is_urgent}
                      <span class="px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 text-[10px] font-extrabold uppercase animate-pulse">Urgent</span>
                    {/if}
                  </div>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(log.created_at)}
                    {#if log.updated_at} <span class="italic ml-1">(Modifié)</span> {/if}
                  </span>
                </div>
              </div>

              {#if canEdit(log)}
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button on:click={() => openModal(log)} class="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button on:click={() => deleteLog(log.id)} class="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              {/if}
            </div>

            <div class="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap leading-relaxed mb-3 pl-[3.25rem]">
              {log.message_content}
            </div>

            {#if log.attachment_path}
              <div class="mb-4 pl-[3.25rem]">
                {#if log.attachment_type === 'image'}
                  <img src={getPublicUrl(log.attachment_path)} alt="Attachement" class="rounded-xl max-h-60 border border-gray-200 dark:border-gray-700" />
                {:else}
                  <a href={getPublicUrl(log.attachment_path)} target="_blank" class="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    <FileText size={16} /> Voir le fichier joint
                  </a>
                {/if}
              </div>
            {/if}

            <div class="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 pl-[3.25rem]">
              {#each ['👍', '👀', '⚠️'] as emoji}
                <button 
                  on:click={() => toggleReaction(log.id, emoji, log.myReaction)}
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                  {log.myReaction === emoji 
                    ? 'bg-blue-100 border-blue-200 text-blue-700 dark:bg-blue-900/40 dark:border-blue-800 dark:text-blue-300' 
                    : 'bg-transparent border-transparent text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-200 dark:hover:border-gray-600'}"
                >
                  <span>{emoji}</span>
                  {#if log.reactionsMap[emoji] > 0}
                    <span>{log.reactionsMap[emoji]}</span>
                  {/if}
                </button>
              {/each}
            </div>

          </div>
        {/each}
      {/if}

      {#if hasMore}
        <div class="flex justify-center pt-4">
          <button on:click={() => loadLogs()} disabled={isLoading} class="px-6 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-bold text-gray-600 dark:text-gray-300 shadow-sm hover:shadow hover:text-blue-600 dark:hover:text-blue-400 transition-all">
            {isLoading ? 'Chargement...' : 'Voir plus anciens'}
          </button>
        </div>
      {/if}
    </div>
  </main>
  
  {#if editingLog}
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div class="absolute inset-0 bg-gray-900/60 backdrop-blur-md transition-opacity" on:click={closeModal}></div>
      <div class="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 dark:border-gray-700">
        
        <div class="flex items-center justify-between px-8 py-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">Modifier le message</h2>
          <button on:click={closeModal} class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X size={24} /></button>
        </div>
        
        <div class="p-8 bg-gray-50/50 dark:bg-gray-900/50 space-y-4">
          <div>
            <label class="block text-xs font-extrabold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Message</label>
            <textarea 
              rows="5" 
              bind:value={editingLog.message_content} 
              class="{inputClass} resize-none" 
              placeholder="Votre message..."
            ></textarea>
          </div>
          
          <div>
            <label class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-2xl cursor-pointer hover:bg-white dark:hover:bg-gray-800 transition-colors bg-white/50 dark:bg-gray-800/50">
              <input type="checkbox" bind:checked={editingLog.is_urgent} class="w-5 h-5 text-red-600 rounded-md border-gray-300 focus:ring-red-500" />
              <span class="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <AlertTriangle size={16} class={editingLog.is_urgent ? 'text-red-500' : 'text-gray-400'} />
                Marquer comme Urgent
              </span>
            </label>
          </div>
        </div>

        <div class="px-8 py-5 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 z-10">
          <button on:click={closeModal} class="px-6 py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 hover:shadow-sm transition-all">Annuler</button>
          <button on:click={saveEditedEntry} disabled={isSubmitting} class="px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 flex items-center gap-2 shadow-md hover:shadow-lg transition-all transform active:scale-95 disabled:opacity-50">
            <Save size={18} /> Enregistrer
          </button>
        </div>

      </div>
    </div>
  {/if}
</div>