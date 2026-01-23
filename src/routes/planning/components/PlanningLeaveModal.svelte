<script>
    import { fade, fly } from 'svelte/transition';
    import { Calendar, X, Save, Loader2 } from 'lucide-svelte';

    let { 
        isOpen, 
        isEditing, 
        request = $bindable(), 
        isSubmitting, 
        onClose, 
        onSave 
    } = $props();

    const LEAVE_TYPES = [
        { value: 'CN', label: 'Congé' },
        { value: 'JC', label: 'Jour de Compensation (JC)' },
        { value: 'ZM', label: 'Maladie (ZM)' },
        { value: 'BT', label: 'Blessé au travail / chemin du travail (BT)' },
    ];

    const STATUS_OPTIONS = [
        { value: 'PENDING', label: 'En attente' },
        { value: 'APPROVED', label: 'Accepté' },
        { value: 'REJECTED', label: 'Refusé' }
    ];

    const inputClass = "block w-full rounded-xl border-white/10 bg-black/40 p-3 text-sm font-medium text-white placeholder-gray-600 focus:border-blue-500/50 focus:ring-blue-500/50 transition-all outline-none";
</script>

{#if isOpen}
    <div class="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" transition:fade>
        <div class="w-full max-w-lg rounded-2xl shadow-2xl bg-gray-900 border border-white/10" 
             transition:fly={{ y: 20 }}
             style="--primary-rgb: var(--color-primary);">
            
            <div class="flex justify-between items-center px-6 py-5 border-b border-white/10 bg-white/5">
                <h3 class="text-xl font-bold text-gray-100 flex items-center gap-2">
                    <Calendar class="w-5 h-5 text-themed" /> 
                    {isEditing ? 'Modifier Demande' : 'Nouvelle Demande'}
                </h3>
                <button onclick={onClose} class="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors">
                    <X class="w-5 h-5" />
                </button>
            </div>

            <form onsubmit={(e) => { e.preventDefault(); onSave(); }} class="p-6 space-y-5">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Type</label>
                        <select bind:value={request.type} class="{inputClass} dark:[color-scheme:dark]">
                            {#each LEAVE_TYPES as t}
                                <option value={t.value}>{t.label}</option>
                            {/each}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Statut</label>
                        <select bind:value={request.status} class="{inputClass} dark:[color-scheme:dark]">
                            {#each STATUS_OPTIONS as s}
                                <option value={s.value}>{s.label}</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Début</label>
                        <input type="date" bind:value={request.start_date} required class="{inputClass} dark:[color-scheme:dark]">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Fin</label>
                        <input type="date" bind:value={request.end_date} required class="{inputClass} dark:[color-scheme:dark]">
                    </div>
                </div>
                
                <div>
                     <label class="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Raison (Optionnel)</label>
                     <input type="text" bind:value={request.reason} class={inputClass} placeholder="Ex: Vacances, RDV médical...">
                </div>

                <div class="flex justify-end gap-3 pt-4 border-t border-white/10 mt-2">
                    <button type="button" onclick={onClose} class="px-4 py-2 text-sm font-medium text-gray-400 border border-white/10 rounded-xl hover:bg-white/5">Annuler</button>
                    <button type="submit" disabled={isSubmitting} class="btn-submit-glow px-4 py-2 text-sm font-bold text-white rounded-xl transition-all flex items-center gap-2">
                        {#if isSubmitting}<Loader2 class="w-4 h-4 animate-spin" />{:else}<Save class="w-4 h-4" /> Enregistrer{/if}
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
   .text-themed { color: rgb(var(--primary-rgb)); }
   
   .btn-submit-glow {
       background-color: rgba(var(--primary-rgb), 0.8);
       border: 1px solid rgba(var(--primary-rgb), 0.3);
       box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);
   }

   .btn-submit-glow:hover:not(:disabled) {
       background-color: rgb(var(--primary-rgb));
       box-shadow: 0 0 20px rgba(var(--primary-rgb), 0.5);
       transform: translateY(-1px);
   }
</style>