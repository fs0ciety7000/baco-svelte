<script>
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { Trophy, Loader2 } from 'lucide-svelte';
    import { ActivityStatsService } from '$lib/services/activityStats.service.js';
    import { getDistrictStyle, DISTRICT_ORDER } from '$lib/utils/districtColors.js';

    let loading = $state(true);
    let monthLabel = $state("");
    let champions = $state({});

    onMount(async () => {
        try {
            const res = await ActivityStatsService.getMonthlyChampionsByDistrict();
            monthLabel = res.monthLabel;
            champions = res.champions;
        } catch (e) {
            console.error(e);
        } finally {
            loading = false;
        }
    });
</script>

<div class="bg-black/20 border border-white/5 rounded-2xl flex flex-col h-full overflow-hidden backdrop-blur-md">
    <div class="p-4 border-b border-white/5 flex items-center justify-between bg-amber-500/5">
        <div class="flex items-center gap-2">
            <Trophy class="w-4 h-4 text-amber-400" />
            <h3 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Champions du mois</h3>
        </div>
        <a href="/classement" class="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors uppercase tracking-widest">Classement</a>
    </div>

    <div class="flex-grow p-3">
        {#if loading}
            <div class="flex justify-center py-8"><Loader2 class="w-6 h-6 animate-spin text-amber-500/20" /></div>
        {:else}
            <p class="text-[10px] text-gray-500 text-center mb-3 capitalize">{monthLabel}</p>
            <div class="grid grid-cols-3 gap-2 h-full">
                {#each DISTRICT_ORDER as district}
                    {@const champ = champions[district]}
                    {@const style = getDistrictStyle(district)}
                    <div class="flex flex-col items-center text-center p-2 rounded-xl bg-white/[0.02] border border-white/5" in:fade>
                        {#if champ}
                            <a href="/profil?id={champ.id}" class="flex flex-col items-center group">
                                <img src={champ.avatar_url || '/default-avatar.png'} alt="av" class="w-9 h-9 rounded-full object-cover border border-white/10 group-hover:border-amber-400/50 transition-colors mb-1.5">
                                <span class="text-[10px] font-bold text-gray-200 truncate w-full group-hover:text-amber-300 transition-colors">{champ.full_name}</span>
                                <span class="text-[9px] font-black text-amber-400 mt-0.5">{champ.total}</span>
                            </a>
                        {:else}
                            <div class="w-9 h-9 rounded-full bg-white/5 border border-white/5 mb-1.5"></div>
                            <span class="text-[9px] text-gray-600 italic">Aucun</span>
                        {/if}
                        <span class="inline-flex items-center gap-1 mt-1.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded {style.badge}">{style.label}</span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>
