<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { Users, Save, Loader2, RefreshCw } from 'lucide-svelte';
    import { usePolling } from '$lib/utils/poller'; // Assurez-vous d'avoir créé ce fichier (voir réponse précédente)
    import { fade } from 'svelte/transition';

    // --- RUNES ---
    let { compact = false } = $props();

    let content = $state("");
    let lastAuthor = $state("");
    let updatedAt = $state("");
    let isSaving = $state(false);
    let isLoading = $state(true);
    let textareaEl;
    let saveTimeout;

    // --- LOGIQUE ---

    // 1. Lecture (Polling toutes les 10s)
    // On ne recharge PAS si l'utilisateur est en train de taper (textarea focus) pour ne pas écraser son texte
    async function fetchBoard() {
        if (document.activeElement === textareaEl) return; 

        try {
            const { data, error } = await supabase
                .from('team_board')
                .select('content, last_author, updated_at')
                .eq('id', 1)
                .single();
            
            if (data) {
                // On met à jour seulement si le contenu a changé
                if (data.content !== content) {
                    content = data.content || "";
                }
                lastAuthor = data.last_author;
                updatedAt = new Date(data.updated_at).toLocaleTimeString('fr-BE', {hour: '2-digit', minute:'2-digit'});
            }
        } catch (e) {
            console.error("Erreur chargement board:", e);
        } finally {
            isLoading = false;
        }
    }

    // Activer le polling
    usePolling(fetchBoard, 10000);

    // 2. Sauvegarde (Debounce)
    function handleInput() {
        isSaving = true;
        clearTimeout(saveTimeout);
        
        // On attend 1.5 seconde d'inactivité avant d'envoyer à Supabase
        saveTimeout = setTimeout(async () => {
            await saveToSupabase();
        }, 1500);
    }

   async function saveToSupabase() {
        // 1. Récupérer l'utilisateur connecté
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) return; // Sécurité si déconnecté

        // 2. Chercher son vrai nom dans la table 'profiles'
        let userName = "Quelqu'un";
        
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();
            
            // Si on trouve un profil avec un nom, on l'utilise
            if (profile && profile.full_name) {
                userName = profile.full_name;
            } else {
                // Sinon, on tente l'email ou les métadonnées comme plan B
                userName = user.user_metadata?.full_name || user.email?.split('@')[0] || "Inconnu";
            }
        } catch (e) {
            console.error("Erreur récup profil:", e);
        }

        // 3. Sauvegarder dans le tableau blanc
        const { error } = await supabase
            .from('team_board')
            .upsert({ 
                id: 1, 
                content: content,
                last_author: userName, // Ici on a maintenant le bon nom
                updated_at: new Date()
            });

        if (!error) {
            isSaving = false;
            lastAuthor = userName;
            updatedAt = new Date().toLocaleTimeString('fr-BE', {hour: '2-digit', minute:'2-digit'});
        } else {
            console.error("Erreur sauvegarde board:", error);
        }
    }
</script>

<div class="glass-panel {compact ? 'p-2' : 'p-4'} rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-900/10 to-purple-900/10 backdrop-blur-md h-full flex flex-col transition-all duration-300 group">
    
    <div class="flex justify-between items-center {compact ? 'mb-2' : 'mb-3'} shrink-0">
        <div class="flex items-center gap-2 text-indigo-300">
            <Users class="{compact ? 'w-4 h-4' : 'w-5 h-5'}" />
            <span class="{compact ? 'text-sm' : 'text-base'} font-bold">Tableau d'équipe</span>
        </div>

        <div class="flex items-center gap-2">
            {#if isSaving}
                <span class="text-[10px] text-yellow-400 flex items-center gap-1" transition:fade>
                    <Loader2 class="w-3 h-3 animate-spin"/> {!compact ? 'Sauvegarde...' : ''}
                </span>
            {:else if lastAuthor}
                 <span class="text-[9px] text-gray-400 text-right leading-tight" transition:fade>
                    {#if !compact}Modifié par <strong class="text-indigo-200">{lastAuthor}</strong> à {updatedAt}{:else}{updatedAt}{/if}
                 </span>
            {/if}
        </div>
    </div>

    <div class="flex-grow relative w-full bg-black/20 rounded-xl border border-white/5 overflow-hidden">
        {#if isLoading && !content}
             <div class="absolute inset-0 flex items-center justify-center text-gray-500 gap-2">
                <Loader2 class="w-4 h-4 animate-spin" />
             </div>
        {/if}
        
        <textarea 
            bind:this={textareaEl}
            bind:value={content}
            oninput={handleInput}
            placeholder="Écrivez un message pour l'équipe..."
            class="w-full h-full bg-transparent {compact ? 'p-2 text-xs' : 'p-3 text-sm'} text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:bg-white/[0.02] transition-colors leading-relaxed custom-scrollbar"
        ></textarea>
        
        <div class="absolute bottom-2 right-2 pointer-events-none opacity-50">
             {#if isSaving}
                <Save class="w-4 h-4 text-yellow-500/50" />
             {:else}
                <RefreshCw class="w-4 h-4 text-green-500/30" />
             {/if}
        </div>
    </div>
</div>