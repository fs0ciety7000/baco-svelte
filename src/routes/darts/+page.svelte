<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase'; // Assurez-vous que cet import est correct
    import { toast } from '$lib/stores/toast';
    import { Target, RotateCcw, X, Check, ArrowRight, UserPlus, Zap } from 'lucide-svelte';

    // --- CONSTANTES DU JEU ---
    const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
    const GAME_MODES = {
        '301': { name: '301', startScore: 301 },
        '501': { name: '501', startScore: 501 },
        'SHANGHAI': { name: 'Shanghai', startScore: 60 } // Shanghai score est initialisé par segment
    };
    const DIFFICULTY_MODES = [
        { name: 'Facile (Débutant)', accuracy: 0.75 },
        { name: 'Normal (Amateur)', accuracy: 0.5 },
        { name: 'Difficile (Pro)', accuracy: 0.25 },
    ];
    
    // --- ÉTATS GLOBAUX ---
    let allUsers = []; // Profils Supabase
    let selectedPlayers = []; // IDs des joueurs sélectionnés
    let currentPlayerIndex = 0;
    let turnScores = []; // Score des 3 fléchettes de la manche actuelle
    let hitCount = 0; // Fléchettes lancées dans la manche
    let isFinished = false;
    let isLoading = true;

    // --- ÉTATS DE LA PARTIE ---
    let settings = {
        mode: '501',
        difficulty: 1, // Index 1 = Normal
        players: [] // [{ id: UUID, name: string, score: number, round: number(Shanghai only) }]
    };

    // --- FONCTIONS SUPABASE ---
    onMount(async () => {
        await loadAllUsers();
        isLoading = false;
    });

    async function loadAllUsers() {
        const { data } = await supabase.from('profiles').select('id, full_name, username').order('full_name', { ascending: true });
        if (data) {
            allUsers = data;
        }
    }

    // --- LOGIQUE MULTIJOUEUR ---

    function addPlayer(user) {
        if (settings.players.some(p => p.id === user.id)) return;
        
        const initialRound = settings.mode === 'SHANGHAI' ? 1 : 0;
        
        settings.players = [...settings.players, {
            id: user.id,
            name: user.full_name || user.username,
            score: GAME_MODES[settings.mode].startScore,
            history: [],
            round: initialRound,
            // Pour le mode Shanghai
            shanghaiHits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0 }
        }];
        selectedPlayers = settings.players.map(p => p.id);
    }
    
    function removePlayer(id) {
        settings.players = settings.players.filter(p => p.id !== id);
        selectedPlayers = settings.players.map(p => p.id);
        if (settings.players.length > 0 && currentPlayerIndex >= settings.players.length) {
            currentPlayerIndex = 0;
        }
    }

    // --- LOGIQUE DE JEU ---

    function resetGame() {
        if (settings.players.length === 0) return;
        
        settings.players = settings.players.map(p => ({
            ...p,
            score: GAME_MODES[settings.mode].startScore,
            history: [],
            round: settings.mode === 'SHANGHAI' ? 1 : 0,
            shanghaiHits: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0 }
        }));
        currentPlayerIndex = 0;
        isFinished = false;
        resetTurn();
        toast.info(`Nouvelle partie de ${GAME_MODES[settings.mode].name} lancée !`, 3000);
    }

    function resetTurn() {
        turnScores = [];
        hitCount = 0;
    }
    
    // Simule la fléchette en fonction de la difficulté
    function throwDart() {
        const currentPlayer = settings.players[currentPlayerIndex];
        if (isFinished || hitCount >= 3 || !currentPlayer) return;

        const difficulty = DIFFICULTY_MODES[settings.difficulty].accuracy;
        let dartScore = 0;
        let hitType = 'Single';
        let hitSegment = 0;

        // Simuler l'exactitude (plus l'accuracy est faible, plus le lancer est précis)
        const accuracyRoll = Math.random();

        if (accuracyRoll < 0.02 * difficulty) {
            // 2% de chance * difficulté de rater complètement
            hitSegment = 0;
            hitType = 'Raté';
        } else if (accuracyRoll < 0.1 * difficulty) {
            // Bullseye (50 ou 25)
            dartScore = Math.random() < 0.5 ? 50 : 25;
            hitSegment = dartScore;
            hitType = dartScore === 50 ? 'Bullseye' : 'Outer Bull';
        } else {
            // Atteindre un segment aléatoire
            const segmentIndex = Math.floor(Math.random() * SEGMENTS.length);
            hitSegment = SEGMENTS[segmentIndex];
            
            // Simuler Double/Triple basé sur l'exactitude
            if (accuracyRoll < 0.2 * difficulty) {
                dartScore = hitSegment * 3;
                hitType = 'Triple';
            } else if (accuracyRoll < 0.4 * difficulty) {
                dartScore = hitSegment * 2;
                hitType = 'Double';
            } else {
                dartScore = hitSegment;
                hitType = 'Single';
            }
        }
        
        // Exécuter la logique de score spécifique au mode
        if (settings.mode === 'SHANGHAI') {
            dartScore = scoreShanghai(currentPlayer, hitSegment, hitType);
        }
        
        turnScores = [...turnScores, { score: dartScore, segment: hitSegment, type: hitType }];
        hitCount++;

        toast.info(`Fléchette ${hitCount}: ${dartScore} points (${hitType} ${hitSegment})`, 1500);

        // Si c'est la dernière fléchette de la manche, valider
        if (hitCount === 3) {
            setTimeout(validateTurn, 1000);
        }
    }

    // Gère le scoring pour le mode Shanghai
    function scoreShanghai(player, segment, type) {
        const roundNumber = player.round;
        if (roundNumber > 20) return 0;
        
        if (segment === roundNumber) {
            let multiplier = 1;
            if (type === 'Double') multiplier = 2;
            if (type === 'Triple') multiplier = 3;
            
            player.shanghaiHits[roundNumber]++;
            return segment * multiplier;
        }
        return 0; // 0 point si le segment n'est pas celui de la manche
    }

    function validateTurn() {
        const currentPlayer = settings.players[currentPlayerIndex];
        const turnTotal = turnScores.reduce((sum, s) => sum + s.score, 0);

        if (settings.mode === 'SHANGHAI') {
            validateShanghaiTurn(currentPlayer, turnTotal);
        } else {
            validateX01Turn(currentPlayer, turnTotal);
        }
    }

    // Validation pour les modes X01 (301/501)
    function validateX01Turn(currentPlayer, turnTotal) {
        let newScore = currentPlayer.score - turnTotal;
        
        // Règle X01: Check bust (si score est 1 ou moins, sauf si 0)
        if (newScore < 2 && newScore !== 0) {
            // Bust: Score non modifié
            newScore = currentPlayer.score;
            toast.error(`BUST ! Score cible trop bas (${currentPlayer.score - turnTotal}). Score conservé.`, 3000);
        }
        
        // Enregistrement de l'historique
        currentPlayer.history = [...currentPlayer.history, { 
            scoreBefore: currentPlayer.score, 
            turnScores: turnScores.map(t => t.score), 
            total: turnTotal, 
            result: newScore === currentPlayer.score ? 'BUST' : newScore 
        }];
        
        currentPlayer.score = newScore;
        
        // Vérification de la victoire
        if (newScore === 0) {
            isFinished = true;
            toast.success(`${currentPlayer.name} gagne la partie de ${GAME_MODES[settings.mode].name} !`, 5000);
        }

        // Passage au joueur suivant
        nextPlayer();
    }
    
    // Validation pour le mode Shanghai
    function validateShanghaiTurn(currentPlayer, turnTotal) {
        const roundNumber = currentPlayer.round;
        const shanghaiHits = currentPlayer.shanghaiHits[roundNumber];

        // 1. Détection de la victoire (Shanghai)
        if (shanghaiHits.single >= 1 && shanghaiHits.double >= 1 && shanghaiHits.triple >= 1) {
            isFinished = true;
            toast.success(`${currentPlayer.name} a réussi Shanghai au tour ${roundNumber} et gagne !`, 5000);
            currentPlayer.score += turnTotal; // Le score final est le total de points
        } else {
            // 2. Mise à jour du score
            currentPlayer.score += turnTotal;
            currentPlayer.round++;
            
            // Si toutes les rondes sont terminées (20), le score final gagne
            if (currentPlayer.round > 20) {
                 // La partie se termine après le tour 20
                 isFinished = true;
                 toast.info(`Fin des 20 tours. Le score le plus élevé gagne !`, 5000);
            }
        }
        
        // Enregistrement de l'historique (mode Shanghai)
        currentPlayer.history = [...currentPlayer.history, { 
            scoreBefore: currentPlayer.score - turnTotal, 
            turnScores: turnScores.map(t => t.score), 
            total: turnTotal, 
            result: `Ronde ${roundNumber} (${currentPlayer.score})`
        }];

        // Passage au joueur suivant
        nextPlayer();
    }

    function nextPlayer() {
        if (isFinished) return;
        
        // Passage au joueur suivant
        currentPlayerIndex = (currentPlayerIndex + 1) % settings.players.length;
        resetTurn();

        // Si le mode est Shanghai et qu'on revient au premier joueur, on passe à la ronde suivante
        if (settings.mode === 'SHANGHAI' && currentPlayerIndex === 0) {
            // Note: La ronde est avancée à la fin du tour du joueur.
        }
        
        // Déclencher une mise à jour réactive (important pour Svelte)
        settings.players = settings.players; 
    }
    
    // État du joueur actuel
    $: currentPlayer = settings.players[currentPlayerIndex];
    $: isX01Mode = settings.mode === '301' || settings.mode === '501';
    
