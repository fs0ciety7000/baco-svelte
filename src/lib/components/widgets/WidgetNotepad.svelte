<script>
  import { onMount } from 'svelte';
  import { Eraser, PenLine } from 'lucide-svelte';
  import { fade } from 'svelte/transition';

  export let id; 

  let content = "";
  let saveStatus = "saved"; 
  let timeout;
  let textareaEl; // Référence vers l'élément HTML

  const STORAGE_KEY = `baco_notepad_${id}`;

  onMount(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        content = saved;
    }
    // Ajuster la hauteur au chargement (après que le DOM soit prêt)
    setTimeout(autoResize, 0);
  });

  function autoResize() {
    if (!textareaEl) return;
    
    // 1. On réinitialise la hauteur pour permettre de RÉDUIRE si on efface du texte
    textareaEl.style.height = 'auto';
    
    // 2. On applique la nouvelle hauteur basée sur le contenu (+ un petit padding)
    textareaEl.style.height = textareaEl.scrollHeight + 'px';
  }

  function handleInput() {
    saveStatus = "modified";
    
    // Ajustement de la taille à chaque frappe
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
        autoResize(); // Réinitialiser la taille après effacement
    }
  }
</script>

<div class="flex flex-col bg-[#0f1115]/50 rounded-xl border border-white/5 backdrop-blur-sm overflow-hidden shadow-sm hover:shadow-md transition-shadow min-h-[160px]">
    
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

    <textarea 
        bind:this={textareaEl}
        bind:value={content}
        on:input={handleInput}
        placeholder="Numéro de bus, rappel, nom..."
        rows="1"
        class="w-full bg-transparent p-4 text-sm text-gray-300 placeholder-gray-600 resize-none focus:outline-none custom-scrollbar leading-relaxed overflow-hidden"
    ></textarea>
</div>