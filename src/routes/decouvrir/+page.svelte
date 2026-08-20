<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { Compass, Search, Loader2, ChevronDown, MapPin } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { SocialService } from '$lib/services/social.service.js';
    import { getDistrictStyle, DISTRICT_ORDER } from '$lib/utils/districtColors.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let isAuthorized = $state(false);
    let profiles = $state([]);
    let searchTerm = $state("");
    let districtFilter = $state("all");
    let roleFilter = $state("all");

    const ROLE_LABELS = {
        admin: 'Administrateur',
        sysop: 'Développeur',
        moderator: 'Modérateur',
        otto_agent: 'Agent Otto',
        user: 'Utilisateur',
        reader: 'Lecteur'
    };

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');
        isAuthorized = true;

        try {
            profiles = await SocialService.getAllProfiles();
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement de l'annuaire");
        } finally {
            isLoading = false;
        }
    });

    let rolesList = $derived([...new Set(profiles.map(p => p.role).filter(Boolean))].sort());

    let filtered = $derived.by(() => {
        return profiles.filter(p => {
            if (searchTerm.trim() && !p.full_name?.toLowerCase().includes(searchTerm.trim().toLowerCase())) return false;
            if (districtFilter !== 'all' && p.district !== districtFilter) return false;
            if (roleFilter !== 'all' && p.role !== roleFilter) return false;
            return true;
        });
    });
</script>

<svelte:head>
  <title>Découvrir | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-emerald-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
<div class="container mx-auto p-4 md:p-8 min-h-screen space-y-8">

    <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                <Compass class="w-8 h-8" />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Découvrir</h1>
                <p class="text-gray-500 text-sm mt-1">L'annuaire de tous les profils BACO ({filtered.length}).</p>
            </div>
        </div>
    </header>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-emerald-500/50" /></div>
    {:else}
        <div in:fade={{ duration: 250 }} class="space-y-6">

            <!-- ─── Filtres ─────────────────────────────────────────────── -->
            <div class="bg-black/20 border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
                <div class="relative flex-grow">
                    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                        type="text"
                        bind:value={searchTerm}
                        placeholder="Rechercher un nom..."
                        class="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all"
                    />
                </div>
                <div class="relative">
                    <MapPin class="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                    <select bind:value={districtFilter} class="w-full sm:w-44 bg-black/40 border border-white/10 rounded-xl py-2.5 pl-9 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none cursor-pointer">
                        <option value="all">Tous districts</option>
                        {#each DISTRICT_ORDER as d}<option value={d}>{d}</option>{/each}
                    </select>
                    <ChevronDown class="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                </div>
                <div class="relative">
                    <select bind:value={roleFilter} class="w-full sm:w-44 bg-black/40 border border-white/10 rounded-xl py-2.5 px-3 pr-8 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 appearance-none cursor-pointer">
                        <option value="all">Tous rôles</option>
                        {#each rolesList as r}<option value={r}>{ROLE_LABELS[r] || r}</option>{/each}
                    </select>
                    <ChevronDown class="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                </div>
            </div>

            <!-- ─── Grille de profils ─────────────────────────────────────── -->
            {#if filtered.length === 0}
                <div class="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-black/20">
                    <Compass size={40} class="mx-auto opacity-20 mb-3 text-gray-500" />
                    <p class="text-gray-500">Aucun profil trouvé.</p>
                </div>
            {:else}
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {#each filtered as p (p.id)}
                        {@const dStyle = getDistrictStyle(p.district)}
                        <a
                            href="/profil?id={p.id}"
                            class="bg-black/20 border border-white/5 hover:border-emerald-500/30 hover:bg-white/[0.02] rounded-2xl p-5 flex flex-col items-center text-center transition-all group"
                        >
                            <img src={p.avatar_url || '/default-avatar.png'} alt="av" class="w-16 h-16 rounded-full object-cover border-2 border-white/10 group-hover:border-emerald-500/40 transition-colors mb-3">
                            <p class="font-bold text-gray-200 text-sm truncate w-full">{p.full_name || 'Utilisateur'}</p>
                            <span class="text-[10px] text-gray-500 uppercase font-bold tracking-wider mt-1">{ROLE_LABELS[p.role] || p.role || 'Utilisateur'}</span>
                            {#if p.district}
                                <span class="inline-flex items-center gap-1 mt-2 text-[9px] font-bold uppercase px-2 py-0.5 rounded {dStyle.badge}">{dStyle.label}</span>
                            {/if}
                        </a>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>
{/if}
