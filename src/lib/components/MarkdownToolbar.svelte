<script>
    import { Bold, Italic, List, Code, Quote, Link } from 'lucide-svelte';

    // Props : on reçoit la référence du textarea et la valeur liée
    let { textarea = null, value = $bindable() } = $props();

    /**
     * Insère des balises autour de la sélection ou au curseur
     */
    function insert(prefix, suffix = "") {
        if (!textarea) return; // Sécurité si le textarea n'est pas encore monté

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;

        const before = text.substring(0, start);
        const selection = text.substring(start, end);
        const after = text.substring(end);

        // Mise à jour du texte
        value = `${before}${prefix}${selection}${suffix}${after}`;

        // Repositionnement du curseur après la mise à jour du DOM
        requestAnimationFrame(() => {
            textarea.focus();
            if (selection.length > 0) {
                // Si on a sélectionné du texte, on le re-sélectionne à l'intérieur des balises
                textarea.setSelectionRange(start + prefix.length, end + prefix.length);
            } else {
                // Sinon on place le curseur au milieu des balises
                const cursor = start + prefix.length;
                textarea.setSelectionRange(cursor, cursor);
            }
        });
    }
</script>

<div class="flex items-center gap-1 pb-2 mb-2 border-b border-white/5 overflow-x-auto">
    <button onclick={() => insert('**', '**')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Gras">
        <Bold size={16} />
    </button>
    <button onclick={() => insert('*', '*')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Italique">
        <Italic size={16} />
    </button>
    <div class="w-px h-4 bg-white/10 mx-1"></div>
    <button onclick={() => insert('- ')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Liste à puces">
        <List size={16} />
    </button>
    <button onclick={() => insert('> ')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Citation">
        <Quote size={16} />
    </button>
    <button onclick={() => insert('`', '`')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Code">
        <Code size={16} />
    </button>
    <div class="w-px h-4 bg-white/10 mx-1"></div>
    <button onclick={() => insert('[', '](url)')} class="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Lien">
        <Link size={16} />
    </button>
</div>