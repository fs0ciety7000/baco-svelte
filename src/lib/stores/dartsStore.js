// src/lib/stores/dartsStore.js

import { writable } from 'svelte/store';
import { supabase } from '$lib/supabase';
import { toast } from '$lib/stores/toast';

// --- CONSTANTES ---
const GAME_MODES = {
    '301': { name: '301', startScore: 301 },
    '501': { name: '501', startScore: 501 },
    'SHANGHAI': { name: 'Shanghai', startScore: 0 } // Le score initial est 0 pour Shanghai
};
const DIFFICULTY_MODES = [
    { name: 'Facile', accuracy: 0.9 }, // 90% de chance d'atteindre la zone visée
    { name: 'Normal', accuracy: 0.6 },
    { name: 'Difficile', accuracy: 0.3 },
];

const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// --- ÉTAT GLOBAL DE LA PARTIE ---
const initialState = {
    id: null, // ID de la partie Supabase
    mode: '501',
    difficulty: 1, // Index 'Normal'
    players: [], // [{ id, name, score, history, round, is_winner }]
    currentPlayerIndex: 0,
    turnScores: [], // Scores de la manche actuelle (max 3)
    status: 'waiting', // 'waiting', 'playing', 'finished'
    hitCount: 0,
};

const { subscribe, set, update } = writable({ ...initialState });

let realtimeChannel = null;

// --- FONCTIONS PUBLIQUES (API du Store) ---

/**
 * Charge ou crée une partie, et met en place la synchronisation Realtime.
 * @param {string | null} gameId
 */
