<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import { dartsStore } from '$lib/stores/dartsStore';
    
    // Composants et icônes
    import Dartboard from './Dartboard.svelte';
    import { Target, RotateCcw, User, Zap, X } from 'lucide-svelte';

    // Récupération des constantes du store
    const GAME_MODES = dartsStore.GAME_MODES;
    const DIFFICULTY_MODES = dartsStore.DIFFICULTY_MODES;
    
    // Abonnements
    let game = {};
    dartsStore.subscribe(val => game = val);

    let allUsers = []; // Profils Supabase
    let selectedPlayerIds = [];
    let session;

    // --- LOGIQUE SUPABASE ET JOUEUR ---
    onMount(async () => {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        session = currentSession;
        
        if (!session) {
            toast.error("Veuillez vous connecter pour jouer aux fléchettes.");
            return;
        }

        // Charger tous les utilisateurs pour le multijoueur
        const { data: userData } = await supabase.from('profiles').select('id, full_name, username').order('full_name', { ascending: true });
        if (userData) {
            allUsers = userData;
            // Ajouter l'utilisateur actuel par défaut
            const self = allUsers.find(u => u.id === session.user.id);
            if (self && game.players.length === 0) {
                 // addPlayer(self); // Laissez l'utilisateur ajouter son joueur dans l'UI pour simplifier l'état local
            }
        }
    });

    // --- LOGIQUE D'ÉTAT LOCAL (pour le panneau de configuration) ---

    let tempMode = '501';
    let tempDifficulty = 1;
    let tempPlayers = []; // Utilisé pour construire la liste des joueurs avant de démarrer

    function addPlayer(user) {
        if (tempPlayers.some(p => p.id === user.id)) return;
        tempPlayers = [...tempPlayers, { id: user.id, name: user.full_name || user.username }];
        selectedPlayerIds = tempPlayers.map(p => p.id);
    }

    function removePlayer(id) {
        tempPlayers = tempPlayers.filter(p => p.id !== id);
        selectedPlayerIds = tempPlayers.map(p => p.id);
    }
    
    function startGame() {
        if (tempPlayers.length === 0) {
            toast.warning("Veuillez sélectionner des joueurs.");
            return;
        }
        
        dartsStore.createNewGame(tempMode, tempDifficulty, tempPlayers, session.user.id);
    }

    // --- VUES RÉACTIVES ---
    $: currentPlayer = game.players[game.currentPlayerIndex];
    $: isX01Mode = game.mode === '301' || game.mode === '501';
    $: canThrow = game.status === 'playing' && game.hitCount < 3 && currentPlayer?.id && session?.user.id === currentPlayer.id;
</script>

