<script>
    import { onMount } from 'svelte';
    import { toast } from '$lib/stores/toast';

    onMount(() => {
        // --- 1. BLOQUER CLIC DROIT ---
        const handleContextMenu = (e) => {
            e.preventDefault();
            return false;
        };

        // --- 2. VIDER LE PRESSE-PAPIER (Clipboard Nuke) ---
        const nukeClipboard = async () => {
            try {
                await navigator.clipboard.writeText('⚠️ DONNÉES CONFIDENTIELLES - COPIE INTERDITE ⚠️');
            } catch (err) { /* Ignorer si pas les droits */ }
        };

        // --- 3. DÉTECTION DES TOUCHES (Capture & Impression) ---
        const handleKeyDown = (e) => {
            if (
                e.key === 'PrintScreen' || // Touche Impr. Ecran
                (e.ctrlKey && e.key === 'p') || // Ctrl+P
                (e.ctrlKey && e.shiftKey && e.key === 's') || // Windows Snipping Tool
                (e.metaKey && e.shiftKey) // Mac Cmd+Shift+...
            ) {
                e.preventDefault(); // Annule l'action si possible
                nukeClipboard();    // Écrase le presse-papier
                
                // Punition visuelle immédiate (écran noir)
                document.body.style.display = 'none';
                alert("Capture d'écran interdite sur cette application.");
                document.body.style.display = 'block';
                
                toast.error("Action non autorisée !");
            }
        };

        // --- 4. BLOQUER COPIER / COUPER ---
        const handleCopyCut = (e) => {
            e.preventDefault();
            nukeClipboard();
            toast.warning("La copie est désactivée par sécurité.");
        };

        // --- 5. FLOUTER SI ON QUITTE LA FENÊTRE ---
        const handleBlur = () => {
            document.documentElement.style.filter = 'blur(15px) grayscale(100%)';
        };
        const handleFocus = () => {
            document.documentElement.style.filter = 'none';
        };

        // Activation des écouteurs
        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('copy', handleCopyCut);
        document.addEventListener('cut', handleCopyCut);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('focus', handleFocus);

        // Nettoyage à la destruction du composant
        return () => {
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('copy', handleCopyCut);
            document.removeEventListener('cut', handleCopyCut);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('focus', handleFocus);
            document.documentElement.style.filter = 'none'; // Sécurité
        };
    });
</script>

<style>
    /* Empêche la sélection de texte partout */
    :global(body) {
        -webkit-user-select: none;
        -moz-user-select: none;
        -ms-user-select: none;
        user-select: none;
    }
    
    /* Autorise la sélection SEULEMENT dans les champs de saisie pour pouvoir travailler */
    :global(input), :global(textarea), :global([contenteditable="true"]) {
        user-select: text;
        -webkit-user-select: text;
    }
</style>