async function loadGame(gameId = null) {
    if (realtimeChannel) {
        await supabase.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    
    // Si un ID est fourni, chargez la partie existante
    if (gameId) {
        const { data, error } = await supabase
            .from('darts_games')
            .select('*')
            .eq('id', gameId)
            .single();

        if (error || !data) {
            toast.error("Erreur de chargement de la partie.");
            set(initialState);
            return;
        }

        // Réhydratation de l'état local à partir de la BDD
        set({
            ...initialState,
            id: data.id,
            mode: data.mode,
            status: data.status,
            currentPlayerIndex: data.current_player_index,
            players: data.game_state, // game_state contient l'état complet des joueurs
            // Le reste de l'état local (turnScores, hitCount, etc.) doit être géré séparément ou réinitialisé
        });
        
        // Mettre en place le canal Realtime
        setupRealtimeSubscription(gameId);
        
    } else {
        // En mode local ou attente
        set(initialState);
    }
}

/**
 * Crée une nouvelle partie dans Supabase.
 * @param {string} mode
 * @param {number} difficultyIndex
 * @param {Array<{id: string, name: string}>} selectedPlayers
 */
async function createNewGame(mode, difficultyIndex, selectedPlayers, createdByUserId) {
    if (selectedPlayers.length < 1) {
        toast.warning("Veuillez ajouter au moins un joueur.");
        return;
    }

    const initialPlayersState = selectedPlayers.map(p => ({
        id: p.id,
        name: p.name,
        score: GAME_MODES[mode].startScore,
        history: [], // [{ turn: 1, score: 60, result: 441 }, ...]
        round: mode === 'SHANGHAI' ? 1 : 0,
        is_winner: false
    }));

    const { data, error } = await supabase
        .from('darts_games')
        .insert({
            mode,
            status: 'playing',
            current_player_index: 0,
            game_state: initialPlayersState,
            created_by: createdByUserId // Assurez-vous que created_by existe dans la table
        })
        .select()
        .single();

    if (error) {
        toast.error("Erreur lors de la création de la partie.");
        console.error(error);
        return;
    }

    // Charge la partie nouvellement créée
    loadGame(data.id);
    toast.success("Partie créée avec succès !");
    
    // Met à jour la difficulté localement (non stockée dans la BDD pour la difficulté)
    update(state => ({ ...state, difficulty: difficultyIndex }));
}

/**
 * Synchronise l'état local avec Supabase après un changement (un tir validé).
 */
async function syncGameState(state) {
    if (!state.id || state.status === 'finished') return;

    const { error } = await supabase
        .from('darts_games')
        .update({
            status: state.status,
            current_player_index: state.currentPlayerIndex,
            game_state: state.players,
            // Le mode et l'ID restent inchangés
        })
        .eq('id', state.id);

    if (error) {
        toast.error("Erreur de synchronisation avec la base de données.");
        console.error("Sync error:", error);
    }
}

/**
 * Met en place l'écoute Realtime pour les mises à jour d'autres joueurs.
 * @param {string} gameId
 */
function setupRealtimeSubscription(gameId) {
    realtimeChannel = supabase.channel(`darts_game_${gameId}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'darts_games', 
            filter: `id=eq.${gameId}`
        }, (payload) => {
            const newState = payload.new;
            // Mise à jour de l'état local avec l'état de la BDD
            update(state => {
                // Ne mettez à jour que si vous n'êtes pas celui qui vient de faire l'action
                // (Peut nécessiter une vérification plus fine si vous voulez une source unique de vérité)
                if (newState.current_player_index !== state.currentPlayerIndex || newState.status !== state.status) {
                    toast.info(`Mise à jour de la partie par ${newState.game_state[newState.current_player_index].name}`, 1500);
                }
                
                return {
                    ...state,
                    id: newState.id,
                    mode: newState.mode,
                    status: newState.status,
                    currentPlayerIndex: newState.current_player_index,
                    players: newState.game_state,
                    // Réinitialiser les scores de tour locaux pour éviter les conflits visuels
                    turnScores: [], 
                    hitCount: 0,
                };
            });
        })
        .subscribe();
}

/**
 * Simule le lancer d'une fléchette et met à jour le score de la manche.
 * @param {number} segmentHit - Le segment visé (1 à 20, 25, 50)
 * @param {string} typeHit - 'Single', 'Double', 'Triple', 'Bull', 'OuterBull', 'Miss'
 */
function throwDart(segmentHit, typeHit) {
    update(state => {
        if (state.status !== 'playing' || state.hitCount >= 3) return state;

        const difficulty = DIFFICULTY_MODES[state.difficulty].accuracy;
        let score = 0;
        let actualSegment = segmentHit;
        let actualType = typeHit;
        let originalScore = segmentHit;

        // --- SIMULATION DE DIFFICULTÉ ---
        // Si l'accuracy est faible, le coup est moins précis (simplification)
        if (Math.random() > difficulty) {
            // Le coup rate la zone visée (ex: vise le triple, mais tombe dans le single, ou un segment voisin)
            if (actualType === 'Triple') actualType = 'Single';
            else if (actualType === 'Double') actualType = 'Single';
            else if (actualType !== 'Miss' && Math.random() < 0.2) actualType = 'Miss';
        }

        // Calcul du score final
        if (actualType === 'Triple') score = originalScore * 3;
        else if (actualType === 'Double') score = originalScore * 2;
        else if (actualType === 'Bull') score = 50;
        else if (actualType === 'OuterBull') score = 25;
        else if (actualType === 'Single') score = originalScore;
        else score = 0; // Miss

        // Mettre à jour l'état local
        state.turnScores = [...state.turnScores, { score, segment: actualSegment, type: actualType }];
        state.hitCount++;

        if (state.hitCount === 3) {
            // Déclencher la validation du tour si la manche est finie
            setTimeout(() => validateTurn(), 500);
        }
        
        return state;
    });
}

/**
 * Valide le score de la manche et passe au joueur suivant, puis synchronise.
 */
function validateTurn() {
    update(state => {
        const currentPlayer = state.players[state.currentPlayerIndex];
        const turnTotal = state.turnScores.reduce((sum, s) => sum + s.score, 0);

        let newScore = currentPlayer.score;
        let resultMessage = 'Score: ' + (currentPlayer.score - turnTotal);

        if (state.mode === 'SHANGHAI') {
            newScore = scoreShanghaiMode(currentPlayer, state.turnScores);
            // Vérification de Shanghai victoire : un joueur gagne si il fait single, double et triple sur le même segment pendant sa ronde.
            const currentRound = currentPlayer.round;
            const shanghaiSegments = state.turnScores.filter(t => t.segment === currentRound);
            const hasSingle = shanghaiSegments.some(t => t.type === 'Single');
            const hasDouble = shanghaiSegments.some(t => t.type === 'Double');
            const hasTriple = shanghaiSegments.some(t => t.type === 'Triple');
            
            if (hasSingle && hasDouble && hasTriple) {
                state.status = 'finished';
                currentPlayer.is_winner = true;
                resultMessage = `SHANGHAI GAGNÉ !`;
            } else if (currentPlayer.round >= 20 && state.currentPlayerIndex === state.players.length - 1) {
                // Fin de partie Shanghai après le tour 20 de tous les joueurs
                state.status = 'finished';
                // La logique de victoire finale (meilleur score) sera gérée dans l'UI
                resultMessage = `FIN DU TOUR 20`;
            } else {
                currentPlayer.round++; // Passage à la ronde suivante (cible: 2, 3, 4...)
                resultMessage = `Ronde ${currentPlayer.round - 1} (+${turnTotal})`;
            }

        } else { // 301 / 501
            newScore = currentPlayer.score - turnTotal;

            if (newScore < 0) { // Bust
                newScore = currentPlayer.score;
                resultMessage = 'BUST';
                toast.error(`${currentPlayer.name} fait BUST !`, 2000);
            } else if (newScore === 0) { // Victoire
                state.status = 'finished';
                currentPlayer.is_winner = true;
                resultMessage = 'VICTOIRE !';
                toast.success(`${currentPlayer.name} GAGNE !`, 4000);
            }
        }
        
        // Mise à jour de l'historique
        currentPlayer.history = [...currentPlayer.history, { 
            turn: currentPlayer.history.length + 1, 
            score: turnTotal, 
            result: resultMessage 
        }];
        currentPlayer.score = newScore;

        // Passage au joueur suivant
        if (state.status === 'playing') {
            state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
            // S'assurer que le joueur suivant a le bon round de Shanghai si nécessaire
        }
        
        // Réinitialisation de la manche locale
        state.turnScores = [];
        state.hitCount = 0;
        
        // IMPORTANT: Mettre à jour la BDD après un tour complet
        syncGameState(state);
        
        return state;
    });
}

function scoreShanghaiMode(currentPlayer, turnScores) {
    const roundNumber = currentPlayer.round;
    let turnTotal = 0;
    
    // Le score total de Shanghai augmente à chaque lancer
    turnScores.forEach(throwData => {
        if (throwData.segment === roundNumber) {
            turnTotal += throwData.score;
        }
    });
    
    return currentPlayer.score + turnTotal;
}

// Révéler le store et ses fonctions
export const dartsStore = {
    subscribe,
    loadGame,
    createNewGame,
    throwDart,
    validateTurn,
    resetGame: () => set(initialState), // Réinitialisation locale simple
    // Pour la synchronisation:
    syncGameState
};