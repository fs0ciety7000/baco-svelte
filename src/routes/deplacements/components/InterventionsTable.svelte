<script>
    import { Plus, Trash2, Sun, Moon } from 'lucide-svelte';
    import { ASSIGNEES } from '$lib/utils/deplacements.constants.js';

    let {
        title,
        interventions = $bindable([]),
        stationList = [],
        onAdd,
        onRemove,
        onStationChange,
        period = 'morning'
    } = $props();

    // Configuration minimaliste pour le mode sombre
    // On utilise la couleur juste pour l'icône et le focus
    const config = period === 'morning' ? {
        icon: 'text-purple-400',
        focus: 'focus:border-purple-500/50 focus:ring-purple-500/20',
        badge: 'text-purple-300 bg-purple-500/10 border-purple-500/20'
    } : {
        icon: 'text-yellow-400',
        focus: 'focus:border-yellow-500/50 focus:ring-yellow-500/20',
        badge: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20'
    };
</script>

<div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
    
    <div class="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
        <div class="flex items-center gap-3">
            {#if period === 'morning'}
                <Sun class="w-5 h-5 {config.icon}" />
            {:else}
                <Moon class="w-5 h-5 {config.icon}" />
            {/if}
            <h3 class="text-sm font-bold text-gray-200 uppercase tracking-wide">{title}</h3>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold border {config.badge}">
                {interventions.length}
            </span>
        </div>
        <button
            onclick={onAdd}
            class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 transition-all flex items-center gap-2"
        >
            <Plus class="w-3.5 h-3.5" /> Ajouter
        </button>
    </div>

    <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="border-b border-white/5 text-[10px] uppercase text-gray-500 font-bold tracking-widest bg-black/20">
                    <th class="p-4 w-24 text-center">Zone</th>
                    <th class="p-4 w-48">Gare</th>
                    <th class="p-4">Détails (PMR / Mission)</th>
                    <th class="p-4 w-56">Attribué à</th>
                    <th class="p-4 w-12"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-white/5 text-sm">
                {#each interventions as row, i}
                    <tr class="group hover:bg-white/[0.02] transition-colors">
                        <td class="p-3">
                            <input
                                bind:value={row.zone}
                                class="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 px-2 text-center font-mono text-gray-300 outline-none transition-all focus:ring-2 {config.focus}"
                                placeholder="-"
                            />
                        </td>
                        
                        <td class="p-3">
                            <input
                                list="stations"
                                value={row.station}
                                oninput={(e) => onStationChange(i, e.target.value)}
                                class="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 px-3 font-bold text-white uppercase outline-none transition-all placeholder-gray-600 focus:ring-2 {config.focus}"
                                placeholder="GARE"
                            />
                        </td>

                        <td class="p-3">
                            <input
                                bind:value={row.pmr_details}
                                class="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 px-3 text-gray-200 outline-none transition-all placeholder-gray-600 focus:ring-2 {config.focus}"
                                placeholder="Description..."
                            />
                        </td>

                        <td class="p-3">
                            <div class="relative">
                                <select
                                    bind:value={row.assigned_to}
                                    class="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 px-3 text-gray-300 outline-none transition-all appearance-none cursor-pointer focus:ring-2 {config.focus}"
                                >
                                    <option value="" class="bg-gray-900 text-gray-500">-- Choisir --</option>
                                    {#each ASSIGNEES as assignee}
                                        <option value={assignee} class="bg-gray-900 text-white">{assignee}</option>
                                    {/each}
                                </select>
                            </div>
                        </td>

                        <td class="p-3 text-center">
                            <button
                                onclick={() => onRemove(i)}
                                class="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                                title="Supprimer"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </td>
                    </tr>
                {/each}
                {#if interventions.length === 0}
                    <tr>
                        <td colspan="5" class="p-8 text-center">
                            <div class="flex flex-col items-center gap-2 text-gray-600">
                                <div class="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                                    {#if period === 'morning'}
                                        <Sun class="w-5 h-5 opacity-50" />
                                    {:else}
                                        <Moon class="w-5 h-5 opacity-50" />
                                    {/if}
                                </div>
                                <span class="text-xs italic">Aucune intervention</span>
                            </div>
                        </td>
                    </tr>
                {/if}
            </tbody>
        </table>
    </div>
</div>