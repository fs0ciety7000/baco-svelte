<script>
  import { onMount } from 'svelte';
  import { Eraser, PenLine } from 'lucide-svelte';
  import { fade } from 'svelte/transition';

  export let id; 

  let content = "";
  let saveStatus = "saved"; 
  let timeout;
  let textareaEl;

  const STORAGE_KEY = `baco_notepad_${id}`;

  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        content = saved;
    }
    // Petit délai pour que le CSS h-full soit appliqué avant le calcul
    setTimeout(autoResize, 50);
  });

  function autoResize() {
    if (!textareaEl) return;
    
    // On reset à 'auto' pour bien calculer la réduction si on efface
    textareaEl.style.height = 'auto';
    
    // On applique la hauteur du contenu
    // Note : Grâce à la classe CSS 'min-h-full' sur le textarea, 
    // si scrollHeight est petit, le textarea restera quand même grand (taille du widget).
    // Si scrollHeight est grand, il poussera le widget.
    textareaEl.style.height = textareaEl.scrollHeight + 'px';
  }

  function handleInput() {
    saveStatus = "modified";
    autoResize();

    clearTimeout(timeout);
    timeout = setTimeout(() => {
        saveStatus = "saving";
        localStorage.setItem(STORAGE_KEY, content);
        setTimeout(() => saveStatus = "saved", 800);
    }, 1000);
  }

  function clearNote() {
    if(confirm("Effacer cette note ?")) {
        content = "";
        localStorage.removeItem(STORAGE_KEY);
        saveStatus = "saved";
        autoResize();
    }
  }
</script>

<div class="flex flex-col h-full bg-[#0f1115]/50 rounded-xl border border-white/5 backdrop-blur-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow">
    
    <div class="flex justify-between items-center px-4 py-3 border-b border-white/5 bg-white/5 shrink-0">
        <div class="flex items-center gap-2 text-yellow-400">
            <PenLine class="w-4 h-4" />
            <span class="text-sm font-bold uppercase tracking-wider">Note Rapide</span>
        </div>
        
        <div class="flex items-center gap-2">
            {#if saveStatus === 'saving'}
                <span transition:fade class="text-[10px] text-blue-400 font-medium">Sauvegarde...</span>
            {:else if saveStatus === 'saved'}
                <span transition:fade class="text-[10px] text-green-500/50 font-medium">Enregistré</span>
            {/if}

            <button on:click={clearNote} class="p-1 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded transition-colors" title="Effacer">
                <Eraser class="w-3.5 h-3.5" />
            </button>
        </div>
    </div>

    <div class="flex-grow relative w-full">
        <textarea 
            bind:this={textareaEl}
            bind:value={content}
            on:input={handleInput}
            placeholder="Numéro de bus, rappel, nom..."
            rows="1"
            class="w-full h-full min-h-full bg-transparent p-4 text-sm text-gray-300 placeholder-gray-600 resize-none focus:outline-none custom-scrollbar leading-relaxed overflow-hidden block"
        ></textarea>
    </div>
</div>