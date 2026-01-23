<script>
    import { dndzone } from 'svelte-dnd-action';
    import { flip } from 'svelte/animate';
    import { ChevronLeft, ChevronRight } from 'lucide-svelte';
    import { hasPermission, ACTIONS } from '$lib/permissions';

    // --- PROPS ---
    let { 
        days = [], 
        planningMap = {}, 
        monthNames = [], 
        displayedMonth, 
        displayedYear, 
        currentUser,
        onPrevMonth, 
        onNextMonth,
        onZoneChange, // (dateKey, shift, items, info)
        onRemoveShift // (dateKey, shift, userId)
    } = $props();

    const shifts = ['A', 'P', 'N'];
    const dayNames = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

    // --- HANDLERS DND ---
    function handleConsider(dateKey, shift, e) {
        onZoneChange(dateKey, shift, e.detail.items, { trigger: 'consider' });
    }

    function handleFinalize(dateKey, shift, e) {
        onZoneChange(dateKey, shift, e.detail.items, { ...e.detail.info, trigger: 'dropped' });
    }

    // --- STYLES ---
    function getShiftStyle(shift) {
        if (shift === 'A') return 'bg-pink-500 text-white border-pink-600 shadow-pink-500/20';
        if (shift === 'P') return 'bg-blue-500 text-white border-blue-600 shadow-blue-500/20';     
        if (shift === 'N') return 'bg-orange-500 text-white border-orange-600 shadow-orange-500/20';
        return 'bg-gray-600 text-gray-300';
    }
</script>

<div class="flex-grow bg-black/20 border border-white/5 rounded-3xl p-4 shadow-sm overflow-hidden flex flex-col">
    
    <div class="flex justify-between items-center mb-4">
        <div class="flex items-center gap-4 bg-black/30 border border-white/10 rounded-xl p-1 shadow-inner">
            <button onclick={onPrevMonth} class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-themed transition-colors"><ChevronLeft class="w-5 h-5" /></button>
            <span class="text-gray-200 font-bold text-sm min-w-[140px] text-center uppercase tracking-wide">{monthNames[displayedMonth]} {displayedYear}</span>
            <button onclick={onNextMonth} class="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-themed transition-colors"><ChevronRight class="w-5 h-5" /></button>
        </div>
    </div>
    
    <div class="grid grid-cols-7 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {#each dayNames as day}
            <div class="py-2 text-[10px] font-bold text-center text-gray-400 uppercase tracking-widest bg-black/60 backdrop-blur-sm">{day}</div>
        {/each}

        {#each days as day}
            <div class="min-h-[160px] bg-gray-900/80 relative flex flex-col border-t border-white/5 group/day
                {day.isCurrentMonth ? '' : 'bg-black/60 opacity-50'}
                {day.isToday ? 'today-cell' : ''}"
            >
                <div class="flex justify-between items-start p-2">
                    {#if day.isMonday}
                        <span class="week-number">S{day.weekNumber}</span>
                    {:else}
                        <span></span>
                    {/if}
                    <span class="text-xs font-bold {day.isToday ? 'text-themed' : 'text-gray-500'}">
                        {day.dayOfMonth}
                    </span>
                </div>

                <div class="flex-grow flex flex-col gap-px bg-white/5 mt-auto">
                    {#each shifts as shift}
                        <div class="flex-1 bg-gray-900/50 hover:bg-white/5 transition-colors relative group min-h-[35px] border-t border-white/5">
                            <div class="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] font-black text-gray-600 group-hover:text-gray-400 select-none w-4 text-center">{shift}</div>
                            
                            <div 
                                class="h-full w-full pl-6 pr-1 py-0.5 flex flex-wrap content-center gap-1"
                                use:dndzone={{
                                    items: planningMap[`${day.dateKey}_${shift}`] || [], 
                                    flipDurationMs: 200,
                                    dragDisabled: !hasPermission(currentUser, ACTIONS.PLANNING_WRITE)
                                }} 
                                onconsider={(e) => handleConsider(day.dateKey, shift, e)} 
                                onfinalize={(e) => handleFinalize(day.dateKey, shift, e)}
                            >
                                {#each planningMap[`${day.dateKey}_${shift}`] || [] as p (p.id)}
                                    <div 
                                        class="text-[9px] px-1.5 py-0.5 rounded cursor-grab active:cursor-grabbing border shadow-sm truncate max-w-[90px] font-bold transition-transform hover:scale-105 {getShiftStyle(shift)}" 
                                        animate:flip={{ duration: 200 }} 
                                        oncontextmenu={(e) => { e.preventDefault(); onRemoveShift(day.dateKey, shift, p.id); }}
                                    >
                                        {p.full_name?.split(' ')[0]}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
   .today-cell {
       background-color: rgba(var(--primary-rgb), 0.05);
       box-shadow: inset 0 0 20px rgba(var(--primary-rgb), 0.1);
   }

   .week-number {
       font-family: monospace;
       font-size: 9px;
       font-weight: bold;
       color: rgb(var(--primary-rgb));
       background-color: rgba(var(--primary-rgb), 0.15);
       padding: 0 0.375rem;
       border-radius: 0.25rem;
       border: 1px solid rgba(var(--primary-rgb), 0.25);
   }
   
   .text-themed { color: rgb(var(--primary-rgb)); }
   .hover-text-themed:hover { color: rgb(var(--primary-rgb)); }
</style>