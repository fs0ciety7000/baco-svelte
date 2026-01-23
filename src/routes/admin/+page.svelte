<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { 
        Shield, Search, Loader2, ArrowUpDown, 
        CheckCircle, AlertTriangle 
    } from 'lucide-svelte';
  
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { AdminService } from '$lib/services/admin.service.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let usersList = $state([]);
    let filteredUsers = $state([]);
    
    // Filtres & Tri
    let searchQuery = $state("");
    let sortCol = $state('last_active');
    let sortAsc = $state(false);

    // --- INIT ---
    onMount(async () => {
        await checkAccess();
        await loadUsers();
    });

    async function checkAccess() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return goto('/');
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (data?.role !== 'admin') return goto('/');
    }

    async function loadUsers() {
        isLoading = true;
        try {
            // 1. Profils
            const { users } = await AdminService.getUsers({ limit: 1000 });
            
            // 2. Présence (Dernière activité réelle)
            const { data: presence } = await supabase.from('user_presence').select('user_id, last_seen_at');
            const presenceMap = new Map(presence?.map(p => [p.user_id, p.last_seen_at]));

            // 3. Sanctions (Compteurs)
            const { data: sanctions } = await supabase.from('infractions').select('user_id, card_type').eq('is_active', true);
            const sanctionMap = {};
            sanctions?.forEach(s => {
                if (!sanctionMap[s.user_id]) sanctionMap[s.user_id] = { yellow: 0, red: 0 };
                if (s.card_type === 'yellow') sanctionMap[s.user_id].yellow++;
                if (s.card_type === 'red') sanctionMap[s.user_id].red++;
            });

            // 4. Fusion des données
            usersList = users.map(u => {
                const lastSeen = presenceMap.get(u.id);
                // On prend le plus récent entre le login et la présence
                let realLastActive = u.last_sign_in_at;
                if (lastSeen && (!realLastActive || new Date(lastSeen) > new Date(realLastActive))) {
                    realLastActive = lastSeen;
                }

                return {
                    ...u,
                    last_active: realLastActive, // Champ unifié pour le tri
                    yellow_cards: sanctionMap[u.id]?.yellow || 0,
                    red_cards: sanctionMap[u.id]?.red || 0
                };
            });

        } catch (e) {
            toast.error("Erreur chargement");
        } finally {
            isLoading = false;
        }
    }

    // --- TRI & FILTRE ---
    $effect(() => {
        let res = [...usersList];
        
        // 1. Recherche
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(u => 
                (u.email && u.email.toLowerCase().includes(q)) || 
                (u.full_name && u.full_name.toLowerCase().includes(q))
            );
        }

        // 2. Tri
        res.sort((a, b) => {
            let valA = a[sortCol];
            let valB = b[sortCol];

            if (sortCol === 'last_active') {
                valA = new Date(valA || 0).getTime();
                valB = new Date(valB || 0).getTime();
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return sortAsc ? -1 : 1;
            if (valA > valB) return sortAsc ? 1 : -1;
            return 0;
        });

        filteredUsers = res;
    });

    function toggleSort(col) {
        if (sortCol === col) sortAsc = !sortAsc;
        else { sortCol = col; sortAsc = true; }
    }

    function formatDate(d) {
        if (!d) return '-';
        // Format court : JJ/MM HH:mm
        return new Date(d).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
    }
</script>

<svelte:head>
  <title>Admin Utilisateurs | BACO</title>
</svelte:head>

