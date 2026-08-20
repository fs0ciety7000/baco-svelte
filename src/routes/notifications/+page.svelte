<script>
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';
  import { toast } from '$lib/stores/toast.js';
  import { fly, fade } from 'svelte/transition';
  import {
    Bell, Mail, MailOpen, Trash2, Loader2, Filter,
    CheckCheck, ShieldCheck, ClipboardPaste, X, Heart
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
      await loadNotifications();
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
      case 'mention': return Bell;
      case 'social': return Heart;
      case 'system': return ShieldCheck;
      case 'procedure': return ClipboardPaste;
      default: return Mail;
    }
  }

  function getIconColor(type) {
    switch(type) {
      case 'mention': return 'text-blue-400';
      case 'social': return 'text-pink-400';
      case 'system': return 'text-yellow-400';
      case 'procedure': return 'text-green-400';
      default: return 'text-gray-400';
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleString('fr-FR', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' 
    });
  }

  $: if (filterBy) {
    loadNotifications();
  }
</script>

<svelte:head>
    <title>Notifications - BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
    
    <header class="flex items-center gap-4 pb-6 border-b border-white/5" in:fly={{ y: -20, duration: 600 }}>
        <div class="p-3 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <Bell class="w-8 h-8"/>
        </div>
        <div>
            <h1 class="text-3xl font-bold tracking-tight text-gray-200">Centre de Notifications</h1>
            <p class="text-gray-500 text-sm mt-1">Vos alertes et messages importants.</p>
        </div>
    </header>

    <main class="max-w-4xl mx-auto space-y-6">
        
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-black/20 rounded-2xl border border-white/5 shadow-sm" in:fly={{ y: 20, duration: 600, delay: 100 }}>
            
            <div class="flex items-center gap-2">
                <Filter class="w-4 h-4 text-gray-500" />
                <select bind:value={filterBy} class="bg-black/30 border border-white/10 rounded-xl text-sm py-2 px-3 text-gray-300 focus:ring-2 focus:ring-blue-500/30 outline-none cursor-pointer hover:bg-white/5 transition-all">
                    <option value="all" class="bg-gray-900">Toutes</option>
                    <option value="unread" class="bg-gray-900">Non Lues</option>
                </select>
            </div>
            
            <div class="flex items-center gap-3">
                <button 
                    on:click={markAllAsRead} 
                    disabled={isLoading || notifications.filter(n => !n.is_read).length === 0}
                    class="flex items-center gap-2 px-4 py-2 text-sm bg-white/5 border border-white/10 text-gray-300 rounded-xl font-medium hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <CheckCheck class="w-4 h-4" />
                    Marquer tout lu
                </button>
            </div>
        </div>

        <div class="space-y-3">
            {#if isLoading}
                <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-500/50 w-10 h-10" /></div>
            {:else if notifications.length === 0}
                <div class="text-center py-12 text-gray-500 bg-black/20 rounded-2xl border border-dashed border-white/5">
                    <p>Aucune notification {filterBy === 'unread' ? 'non lue' : 'à afficher'} !</p>
                </div>
            {:else}
                {#each notifications as notif (notif.id)}
                    <div 
                        on:click={() => { 
                            if (notif.link_to) {
                                window.location.href = notif.link_to;
                            }
                            if (!notif.is_read) {
                                toggleReadStatus(notif.id, notif.is_read);
                            }
                        }}
                        class="flex items-start gap-4 p-4 rounded-2xl border transition-all duration-200 group cursor-pointer relative overflow-hidden
                                {notif.is_read 
                                    ? 'bg-black/20 border-white/5 hover:bg-black/30 opacity-70 hover:opacity-100' 
                                    : 'bg-blue-500/10 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)] hover:bg-blue-500/15'}"
                        in:fly={{ x: 20, duration: 400 }}
                    >
                        {#if !notif.is_read}
                            <div class="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_#3b82f6]"></div>
                        {/if}
                        
                        <div class="flex-shrink-0 pt-1 pl-2">
                            <svelte:component this={getIcon(notif.type)} class="w-5 h-5 {getIconColor(notif.type)}" />
                        </div>

                        <div class="flex-grow min-w-0">
                            <p class="font-bold text-gray-200 truncate">{notif.title || 'Notification'}</p>
                            <p class="text-sm text-gray-400 line-clamp-2 mt-0.5">{notif.message || 'Détails non disponibles.'}</p>
                            <p class="text-[10px] mt-2 text-gray-500 font-mono">{formatDate(notif.created_at)}</p>
                        </div>
                        
                        <div class="flex-shrink-0 flex gap-2 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            
                            <button 
                                on:click|stopPropagation={() => toggleReadStatus(notif.id, notif.is_read)} 
                                title={notif.is_read ? 'Marquer Non Lu' : 'Marquer Lu'}
                                class="p-2 rounded-xl transition-colors border border-white/5 {notif.is_read 
                                    ? 'text-gray-500 hover:text-blue-400 hover:bg-white/5' 
                                    : 'text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20'}"
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
                                class="p-2 rounded-xl text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                {/each}
            {/if}
        </div>

    </main>
</div>