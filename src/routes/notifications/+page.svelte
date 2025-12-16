<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js';
  import { 
    Bell, Mail, MailOpen, Trash2, Loader2, Filter, 
    CheckCheck, ShieldCheck, ClipboardPaste, X
  } from 'lucide-svelte';

  // --- ÉTAT ---
  let isLoading = true;
  let notifications = [];
  let filterBy = 'unread'; // 'all', 'unread'
  
  // --- FONCTIONS SUPABASE ---

  onMount(async () => {
    await loadNotifications();
  });

  async function loadNotifications() {
    isLoading = true;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      isLoading = false;
      return;
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id_target', user.id)
      .order('created_at', { ascending: false });

    // Appliquer le filtre
    if (filterBy === 'unread') {
      query = query.eq('is_read', false);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error("Erreur chargement notifications:", error);
      toast.error("Erreur lors du chargement des notifications.");
    } else {
      notifications = data || [];
    }
    isLoading = false;
  }

  async function toggleReadStatus(notifId, currentState) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: !currentState })
      .eq('id', notifId);

    if (error) {
      toast.error("Erreur de mise à jour.");
    } else {
      // Recharger pour mettre à jour la liste et le compteur dans la navigation
      await loadNotifications();
      // On déclenche un événement factice pour forcer la mise à jour du Nav.svelte
      window.dispatchEvent(new CustomEvent('notificationStatusChanged'));
    }
  }

  async function deleteNotification(notifId) {
    if (!confirm("Voulez-vous vraiment supprimer cette notification ?")) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notifId);

    if (error) {
      toast.error("Erreur de suppression.");
    } else {
      toast.success("Notification supprimée.");
      await loadNotifications();
      window.dispatchEvent(new CustomEvent('notificationStatusChanged'));
    }
  }
  
  async function markAllAsRead() {
    if (notifications.filter(n => !n.is_read).length === 0) return;

    // Met à jour toutes les notifications non lues pour l'utilisateur
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id_target', user.id)
      .eq('is_read', false);

    if (error) {
      toast.error("Erreur lors du marquage.");
    } else {
      toast.success("Toutes les notifications ont été marquées comme lues.");
      await loadNotifications();
      window.dispatchEvent(new CustomEvent('notificationStatusChanged'));
    }
  }

  // --- UI HELPERS ---

  function getIcon(type) {
    switch(type) {
      case 'mention':
        return Bell;
      case 'system':
        return ShieldCheck;
      case 'procedure':
        return ClipboardPaste;
      default:
        return Mail;
    }
  }

  function getIconColor(type) {
    switch(type) {
      case 'mention':
        return 'text-blue-500';
      case 'system':
        return 'text-yellow-500';
      case 'procedure':
        return 'text-green-500';
      default:
        return 'text-gray-400';
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('fr-FR', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
  }

  // Quand le filtre change, on recharge les notifications
  $: if (filterBy) {
    loadNotifications();
  }
</script>

<svelte:head>
    <title>Notifications - BACO</title>
</svelte:head>

<div class="min-h-screen bg-gray-50/50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-10">
    <main class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        <header class="flex items-center gap-4 border-b pb-4 border-gray-200 dark:border-gray-700">
            <Bell class="w-8 h-8 text-blue-600"/>
            <h1 class="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100">Centre de Notifications</h1>
        </header>

        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
            
            <div class="flex items-center gap-2">
                <Filter class="w-4 h-4 text-gray-500" />
                <select bind:value={filterBy} class="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-sm py-1.5 px-3">
                    <option value="all">Toutes</option>
                    <option value="unread">Non Lues</option>
                </select>
            </div>
            
            <div class="flex items-center gap-3">
                <button 
                    on:click={markAllAsRead} 
                    disabled={isLoading || notifications.filter(n => !n.is_read).length === 0}
                    class="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                    <CheckCheck class="w-4 h-4" />
                    Marquer tout lu
                </button>
            </div>
        </div>

        <div class="space-y-3">
            {#if isLoading}
                <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-600" /></div>
            {:else if notifications.length === 0}
                <div class="text-center py-10 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <p>Aucune notification {filterBy === 'unread' ? 'non lue' : 'à afficher'} !</p>
                </div>
            {:else}
                {#each notifications as notif (notif.id)}
                    <a 
                        href={notif.link_to || '#'} 
                        on:click|preventDefault={() => { 
                            if (notif.link_to) {
                                window.location.href = notif.link_to;
                            }
                            // Marquer lu uniquement si elle ne l'est pas
                            if (!notif.is_read) {
                                toggleReadStatus(notif.id, notif.is_read);
                            }
                        }}
                        class="flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 group
                                {notif.is_read 
                                    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md' 
                                    : 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50 shadow-md hover:bg-blue-100/50 dark:hover:bg-blue-900/30'}"
                    >
                        
                        <div class="flex-shrink-0 pt-1">
                            <svelte:component this={getIcon(notif.type)} class="w-5 h-5 {getIconColor(notif.type)}" />
                        </div>

                        <div class="flex-grow min-w-0">
                            <p class="font-semibold text-gray-900 dark:text-gray-100 truncate">{notif.title || 'Notification'}</p>
                            <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">{notif.message || 'Détails non disponibles.'}</p>
                            <p class="text-xs mt-1 text-gray-500 dark:text-gray-400">{formatDate(notif.created_at)}</p>
                        </div>
                        
                        <div class="flex-shrink-0 flex gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            
                            <button 
                                on:click|stopPropagation={() => toggleReadStatus(notif.id, notif.is_read)} 
                                title={notif.is_read ? 'Marquer Non Lu' : 'Marquer Lu'}
                                class="p-1.5 rounded-full transition-colors {notif.is_read 
                                    ? 'text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700' 
                                    : 'text-blue-600 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800/40 dark:hover:bg-blue-800/60'}"
                            >
                                {#if notif.is_read}
                                    <MailOpen class="w-4 h-4" />
                                {:else}
                                    <Mail class="w-4 h-4" />
                                {/if}
                            </button>

                            <button 
                                on:click|stopPropagation={() => deleteNotification(notif.id)} 
                                title="Supprimer"
                                class="p-1.5 rounded-full text-gray-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </div>
                    </a>
                {/each}
            {/if}
        </div>

    </main>
</div>