<div class="container mx-auto p-4 md:p-8 space-y-8 min-h-screen">
    
    <header class="flex items-center gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="p-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_15px_rgba(220,38,38,0.2)]">
            <Shield size={32} />
        </div>
        <div>
            <h1 class="text-3xl font-bold text-gray-200">Administration</h1>
            <p class="text-gray-500 text-sm">Annuaire des utilisateurs ({filteredUsers.length})</p>
        </div>
    </header>

    <div class="flex flex-col md:flex-row gap-4" in:fly={{ y: 20 }}>
        <div class="relative flex-grow">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input 
                type="text" 
                bind:value={searchQuery} 
                placeholder="Rechercher un utilisateur..." 
                class="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white focus:ring-2 focus:ring-red-500/30 outline-none"
            />
        </div>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-red-500 w-10 h-10"/></div>
    {:else}
        <div class="bg-black/20 border border-white/5 rounded-3xl overflow-hidden shadow-lg" in:fade>
            <div class="overflow-x-auto">
                <table class="min-w-full text-left">
                    <thead class="bg-white/[0.02] text-xs uppercase text-gray-500 font-bold border-b border-white/5">
                        <tr>
                            <th class="px-6 py-4 cursor-pointer hover:text-white" onclick={() => toggleSort('full_name')}>Utilisateur <ArrowUpDown size={12} class="inline"/></th>
                            <th class="px-6 py-4 cursor-pointer hover:text-white" onclick={() => toggleSort('role')}>Rôle <ArrowUpDown size={12} class="inline"/></th>
                            <th class="px-6 py-4">Statut</th>
                            <th class="px-6 py-4 text-center">Sanctions</th> <th class="px-6 py-4 cursor-pointer hover:text-white" onclick={() => toggleSort('last_active')}>Dernière Activité <ArrowUpDown size={12} class="inline"/></th>
                            <th class="px-6 py-4 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5 text-sm">
                        {#each filteredUsers as user (user.id)}
                            <tr class="hover:bg-white/[0.02] transition-colors group">
                                <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                        <img src={user.avatar_url || '/default-avatar.png'} alt="av" class="w-10 h-10 rounded-full bg-black/40 object-cover border border-white/10">
                                        <div>
                                            <div class="font-bold text-gray-200">{user.full_name || 'Sans nom'}</div>
                                            <div class="text-xs text-gray-500">{user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4">
                                    <span class="px-2 py-1 rounded text-[10px] font-bold uppercase border 
                                        {user.role === 'admin' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                                         user.role === 'moderator' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 
                                         'bg-white/5 text-gray-400 border-white/10'}">
                                        {user.role || 'user'}
                                    </span>
                                </td>
                                <td class="px-6 py-4">
                                    {#if user.banned_until}
                                        <span class="text-red-500 font-bold text-xs flex items-center gap-1"><AlertTriangle size={12}/> Banni</span>
                                    {:else}
                                        <span class="text-green-500 font-bold text-xs flex items-center gap-1"><CheckCircle size={12}/> Actif</span>
                                    {/if}
                                </td>
                                
                                <td class="px-6 py-4 text-center">
                                    <div class="flex justify-center gap-2">
                                        {#if user.yellow_cards > 0} 
                                            <span class="text-yellow-500 text-xs font-bold bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20" title="Avertissements">⚠ {user.yellow_cards}</span> 
                                        {/if}
                                        {#if user.red_cards > 0} 
                                            <span class="text-red-500 text-xs font-bold bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20" title="Expulsions">🚷 {user.red_cards}</span> 
                                        {/if}
                                        {#if user.yellow_cards === 0 && user.red_cards === 0}
                                            <span class="text-gray-600 text-xs">—</span>
                                        {/if}
                                    </div>
                                </td>

                                <td class="px-6 py-4 font-mono text-xs text-gray-400">
                                    {formatDate(user.last_active)}
                                    {#if user.last_active && new Date(user.last_active) > new Date(Date.now() - 5*60000)} <span class="inline-block w-2 h-2 rounded-full bg-green-500 ml-2 animate-pulse" title="En ligne"></span>
                                    {/if}
                                </td>
                                <td class="px-6 py-4 text-right">
                                    <a 
                                        href="/admin/utilisateur/{user.id}" 
                                        class="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-all border border-white/10 hover:border-white/20"
                                    >
                                        Gérer
                                    </a>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    {/if}
</div>