<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { CalendarDays, Cake, ListTodo, User } from 'lucide-svelte';
    import { slide } from 'svelte/transition';

    let activeTab = 'leaves'; // 'leaves' ou 'birthdays'
    let upcomingLeaves = [];
    let upcomingBirthdays = [];
    let loading = true;

    onMount(async () => {
        await loadPlanningData();
    });

    async function loadPlanningData() {
        loading = true;
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];

        // 1. Charger les congés
        const { data: leaves } = await supabase
            .from('leave_requests')
            .select(`start_date, end_date, type, status, profiles(full_name)`)
            .in('status', ['APPROVED', 'PENDING'])
            .gte('end_date', todayString)
            .order('start_date', { ascending: true })
            .limit(10);
        
        upcomingLeaves = leaves || [];

        // 2. Charger les anniversaires
        const { data: profiles } = await supabase
            .from('profiles')
            .select('full_name, birthday')
            .not('birthday', 'is', null);

        if (profiles) {
            upcomingBirthdays = profiles.map(profile => {
                const bday = new Date(profile.birthday.replace(/-/g, '/')); 
                const currentYear = today.getFullYear();
                let nextBday = new Date(currentYear, bday.getMonth(), bday.getDate());
                
                // Si l'anniv est passé cette année, c'est l'année prochaine
                if (nextBday < new Date(today.setHours(0,0,0,0))) {
                    nextBday = new Date(currentYear + 1, bday.getMonth(), bday.getDate());
                }
                
                return { 
                    name: profile.full_name, 
                    date: nextBday, 
                    displayDate: nextBday.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }), 
                    isToday: nextBday.toDateString() === new Date().toDateString() 
                };
            })
            .sort((a, b) => a.date - b.date)
            .slice(0, 5);
        }
        loading = false;
    }
</script>

<div class="glass-panel p-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md h-full flex flex-col relative overflow-hidden">
    
    <div class="flex items-center justify-between mb-4 z-10 border-b border-white/10 pb-2">
        <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays class="w-5 h-5 text-pink-400" /> Planning
        </h2>
        
        <div class="flex bg-black/20 rounded-lg p-1">
            <button 
                on:click={() => activeTab = 'leaves'}
                class="px-3 py-1 text-xs font-bold rounded-md transition-all {activeTab === 'leaves' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}"
            >
                Congés
            </button>
            <button 
                on:click={() => activeTab = 'birthdays'}
                class="px-3 py-1 text-xs font-bold rounded-md transition-all {activeTab === 'birthdays' ? 'bg-pink-500/20 text-pink-300 shadow-sm' : 'text-gray-500 hover:text-gray-300'}"
            >
                Anniversaires
            </button>
        </div>
    </div>

    <div class="flex-1 overflow-y-auto custom-scrollbar z-10 pr-1">
        {#if loading}
            <div class="h-full flex items-center justify-center text-gray-500 text-xs gap-2">
                <div class="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                Chargement...
            </div>
        {:else}
            {#if activeTab === 'leaves'}
                <div in:slide={{ duration: 200 }}>
                    {#if upcomingLeaves.length === 0}
                        <div class="flex flex-col items-center justify-center py-10 text-gray-500 opacity-60">
                            <ListTodo class="w-8 h-8 mb-2" />
                            <p class="text-xs">Aucun congé prévu.</p>
                        </div>
                    {:else}
                        <div class="space-y-2">
                            {#each upcomingLeaves as leave}
                                <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] transition-colors">
                                    <div class="flex items-center gap-3">
                                        <div class="p-1.5 rounded-lg bg-green-500/10 text-green-400">
                                            <User class="w-3 h-3" />
                                        </div>
                                        <div>
                                            <span class="block font-bold text-gray-200 text-xs">{leave.profiles?.full_name}</span>
                                            <span class="text-[9px] text-gray-500 uppercase tracking-wider">{leave.type}</span>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-full {leave.status === 'APPROVED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'}">
                                            {leave.status === 'APPROVED' ? 'Validé' : 'En attente'}
                                        </span>
                                        <p class="text-[11px] text-gray-300 mt-1 font-medium">
                                            {new Date(leave.start_date).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})} → {new Date(leave.end_date).toLocaleDateString('fr-FR', {day: 'numeric', month: 'short'})}
                                        </p>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}

            {#if activeTab === 'birthdays'}
                <div in:slide={{ duration: 200 }}>
                    {#if upcomingBirthdays.length === 0}
                        <div class="flex flex-col items-center justify-center py-10 text-gray-500 opacity-60">
                            <Cake class="w-8 h-8 mb-2" />
                            <p class="text-xs">Aucun anniversaire.</p>
                        </div>
                    {:else}
                        <div class="space-y-2">
                            {#each upcomingBirthdays as birthday}
                                <div class="flex items-center justify-between p-2.5 rounded-xl border transition-all {birthday.isToday ? 'bg-pink-500/10 border-pink-500/30 shadow-[0_0_15px_rgba(236,72,153,0.15)]' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07]'}">
                                    <div class="flex items-center gap-3">
                                        <div class="p-1.5 rounded-lg {birthday.isToday ? 'bg-pink-500 text-white animate-bounce' : 'bg-white/5 text-gray-400'}">
                                            <Cake class="w-3.5 h-3.5" />
                                        </div>
                                        <span class="font-medium text-gray-200 text-xs">{birthday.name}</span>
                                    </div>
                                    <span class="text-[10px] font-bold flex items-center gap-2 {birthday.isToday ? 'text-pink-300' : 'text-gray-500'}">
                                        {birthday.displayDate}
                                        {#if birthday.isToday}
                                            <span class="bg-pink-500 text-white text-[9px] px-1.5 py-0.5 rounded-full shadow-sm">J-J</span>
                                        {/if}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/if}
        {/if}
    </div>
</div>