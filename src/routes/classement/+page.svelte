<script>
    import { onMount } from 'svelte';
    import { fly, fade } from 'svelte/transition';
    import { goto } from '$app/navigation';
    import { Trophy, Loader2, Bus, Car, Medal, Crown, Search, X } from 'lucide-svelte';

    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast.js';
    import { hasPermission, ACTIONS } from '$lib/permissions';
    import { ActivityStatsService } from '$lib/services/activityStats.service.js';
    import { getDistrictStyle } from '$lib/utils/districtColors.js';

    // --- ÉTAT ---
    let isLoading = $state(true);
    let isAuthorized = $state(false);
    let ranking = $state([]);
    let searchTerm = $state("");

    // --- LIFECYCLE ---
    onMount(async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return goto('/');

        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        const currentUser = { ...session.user, ...profile };

        if (!hasPermission(currentUser, ACTIONS.CLASSEMENT_READ)) {
            toast.error("Accès refusé.");
            return goto('/accueil');
        }
        isAuthorized = true;

        try {
            ranking = await ActivityStatsService.getLeaderboard();
        } catch (e) {
            console.error(e);
            toast.error("Erreur chargement du classement");
        } finally {
            isLoading = false;
        }
    });

    let filtered = $derived(
        searchTerm.trim()
            ? ranking.filter(r => r.full_name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
            : ranking
    );

    const PODIUM_STYLES = {
        0: { border: 'border-amber-400/50', bg: 'from-amber-500/10 to-transparent', icon: Crown, iconClass: 'text-amber-400', glow: 'shadow-[0_0_25px_rgba(245,158,11,0.25)]', label: '1er' },
        1: { border: 'border-slate-300/40', bg: 'from-slate-300/10 to-transparent', icon: Medal, iconClass: 'text-slate-300', glow: 'shadow-[0_0_20px_rgba(203,213,225,0.15)]', label: '2e' },
        2: { border: 'border-orange-600/40', bg: 'from-orange-600/10 to-transparent', icon: Medal, iconClass: 'text-orange-500', glow: 'shadow-[0_0_20px_rgba(234,88,12,0.15)]', label: '3e' }
    };
</script>

<svelte:head>
  <title>Classement | BACO</title>
</svelte:head>

{#if !isAuthorized}
    <div class="h-screen w-full flex flex-col items-center justify-center space-y-4">
        <Loader2 class="w-10 h-10 animate-spin text-amber-500" />
        <p class="text-gray-500 text-sm font-mono animate-pulse">Chargement...</p>
    </div>
{:else}
<div class="container mx-auto p-4 md:p-8 min-h-screen space-y-8">

    <header class="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-white/5 pb-6" in:fly={{ y: -20 }}>
        <div class="flex items-center gap-3">
            <div class="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                <Trophy class="w-8 h-8" />
            </div>
            <div>
                <h1 class="text-3xl font-bold text-gray-200 tracking-tight">Classement</h1>
                <p class="text-gray-500 text-sm mt-1">Commandes Bus (Otto) + Taxi cumulées.</p>
            </div>
        </div>

        <div class="relative w-full md:w-72">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
                type="text"
                bind:value={searchTerm}
                placeholder="Rechercher un rédacteur..."
                class="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30 transition-all"
            />
            {#if searchTerm}
                <button onclick={() => searchTerm = ""} class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"><X size={14}/></button>
            {/if}
        </div>
    </header>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="w-10 h-10 animate-spin text-amber-500/50" /></div>
    {:else if ranking.length === 0}
        <div class="text-center py-20 border border-dashed border-white/10 rounded-2xl bg-black/20">
            <Trophy size={40} class="mx-auto opacity-20 mb-3 text-gray-500" />
            <p class="text-gray-500">Aucune commande enregistrée pour l'instant.</p>
        </div>
    {:else}
        <div in:fade={{ duration: 250 }} class="space-y-8">

            <!-- ═══════════════════════════════════ PODIUM (top 3) ═══ -->
            {#if !searchTerm && ranking.length >= 1}
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                    {#each [1, 0, 2] as podiumIdx}
                        {#if ranking[podiumIdx]}
                            {@const r = ranking[podiumIdx]}
                            {@const style = PODIUM_STYLES[podiumIdx]}
                            {@const PodiumIcon = style.icon}
                            {@const dStyle = getDistrictStyle(r.district)}
                            <a
                                href="/profil?id={r.id}"
                                class="block bg-black/20 border-2 {style.border} {style.glow} rounded-2xl p-6 text-center relative overflow-hidden bg-gradient-to-b {style.bg} hover:brightness-110 transition-all {podiumIdx === 0 ? 'sm:order-2 sm:-mt-4' : podiumIdx === 1 ? 'sm:order-1' : 'sm:order-3'}"
                                in:fly={{ y: 20, delay: podiumIdx * 80 }}
                            >
                                <PodiumIcon size={podiumIdx === 0 ? 32 : 26} class="mx-auto mb-2 {style.iconClass}" />
                                <img src={r.avatar_url || '/default-avatar.png'} alt="av" class="w-16 h-16 rounded-full mx-auto object-cover border-2 {style.border} mb-3" />
                                <p class="font-bold text-white truncate">{r.full_name}</p>
                                <span class="inline-flex items-center gap-1 mt-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded {dStyle.badge}">{dStyle.label}</span>
                                <p class="text-2xl font-extrabold {style.iconClass} mt-3">{r.total}</p>
                                <p class="text-[10px] text-gray-500 uppercase font-bold tracking-wider">commandes — {style.label}</p>
                                <div class="flex justify-center gap-3 mt-3 text-[11px] text-gray-400">
                                    <span class="flex items-center gap-1"><Bus size={11} class="text-blue-400"/> {r.ottoCount}</span>
                                    <span class="flex items-center gap-1"><Car size={11} class="text-yellow-400"/> {r.taxiCount}</span>
                                </div>
                            </a>
                        {/if}
                    {/each}
                </div>
            {/if}

            <!-- ═══════════════════════════════════ LISTE COMPLÈTE ═══ -->
            <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
                <div class="divide-y divide-white/5">
                    {#if filtered.length === 0}
                        <p class="text-center text-gray-500 text-sm py-10">Aucun rédacteur trouvé.</p>
                    {:else}
                        {#each filtered as r, i (r.id)}
                            {@const rank = ranking.indexOf(r) + 1}
                            {@const dStyle = getDistrictStyle(r.district)}
                            <a href="/profil?id={r.id}" class="flex items-center gap-4 px-4 md:px-6 py-3.5 hover:bg-white/[0.02] transition-colors">
                                <span class="w-8 text-center font-mono font-bold text-sm {rank <= 3 ? 'text-amber-400' : 'text-gray-600'}">{rank}</span>
                                <img src={r.avatar_url || '/default-avatar.png'} alt="av" class="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0" />
                                <div class="flex-grow min-w-0">
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="font-bold text-gray-200 truncate">{r.full_name}</span>
                                        <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded {dStyle.badge}">{dStyle.label}</span>
                                    </div>
                                    <div class="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                                        <span class="flex items-center gap-1"><Bus size={11} class="text-blue-400"/> {r.ottoCount} bus</span>
                                        <span class="flex items-center gap-1"><Car size={11} class="text-yellow-400"/> {r.taxiCount} taxis</span>
                                    </div>
                                </div>
                                <div class="text-right shrink-0">
                                    <span class="text-xl font-extrabold text-white">{r.total}</span>
                                    <p class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">total</p>
                                </div>
                            </a>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>
{/if}