</script>

<svelte:head>
    <title>Jeu de Fléchettes - BACO</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 border-gray-200 dark:border-gray-700">
        <h1 class="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100 flex items-center gap-3">
            <Target class="w-8 h-8 text-blue-500" />
            Fléchettes : {GAME_MODES[settings.mode].name}
        </h1>
        <button on:click={resetGame} disabled={isFinished} class="mt-2 sm:mt-0 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50" title="Nouvelle Partie">
            <RotateCcw class="w-4 h-4" /> Nouvelle Partie
        </button>
    </header>

    <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Mode de Jeu</label>
            <select bind:value={settings.mode} on:change={resetGame} class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                {#each Object.entries(GAME_MODES) as [key, mode]}
                    <option value={key}>{mode.name} ({mode.startScore})</option>
                {/each}
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Difficulté (Simulation)</label>
            <select bind:value={settings.difficulty} on:change={resetGame} class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                {#each DIFFICULTY_MODES as mode, index}
                    <option value={index}>{mode.name}</option>
                {/each}
            </select>
        </div>
        <div>
            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Ajouter un Joueur</label>
            <select on:change={(e) => addPlayer(allUsers.find(u => u.id === e.target.value))} value="" class="w-full p-2 border rounded-lg dark:bg-gray-700 dark:text-white">
                <option value="" disabled>-- Sélectionner --</option>
                {#each allUsers.filter(u => !selectedPlayers.includes(u.id)) as user}
                    <option value={user.id}>{user.full_name} (@{user.username})</option>
                {/each}
            </select>
        </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6 md:col-span-2">
            
            <h2 class="text-2xl font-bold dark:text-white flex items-center gap-2">
                Tour : <span class="text-blue-600">{currentPlayer?.name || 'Aucun Joueur'}</span>
                <span class="text-lg text-gray-500 font-normal ml-auto">
                    Manche : <span class="font-bold">{settings.mode === 'SHANGHAI' ? currentPlayer?.round : currentPlayer?.history.length + 1}</span>
                </span>
            </h2>

            {#if isX01Mode}
                <p class="text-gray-500 dark:text-gray-400 text-center text-xl">
                    Score Restant : <span class="text-red-600 font-extrabold">{currentPlayer?.score}</span>
                </p>
            {:else if settings.mode === 'SHANGHAI'}
                <p class="text-gray-500 dark:text-gray-400 text-center text-xl">
                    Cible : <span class="text-red-600 font-extrabold">{currentPlayer?.round || 1}</span> (Total: {currentPlayer?.score})
                </p>
            {/if}

            <div class="flex justify-center items-center h-64">
                <button 
                    on:click={throwDart}
                    disabled={isFinished || hitCount >= 3 || settings.players.length < 1}
                    class="relative w-64 h-64 rounded-full shadow-2xl transition-transform duration-100 
                    {isFinished || settings.players.length < 1 ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}"
                    style="background-image: radial-gradient(circle at center, gold 10%, red 12%, black 25%, green 27%, red 40%, black 42%, white 55%, red 57%, black 70%, white 72%);"
                    title="Cliquer pour lancer la fléchette #{hitCount + 1}"
                >
                    <Target class="w-12 h-12 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white/50" />
                    {#if isFinished}
                        <Check class="w-16 h-16 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-green-500 bg-white/70 rounded-full p-1" />
                    {/if}
                    {#if settings.players.length < 1}
                        <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-bold text-sm bg-white/70 p-2 rounded-lg text-gray-800">Ajouter des joueurs</span>
                    {/if}
                </button>
            </div>

            <div class="flex justify-center gap-4 pt-4">
                {#each Array(3) as _, i}
                    <div class="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white border-2 transition-all duration-300
                        {i < hitCount ? 'bg-blue-600 border-blue-800' : 'bg-gray-300 dark:bg-gray-700 border-gray-400 dark:border-gray-600'}"
                    >
                        {#if turnScores[i] !== undefined}
                            <div class="text-center text-xs">
                                <span>{turnScores[i].score}</span>
                                <div class="text-[8px] font-normal">{turnScores[i].type.substring(0, 3)}</div>
                            </div>
                        {:else}
                            <X class="w-5 h-5 text-gray-700 dark:text-gray-400" />
                        {/if}
                    </div>
                {/each}
            </div>

            {#if hitCount === 3 && !isFinished}
                <div class="text-center font-bold text-xl text-green-500 p-2 mt-4 border-t border-green-500/50">
                    Manche terminée. Prêt pour le prochain joueur.
                </div>
            {/if}
            
            {#if isFinished}
                 <div class="text-center font-bold text-xl text-green-500 p-2 mt-4 border-t border-green-500/50">
                    PARTIE TERMINÉE ! {currentPlayer?.name || 'Quelqu\'un'} Gagne.
                 </div>
            {/if}

        </div>
        
        <div class="space-y-6">
            
            <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-3">
                <h3 class="text-xl font-bold dark:text-white border-b pb-2">Tableau des Scores</h3>
                
                {#if settings.players.length > 0}
                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 grid grid-cols-3 gap-2">
                        <span>Joueur</span>
                        <span>Score {isX01Mode ? 'Restant' : 'Total'}</span>
                        <span class="text-right">Dernier Tour</span>
                    </div>
                    
                    {#each settings.players as player, index}
                        <div class="text-sm dark:text-gray-300 grid grid-cols-3 gap-2 border-t pt-2 items-center
                            {index === currentPlayerIndex ? 'bg-blue-500/10 dark:bg-blue-900/20 font-bold border-blue-500/50' : 'border-gray-100 dark:border-gray-700/50'}"
                        >
                            <span class="flex items-center gap-2">
                                {player.name}
                                {#if index === currentPlayerIndex}<Zap class="w-3 h-3 text-yellow-500 fill-yellow-500" />{/if}
                            </span>
                            <span class="text-red-600 font-bold text-lg">{player.score}</span>
                            <span class="text-right text-sm text-gray-600 dark:text-gray-400">
                                {player.history[player.history.length - 1]?.total || 0}
                            </span>
                            <button on:click={() => removePlayer(player.id)} class="text-red-500 hover:text-red-700 justify-self-start col-span-1 text-xs px-1">
                                <X class="w-3 h-3" />
                            </button>
                        </div>
                    {/each}
                {:else}
                    <p class="text-gray-500 dark:text-gray-400 italic text-center">Ajoutez des joueurs pour commencer !</p>
                {/if}
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-3 max-h-96 overflow-y-auto">
                <h3 class="text-xl font-bold dark:text-white border-b pb-2">Historique ({currentPlayer?.name || 'Sélectionner un joueur'})</h3>
                
                {#if currentPlayer?.history.length > 0}
                    <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 grid grid-cols-3 gap-2">
                        <span>Tour</span>
                        <span>Score Avant</span>
                        <span>Points / Résultat</span>
                    </div>
                    
                    {#each currentPlayer.history.slice().reverse() as turn, index}
                        <div class="text-sm dark:text-gray-300 grid grid-cols-3 gap-2 border-t border-gray-100 dark:border-gray-700/50 pt-2">
                            <span>#{currentPlayer.history.length - index}</span>
                            <span>{turn.scoreBefore}</span>
                            <span class={turn.result === 'BUST' ? 'text-red-500 font-medium' : 'text-blue-600 font-medium'}>
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
</div>