<svelte:head>
    <title>Darts Multijoueur - BACO</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <header class="flex items-center justify-between border-b pb-4 border-gray-200 dark:border-gray-700">
        <h1 class="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100 flex items-center gap-3">
            <Target class="w-8 h-8 text-blue-500" />
            Jeu de Fléchettes (Darts)
        </h1>
        {#if game.status !== 'playing'}
             <button on:click={startGame} disabled={tempPlayers.length === 0} class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
                <Target class="w-4 h-4 mr-2" /> Démarrer la Partie
            </button>
        {/if}
    </header>

    {#if game.status === 'waiting'}
        <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium dark:text-gray-300 mb-1">Mode de Jeu</label>
                    <select bind:value={tempMode} class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                        {#each Object.entries(GAME_MODES) as [key, mode]}
                            <option value={key}>{mode.name}</option>
                        {/each}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium dark:text-gray-300 mb-1">Difficulté (Simulation)</label>
                    <select bind:value={tempDifficulty} class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                        {#each DIFFICULTY_MODES as mode, index}
                            <option value={index}>{mode.name}</option>
                        {/each}
                    </select>
                </div>
            </div>
            
            <div class="md:col-span-2 space-y-4">
                <h3 class="text-lg font-bold dark:text-white flex items-center gap-2">
                    <UserPlus class="w-5 h-5" /> Joueurs Sélectionnés
                </h3>
                
                <div class="flex flex-wrap gap-2 min-h-[50px] border p-2 rounded-lg dark:border-gray-700">
                    {#each tempPlayers as player (player.id)}
                        <span class="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium px-3 py-1 rounded-full flex items-center gap-1">
                            {player.name}
                            <button on:click={() => removePlayer(player.id)} class="text-blue-800 dark:text-blue-200 hover:text-red-500 ml-1">
                                <X class="w-3 h-3" />
                            </button>
                        </span>
                    {/each}
                    {#if tempPlayers.length === 0}
                        <p class="text-gray-500 italic text-sm">Ajouter des profils Supabase ci-dessous.</p>
                    {/if}
                </div>
                
                <label class="block text-sm font-medium dark:text-gray-300 mb-1">Ajouter un Joueur</label>
                <select on:change={(e) => addPlayer(allUsers.find(u => u.id === e.target.value))} value="" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                    <option value="" disabled>-- Sélectionner un profil --</option>
                    {#each allUsers.filter(u => !selectedPlayerIds.includes(u.id)) as user}
                        <option value={user.id}>{user.full_name || user.username} (@{user.username})</option>
                    {/each}
                </select>
            </div>
            
            <div class="md:col-span-3 flex justify-center mt-4">
                <button on:click={startGame} disabled={tempPlayers.length === 0} class="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50">
                    DÉMARRER LA PARTIE {GAME_MODES[tempMode].name}
                </button>
            </div>
            
        </div>
        
    {:else if game.status === 'playing' || game.status === 'finished'}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            <div class="md:col-span-2 space-y-6">
                
              <div class="flex items-center justify-between p-4 bg-blue-600/10 dark:bg-blue-900/20 rounded-xl border border-blue-600/50">
    <h2 class="text-xl font-bold dark:text-white flex items-center gap-3">
        <Zap class="w-6 h-6 text-yellow-500 fill-yellow-500" />
        AU TOUR DE : <span class="text-blue-600 dark:text-blue-400">{currentPlayer?.name || '...'}</span>
    </h2>
    {#if game.mode === 'SHANGHAI'}
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">Cible : {currentPlayer?.round || '...'}</span>
    {:else}
        <span class="text-lg font-bold text-gray-700 dark:text-gray-300">Score restant : <span class="text-red-600">{currentPlayer?.score || '...'}</span></span>
    {/if}
</div>

<Dartboard 
    on:throw={({ detail }) => dartsStore.throwDart(detail.segment, detail.type)} 
    disabled={!canThrow}
/>
                
                <div class="flex justify-center gap-4 pt-4 border-t pt-6 dark:border-gray-700">
                    {#each [1, 2, 3] as i}
                        <div class="w-16 h-16 rounded-lg flex flex-col items-center justify-center font-bold text-white border-2 transition-all duration-300 shadow-md
                            {i <= game.hitCount ? 'bg-green-600 border-green-800' : 'bg-gray-300 dark:bg-gray-700 border-gray-400 dark:border-gray-600'}"
                        >
                            {#if game.turnScores[i-1] !== undefined}
                                <span class="text-lg">{game.turnScores[i-1].score}</span>
                                <span class="text-xs font-normal">{game.turnScores[i-1].type.substring(0, 3)} {game.turnScores[i-1].segment}</span>
                            {:else}
                                <X class="w-6 h-6 text-gray-700 dark:text-gray-400" />
                            {/if}
                        </div>
                    {/each}
                </div>
                
                {#if game.hitCount === 3 && canThrow}
                    <button on:click={dartsStore.validateTurn} class="w-full mt-4 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold">
                        Passer au joueur suivant
                    </button>
                {/if}
            </div>
            
            <div class="space-y-6">
                <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-3">
                    <h3 class="text-xl font-bold dark:text-white border-b pb-2">Tableau des Scores</h3>
                    <div class="space-y-3">
                        {#each game.players as player, index (player.id)}
                            <div class="p-3 rounded-lg border flex items-center justify-between transition-all duration-200
                                {index === game.currentPlayerIndex && game.status === 'playing' ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-500' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-700'}
                                {player.is_winner ? 'bg-green-100 dark:bg-green-900/50 border-green-500' : ''}"
                            >
                                <span class="font-bold">
                                    {player.name}
                                    {#if player.is_winner} (Gagnant!) {/if}
                                </span>
                                <span class="text-2xl font-extrabold text-red-600 dark:text-red-400">
                                    {isX01Mode ? player.score : player.score}
                                </span>
                            </div>
                        {/each}
                    </div>
                    
                    {#if game.status === 'finished'}
                         <div class="pt-4 text-center">
                            <button on:click={() => dartsStore.resetGame()} class="text-sm text-red-500 hover:text-red-700 flex items-center mx-auto">
                                <RotateCcw class="w-4 h-4 mr-1" /> Terminer et configurer une nouvelle partie
                            </button>
                        </div>
                    {/if}
                </div>

                <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-3 max-h-96 overflow-y-auto">
                    <h3 class="text-xl font-bold dark:text-white border-b pb-2">Historique ({currentPlayer?.name || '...'})</h3>
                    
                    {#if currentPlayer?.history.length > 0}
                        <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 grid grid-cols-3 gap-2">
                            <span>Tour</span>
                            <span>Points</span>
                            <span>Résultat</span>
                        </div>
                        
                        {#each currentPlayer.history.slice().reverse() as turn}
                            <div class="text-sm dark:text-gray-300 grid grid-cols-3 gap-2 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                                <span>#{turn.turn}</span>
                                <span class="text-blue-600 font-medium">{turn.score}</span>
                                <span class={turn.result === 'BUST' ? 'text-red-500' : 'text-gray-800 dark:text-gray-200'}>
                                    {turn.result}
                                </span>
                            </div>
                        {/each}
                    {:else}
                        <p class="text-gray-500 dark:text-gray-400 italic text-center">Lancez la première fléchette !</p>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>