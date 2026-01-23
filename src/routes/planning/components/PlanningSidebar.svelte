<script>
    import { dndzone } from 'svelte-dnd-action';
    import { flip } from 'svelte/animate';
    import { fly } from 'svelte/transition';
    import { hasPermission, ACTIONS } from '$lib/permissions';

    // --- PROPS ---
    let { 
        availableStaff = [], 
        currentUser,
        onUpdate // Callback pour remonter les changements dnd
    } = $props();

    // --- LOCAL STATE ---
    let filterRole = $state('TOUS');
    const EXCLUDED_NAMES = ['Michaël Rousseau', 'test', 'bloup']; // À configurer peut-être en DB plus tard

    // --- DERIVED ---
    let filteredStaff = $derived(availableStaff.filter(u => {
        if (EXCLUDED_NAMES.includes(u.full_name)) return false;
        const role = (u.fonction || '').toUpperCase();
        if (filterRole === 'TOUS') return true;
        return role === filterRole;
    }));

    // --- DND HANDLERS ---
    function handleConsider(e) {
        // On ne fait que passer l'info au parent ou mettre à jour localement si besoin d'animation fluide
        onUpdate(e.detail.items);
    }
    
    function handleFinalize(e) {
        onUpdate(e.detail.items);
    }

    // --- STYLES HELPER ---
    function getRoleStyle(fonction) {
        const f = (fonction || '').toUpperCase();
        if (f === 'PACO') return 'bg-blue-600/20 text-blue-300 border-blue-500/30';
        if (f === 'RCCA') return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
        return 'bg-gray-600/20 text-gray-300 border-gray-500/30';
    }
</script>

<aside class="w-full lg:w-64 flex flex-col gap-4" in:fly={{ x: -20, duration: 600, delay: 100 }}>
    <div class="bg-black/20 border border-white/5 rounded-3xl p-4 shadow-sm flex-grow flex flex-col h-[600px] lg:h-auto lg:sticky lg:top-4">
        
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-sm font-bold text-gray-200 uppercase tracking-wider">Effectifs</h2>
            <span class="text-xs bg-white/10 px-2 py-1 rounded-full text-gray-400">{filteredStaff.length}</span>
        </div>

        <div class="flex gap-1 mb-4 bg-black/40 p-1 rounded-lg">
            {#each ['TOUS', 'PACO', 'RCCA'] as r}
                <button 
                    class="flex-1 py-1 text-[10px] font-bold rounded transition-colors {filterRole === r ? 'active-role-btn' : 'text-gray-500 hover:text-white hover:bg-white/5'}" 
                    onclick={() => filterRole = r}
                >
                    {r}
                </button>
            {/each}
        </div>

        <div 
            class="flex-grow overflow-y-auto pr-1 space-y-2 custom-scrollbar"
            use:dndzone={{
                items: filteredStaff, 
                flipDurationMs: 200, 
                dropFromOthersDisabled: true,
                dragDisabled: !hasPermission(currentUser, ACTIONS.PLANNING_WRITE)
            }} 
            onconsider={handleConsider} 
            onfinalize={handleFinalize}
        >
            {#each filteredStaff as staff (staff.id)}
                <div 
                    class="p-3 rounded-xl border cursor-grab active:cursor-grabbing shadow-sm group transition-all {getRoleStyle(staff.fonction)} hover:brightness-110"
                    animate:flip={{ duration: 200 }}
                >
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-black/20 shadow-inner">
                            {staff.full_name?.charAt(0)}
                        </div>
                        <div>
                            <div class="text-sm font-bold">{staff.full_name}</div>
                            <div class="text-[10px] opacity-70 font-mono">{staff.fonction || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    </div>
</aside>

<style>
    .active-role-btn {
       background-color: rgb(var(--primary-rgb));
       color: white;
       box-shadow: 0 2px 8px rgba(var(--primary-rgb), 0.4);
   }
</style>