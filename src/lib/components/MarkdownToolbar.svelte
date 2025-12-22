<script>
    import { Bold, Italic, Strikethrough, Code, List, Heading1, Heading2, Link2, Quote } from 'lucide-svelte';

    // On reçoit la référence du textarea parent
    export let textarea = null;
    // On reçoit le contenu lié pour le mettre à jour
    export let value = "";

    function insert(before, after = "") {
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selection = text.substring(start, end);

        // Insertion du texte
        const newText = text.substring(0, start) + before + selection + after + text.substring(end);
        
        // Mise à jour de la valeur (déclenche la réactivité Svelte)
        value = newText;

        // On replace le curseur / la sélection
        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + before.length, end + before.length);
        }, 0);
    }
</script>

<div class="flex items-center gap-1 p-2 bg-black/20 border-b border-white/5 overflow-x-auto custom-scrollbar">
    <button type="button" on:click={() => insert('**', '**')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Gras">
        <Bold size={16} />
    </button>
    <button type="button" on:click={() => insert('*', '*')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Italique">
        <Italic size={16} />
    </button>
    <button type="button" on:click={() => insert('~~', '~~')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Barré">
        <Strikethrough size={16} />
    </button>
    
    <div class="w-px h-4 bg-white/10 mx-1"></div>

    <button type="button" on:click={() => insert('# ')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Titre 1">
        <Heading1 size={16} />
    </button>
    <button type="button" on:click={() => insert('## ')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Titre 2">
        <Heading2 size={16} />
    </button>

    <div class="w-px h-4 bg-white/10 mx-1"></div>

    <button type="button" on:click={() => insert('- ')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Liste">
        <List size={16} />
    </button>
    <button type="button" on:click={() => insert('> ')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Citation">
        <Quote size={16} />
    </button>
    <button type="button" on:click={() => insert('`', '`')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Code">
        <Code size={16} />
    </button>
</div>