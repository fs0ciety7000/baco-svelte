<script>
    import { onMount } from 'svelte';
    import { PenLine, Save, Loader2, Trash2 } from 'lucide-svelte';
    import { fade } from 'svelte/transition';

    // --- PROPS ---
    let { compact = false } = $props();

    // --- ÉTAT ---
    let noteContent = $state('');
    let isSaving = $state(false);
    let saveTimeout;

    // --- LOGIQUE ---

    onMount(() => {
        // Charger la note sauvegardée au démarrage
        const saved = localStorage.getItem('baco_notepad_content');
        if (saved) {
            noteContent = saved;
        }
    });

    function handleInput() {
        isSaving = true;
        clearTimeout(saveTimeout);
        
        // Debounce de 1 seconde avant sauvegarde
        saveTimeout = setTimeout(() => {
            localStorage.setItem('baco_notepad_content', noteContent);
            
            // Petit délai artificiel pour montrer à l'utilisateur que c'est sauvegardé
            setTimeout(() => {
                isSaving = false;
            }, 500);
        }, 1000);
    }

    function clearNote() {
        if(confirm('Effacer toutes les notes ?')) {
            noteContent = '';
            localStorage.removeItem('baco_notepad_content');
        }
    }
</script>

<div class="glass-panel {compact ? 'p-2' : 'p-4'} rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md h-full flex flex-col transition-all duration-300 group relative">
    
    <div class="flex justify-between items-center {compact ? 'mb-2' : 'mb-3'} shrink-0 h-6">
        <div class="flex items-center gap-2 text-pink-300">
            <PenLine class="{compact ? 'w-4 h-4' : 'w-5 h-5'}" />
           
                <span class="text-base font-bold text-white">Bloc-notes</span>
           
        </div>

        <div class="flex items-center gap-2">
            {#if isSaving}
                <span class="text-[10px] text-green-400 flex items-center gap-1" transition:fade>
                    <Loader2 class="w-3 h-3 animate-spin"/>
                </span>
            {:else}
                <div class="h-3 w-3" transition:fade></div> {/if}

            {#if !compact && noteContent.length > 0}
                <button 
                    onclick={clearNote}
                    class="text-gray-500 hover:text-red-400 transition-colors p-1"
                    title="Effacer tout"
                >
                    <Trash2 size={14} />
                </button>
            {/if}
        </div>
    </div>

    <div class="flex-grow relative w-full bg-black/20 rounded-xl border border-white/5 overflow-hidden group/input">
        <textarea 
            bind:value={noteContent}
            oninput={handleInput}
            placeholder="Une idée rapide ?"
            class="w-full h-full bg-transparent {compact ? 'p-2 text-xs' : 'p-3 text-sm'} text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:bg-white/[0.02] transition-colors leading-relaxed custom-scrollbar"
            spellcheck="false"
        ></textarea>
        
        <div class="absolute bottom-2 right-2 pointer-events-none opacity-0 group-hover/input:opacity-50 transition-opacity">
            <PenLine class="w-12 h-12 text-white/5 -rotate-12" />
        </div>
    </div>
</div>