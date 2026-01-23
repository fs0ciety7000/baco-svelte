<script>
    export let user;
    
    // On génère une date lisible
    const now = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute:'2-digit' });
    
    // Texte affiché : Email + Date
    const text = `${user?.email || 'UTILISATEUR'} • ${now}`;
    
    // On répète le motif 30 fois pour être sûr de couvrir les grands écrans
    const pattern = Array(30).fill(text);
</script>

<div class="fixed inset-0 z-[9999] pointer-events-none overflow-hidden flex flex-wrap content-center justify-center opacity-[0.04] select-none mix-blend-difference">
    {#each pattern as item}
        <div class="w-80 h-40 flex items-center justify-center transform -rotate-45 text-sm font-black text-gray-500 whitespace-nowrap">
            {item}
        </div>
    {/each}
</div>