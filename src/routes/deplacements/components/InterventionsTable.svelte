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
        themeColor = 'primary',
        period = 'morning'
    } = $props();

    const colorConfig = {
        primary: {
            border: 'border-theme-primary',
            text: 'text-theme-primary',
            bg: 'bg-[rgb(var(--color-primary))]',
            btnBg: 'bg-[rgb(var(--color-primary))]',
            btnHover: 'hover:bg-[rgba(var(--color-primary),0.8)]'
        },
        afternoon: {
            border: 'border-[#ADBC16]/50',
            text: 'text-[#ADBC16]',
            bg: 'bg-[#ADBC16]',
            btnBg: 'bg-[#ADBC16]',
            btnHover: 'hover:bg-[#8a9612]'
        }
    };

    const config = colorConfig[themeColor];
</script>

<div class="glass-panel {config.border} rounded-2xl shadow-2xl flex flex-col overflow-hidden">
    <div class="p-5 border-b-2 {config.border} flex justify-between items-center bg-slate-950/80">
        <h3 class="font-black text-lg flex items-center gap-3 {config.text}">
            {title}
            <span class="{config.bg} text-white text-sm px-3 py-1 rounded-full">
                {interventions.length}
            </span>
        </h3>
        <button
            onclick={onAdd}
            class="{config.btnBg} {config.btnHover} text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all"
        >
            <Plus class="w-4 h-4" /> Ajouter
        </button>
    </div>

    <div class="overflow-x-auto p-4">
        <table class="w-full text-sm text-left border-collapse">
            <thead class="{config.text} uppercase text-xs font-black bg-slate-950 {config.border} border-b">
                <tr>
                    <th class="px-4 py-3">Zone</th>
                    <th class="px-4 py-3">Gare</th>
                    <th class="px-4 py-3 w-96">PMR / Mission</th>
                    <th class="px-4 py-3 w-48">Prise en charge</th>
                    <th class="px-2 py-3"></th>
                </tr>
            </thead>
            <tbody class="divide-y divide-white/10">
                {#each interventions as row, i}
                    <tr class="hover:bg-white/5 transition-colors">
                        <td class="p-2">
                            <input
                                bind:value={row.zone}
                                class="w-16 glass-panel text-center font-mono border {config.border} rounded-lg py-1 outline-none"
                                placeholder="-"
                            />
                        </td>
                        <td class="p-2">
                            <input
                                list="stations"
                                value={row.station}
                                oninput={(e) => onStationChange(i, e.target.value)}
                                class="w-full glass-panel border {config.border} rounded-lg px-2 py-1 font-bold uppercase outline-none"
                                placeholder="GARE"
                            />
                        </td>
                        <td class="p-2">
                            <input
                                bind:value={row.pmr_details}
                                class="w-full glass-panel border {config.border} rounded-lg px-2 py-1 outline-none"
                                placeholder="Détails..."
                            />
                        </td>
                        <td class="p-2">
                            <select
                                bind:value={row.assigned_to}
                                class="w-full glass-panel border-2 {config.border} rounded-lg px-3 py-2 outline-none focus:{config.border} transition-colors font-medium"
                            >
                                <option value="">-- Sélectionner --</option>
                                {#each ASSIGNEES as assignee}
                                    <option value={assignee} class="bg-slate-800 text-white py-2">
                                        {assignee}
                                    </option>
                                {/each}
                            </select>
                        </td>
                        <td class="p-2 text-center">
                            <button
                                onclick={() => onRemove(i)}
                                class="text-slate-500 hover:text-red-400 transition-colors"
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

    select:focus {
        outline: none;
    }

    select option {
        padding: 10px;
    }
</style>
