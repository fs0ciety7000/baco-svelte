<script>
    import { Plus, Trash2 } from 'lucide-svelte';
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

    const periodColors = {
        morning: {
            bg: 'bg-purple-50',
            border: 'border-purple-200',
            text: 'text-purple-900',
            button: 'bg-purple-600 hover:bg-purple-700',
            badge: 'bg-purple-600'
        },
        afternoon: {
            bg: 'bg-yellow-50',
            border: 'border-yellow-200',
            text: 'text-yellow-900',
            button: 'bg-yellow-600 hover:bg-yellow-700',
            badge: 'bg-yellow-600'
        }
    };

    const colors = periodColors[period] || periodColors.morning;
</script>

<div class="bg-white/15 backdrop-blur-md rounded-lg border border-white/30 shadow-xl overflow-hidden">
    <!-- Header -->
    <div class="{colors.bg} px-6 py-4 border-b border-white/30 flex justify-between items-center">
        <h3 class="text-lg font-bold {colors.text} flex items-center gap-3">
            {title}
            <span class="{colors.badge} text-white text-xs px-2.5 py-1 rounded-full font-semibold shadow-md">
                {interventions.length}
            </span>
        </h3>
        <button
            onclick={onAdd}
            class="{colors.button} text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-md"
        >
            <Plus class="w-4 h-4" /> Ajouter
        </button>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead class="bg-white/10 border-b border-white/20">
                <tr class="text-left">
                    <th class="px-4 py-3 text-xs font-semibold text-gray-200 uppercase tracking-wide">Zone</th>
                    <th class="px-4 py-3 text-xs font-semibold text-gray-200 uppercase tracking-wide">Gare</th>
                    <th class="px-4 py-3 text-xs font-semibold text-gray-200 uppercase tracking-wide">PMR / Mission</th>
                    <th class="px-4 py-3 text-xs font-semibold text-gray-200 uppercase tracking-wide">Prise en charge</th>
                    <th class="px-2 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-white/20">
                {#each interventions as row, i}
                    <tr class="hover:bg-white/10 transition-colors">
                        <td class="p-3">
                            <input
                                bind:value={row.zone}
                                class="w-20 px-2 py-1.5 text-center font-mono bg-white/15 border border-white/30 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none hover:bg-white/20 transition-colors"
                                placeholder="-"
                            />
                        </td>
                        <td class="p-3">
                            <input
                                list="stations"
                                value={row.station}
                                oninput={(e) => onStationChange(i, e.target.value)}
                                class="w-full px-3 py-1.5 bg-white/15 border border-white/30 rounded-lg text-white font-semibold uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none hover:bg-white/20 transition-colors"
                                placeholder="GARE"
                            />
                        </td>
                        <td class="p-3">
                            <input
                                bind:value={row.pmr_details}
                                class="w-full px-3 py-1.5 bg-white/15 border border-white/30 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none hover:bg-white/20 transition-colors"
                                placeholder="Détails..."
                            />
                        </td>
                        <td class="p-3">
                            <select
                                bind:value={row.assigned_to}
                                class="w-full px-3 py-1.5 bg-white/15 border border-white/30 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none font-medium hover:bg-white/20 transition-colors"
                            >
                                <option value="" class="bg-gray-800">-- Sélectionner --</option>
                                {#each ASSIGNEES as assignee}
                                    <option value={assignee} class="bg-gray-800">{assignee}</option>
                                {/each}
                            </select>
                        </td>
                        <td class="p-3 text-center">
                            <button
                                onclick={() => onRemove(i)}
                                class="text-gray-300 hover:text-red-400 transition-colors p-1"
                                title="Supprimer"
                            >
                                <Trash2 class="w-4 h-4" />
                            </button>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>
</div>

<style>
    @reference "tailwindcss";
</style>
