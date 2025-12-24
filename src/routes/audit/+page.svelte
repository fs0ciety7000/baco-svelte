<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabase } from '$lib/supabase';
  import { fly, fade, slide } from 'svelte/transition';
  import { 
    FileClock, Search, Filter, Calendar, User, 
    PlusCircle, Pencil, Trash2, Shield, LogIn, Info, 
    Loader2, RefreshCw, ChevronDown, ChevronUp, Database
  } from 'lucide-svelte';

  // --- CONFIG ---
  const ROWS_PER_PAGE = 25;

  // --- ÉTAT ---
  let logs = [];
  let users = [];
  let isLoading = true;
  let hasMore = true;
  let currentPage = 0;
  
  // Gestion JSON
  let expandedRows = new Set();

  // Filtres
  let filters = {
    search: "",
    action: "all",
    table: "all",
    userId: "all",
    dateStart: ""
  };

  let uniqueTables = [];

  onMount(async () => {
    await checkAdminAccess();
    await loadUsersList();
    loadLogs(true);
  });

  // --- SÉCURITÉ ---
  async function checkAdminAccess() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return goto('/');
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      goto('/');
    }
  }

  // --- CHARGEMENT ---

  async function loadUsersList() {
    const { data } = await supabase.from('profiles').select('id, full_name').order('full_name');
    if (data) users = data;
  }

  async function loadLogs(reset = false) {
    if (reset) {
      logs = [];
      currentPage = 0;
      hasMore = true;
      expandedRows = new Set();
    }
    
    isLoading = true;
    const from = currentPage * ROWS_PER_PAGE;
    const to = from + ROWS_PER_PAGE - 1;

    let query = supabase
      .from('audit_logs')
      .select(`
        *,
        profiles ( full_name, avatar_url )
      `)
      .order('timestamp', { ascending: false })
      .range(from, to);

    if (filters.search) query = query.or(`record_id.ilike.%${filters.search}%,changes.ilike.%${filters.search}%`);
    if (filters.action !== 'all') query = query.eq('action_type', filters.action);
    if (filters.table !== 'all') query = query.eq('table_name', filters.table);
    if (filters.userId !== 'all') query = query.eq('user_id', filters.userId);
    if (filters.dateStart) query = query.gte('timestamp', `${filters.dateStart}T00:00:00`);

    const { data, error } = await query;

    if (error) {
      console.error("Erreur logs:", error);
    } else {
      if (data.length < ROWS_PER_PAGE) hasMore = false;
      
      logs = reset ? data : [...logs, ...data];
      
      const tables = new Set([...uniqueTables, ...data.map(l => l.table_name)]);
      uniqueTables = Array.from(tables).sort();
      
      currentPage++;
    }
    isLoading = false;
  }

  // --- UI HELPERS ---

  function toggleDetails(id) {
    if (expandedRows.has(id)) {
      expandedRows.delete(id);
    } else {
      expandedRows.add(id);
    }
    expandedRows = new Set(expandedRows);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('fr-BE', { 
      day: '2-digit', month: '2-digit', year: '2-digit', 
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  function getActionStyle(action) {
    if (!action) return {};
    const a = action.toUpperCase();
    
    if (a === 'INSERT') return { 
      class: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: PlusCircle, label: 'Ajout'
    };
    if (a === 'UPDATE') return { 
      class: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      icon: Pencil, label: 'Modif'
    };
    if (a === 'DELETE') return { 
      class: 'bg-red-500/20 text-red-400 border-red-500/30',
      icon: Trash2, label: 'Suppr'
    };
    
    return { 
      class: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      icon: Info, label: a
    };
  }

  function formatJSON(json) {
    try {
      if (typeof json === 'string') return json;
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return json;
    }
  }

  // Styles Inputs Glass Thémés
  const selectClass = "block w-full rounded-xl border-white/10 bg-black/40 text-sm text-gray-200 focus:ring-2 focus:border-transparent transition-all outline-none p-2.5 shadow-sm";
  const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 text-sm text-gray-200 placeholder-gray-600 focus:ring-2 focus:border-transparent transition-all outline-none p-2.5 shadow-sm";
  const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 ml-1";


</script>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
  
  <header class="flex items-center justify-between pb-6 border-b border-white/5" in:fly={{ y: -20, duration: 600 }} style="--primary-rgb: var(--color-primary);">
    <div class="flex items-center gap-3">
        <div class="p-3 rounded-xl border transition-all duration-500"
             style="background-color: rgba(var(--primary-rgb), 0.1); color: rgb(var(--primary-rgb)); border-color: rgba(var(--primary-rgb), 0.2); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.15);">
          <FileClock size={32} />
        </div>
        <div>
          <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Audit Logs</h1>
          <p class="text-gray-500 text-sm mt-1">Traçabilité et historique système.</p>
        </div>
    </div>
    <button on:click={() => loadLogs(true)} class="p-2 text-gray-400 hover:bg-white/10 rounded-xl transition-all border border-white/5" 
            style="--hover-col: rgb(var(--primary-rgb));"
            title="Rafraîchir">
      <RefreshCw size={20} class="{isLoading ? 'animate-spin' : ''} transition-colors" style="color: {isLoading ? 'rgb(var(--primary-rgb))' : ''}" />
    </button>
  </header>

  <main class="space-y-6" style="--primary-rgb: var(--color-primary);">
    
    <div class="bg-black/20 border border-white/5 rounded-3xl p-6 shadow-sm" in:fly={{ y: 20, duration: 600, delay: 100 }}>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5 items-end">
        
        <div class="lg:col-span-2">
          <label class={labelClass}>Recherche</label>
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500 group-focus-within:text-themed transition-colors"><Search size={16} /></div>
            <input type="text" bind:value={filters.search} on:change={() => loadLogs(true)} placeholder="ID, Contenu..." class="{inputClass} pl-9" style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);" />
          </div>
        </div>

        <div>
          <label class={labelClass}>Action</label>
          <select bind:value={filters.action} on:change={() => loadLogs(true)} class={selectClass} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
            <option value="all" class="bg-gray-900">Toutes</option>
            <option value="INSERT" class="bg-gray-900 text-green-400">Ajout</option>
            <option value="UPDATE" class="bg-gray-900 text-themed">Modification</option>
            <option value="DELETE" class="bg-gray-900 text-red-400">Suppression</option>
          </select>
        </div>

        <div>
          <label class={labelClass}>Table</label>
          <select bind:value={filters.table} on:change={() => loadLogs(true)} class={selectClass} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
            <option value="all" class="bg-gray-900">Toutes</option>
            {#each uniqueTables as t}
              <option value={t} class="bg-gray-900">{t}</option>
            {/each}
          </select>
        </div>

        <div>
          <label class={labelClass}>Utilisateur</label>
          <select bind:value={filters.userId} on:change={() => loadLogs(true)} class={selectClass} style="--tw-ring-color: rgba(var(--primary-rgb), 0.3);">
            <option value="all" class="bg-gray-900">Tous</option>
            {#each users as u}
              <option value={u.id} class="bg-gray-900">{u.full_name || 'Inconnu'}</option>
            {/each}
          </select>
        </div>

      </div>
    </div>

    <div class="space-y-4">
      {#if isLoading && logs.length === 0}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin themed-spinner w-10 h-10" /></div>
      {:else if logs.length === 0}
        <div class="text-center py-20 text-gray-500 bg-black/20 rounded-3xl border border-dashed border-white/10">Aucun historique trouvé.</div>
      {:else}
        {#each logs as log (log.id)}
          {@const style = getActionStyle(log.action_type)}
          {@const finalClass = log.action_type === 'UPDATE' ? 'bg-themed-soft text-themed border-themed-soft' : style.class}
          
          <div class="bg-black/20 border border-white/5 hover:border-white/10 rounded-2xl overflow-hidden transition-all hover:bg-white/[0.02]" in:fly={{ y: 20, duration: 400 }}>
            
            <div 
              class="flex flex-wrap md:flex-nowrap items-center justify-between p-4 gap-4 cursor-pointer"
              on:click={() => toggleDetails(log.id)}
            >
              
          <div class="flex items-center gap-4 min-w-[200px]">
  <div class="flex-shrink-0">
    {#if log.profiles?.avatar_url}
      <img src={log.profiles.avatar_url} alt="" class="w-10 h-10 rounded-full border border-white/10 object-cover shadow-sm">
    {:else}
      <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-xs font-bold text-gray-400 border border-white/5">
        {log.profiles?.full_name?.[0] || '?'}
      </div>
    {/if}
  </div>
  <div>
    <p class="text-sm font-bold text-gray-200">
      {#if log.profiles?.full_name}
        {log.profiles.full_name}
      {:else if log.user_id}
        <span class="text-xs font-mono text-gray-500">UID: {log.user_id.slice(0,8)}...</span>
      {:else}
        Système
      {/if}
    </p>
    <p class="text-xs text-gray-500 font-mono mt-0.5">{formatDate(log.timestamp)}</p>
  </div>
</div>

              <div class="flex items-center gap-3 flex-grow">
                <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border {finalClass} shadow-sm backdrop-blur-sm">
                  <svelte:component this={style.icon} size={14} />
                  {style.label}
                </span>
                <span class="text-gray-600 text-xs uppercase font-bold tracking-wider">sur</span>
                <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs font-mono text-gray-300">
                  <Database size={12} class="text-gray-500" /> {log.table_name}
                </span>
                <span class="text-xs text-gray-500 font-mono">#{log.record_id}</span>
              </div>

              <div class="text-gray-500 hover:text-white transition-colors">
                {#if expandedRows.has(log.id)} <ChevronUp size={20}/> {:else} <ChevronDown size={20}/> {/if}
              </div>
            </div>

            {#if expandedRows.has(log.id)}
              <div class="bg-black/30 border-t border-white/5 p-4" transition:slide>
                <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Info size={12} class="text-themed"/> Détails JSON
                </h4>
                <div class="bg-[#0f1115] rounded-xl p-4 border border-white/10 overflow-x-auto shadow-inner">
                  <pre class="text-xs font-mono whitespace-pre-wrap leading-relaxed" style="color: rgba(var(--primary-rgb), 0.9);">{formatJSON(log.changes)}</pre>
                </div>
              </div>
            {/if}

          </div>
        {/each}
      {/if}

      {#if hasMore}
        <div class="flex justify-center pt-6">
          <button on:click={() => loadLogs()} disabled={isLoading} class="px-6 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 hover:text-white rounded-full text-sm font-bold text-gray-400 transition-all flex items-center gap-2">
            {#if isLoading} <Loader2 class="animate-spin themed-spinner" size={16}/> Chargement... {:else} Charger plus d'historique {/if}
          </button>
        </div>
      {/if}
    </div>

  </main>
</div>

<style>
  .themed-spinner { color: rgb(var(--primary-rgb)); }
  .text-themed { color: rgb(var(--primary-rgb)); }
  .bg-themed-soft { background-color: rgba(var(--primary-rgb), 0.15); }
  .border-themed-soft { border-color: rgba(var(--primary-rgb), 0.25); }

  .custom-scrollbar::-webkit-scrollbar { width: 4px; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
</style>