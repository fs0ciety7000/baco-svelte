// src/lib/stores/presence.svelte.js
import { supabase } from '$lib/supabase';

// État global réactif (Rune)
let onlineUsers = $state([]);
let currentUser = null;
let heartbeatInterval;
let fetchInterval;

export const presenceState = {
    // Getter pour l'affichage
    get count() { return onlineUsers.length; },
    get users() { return onlineUsers; },
    
    // Initialisation (à appeler une seule fois dans +layout.svelte)
    init(user) {
        if (!user || currentUser) return; // Déjà init ou pas de user
        currentUser = user;

        // 1. Lancer les cycles
        this.sendHeartbeat();
        this.fetchOnlineUsers();

        heartbeatInterval = setInterval(() => this.sendHeartbeat(), 30000); // Toutes les 30s
        fetchInterval = setInterval(() => this.fetchOnlineUsers(), 15000);  // Rafraîchir la liste toutes les 15s
    },

    // Dire "Je suis là" (Upsert)
    async sendHeartbeat() {
        if (!currentUser) return;
        await supabase.from('user_presence').upsert({
            user_id: currentUser.id,
            last_seen_at: new Date().toISOString(),
            current_path: window.location.pathname // Bonus: on sait où ils sont
        });
    },

    // Demander "Qui est là ?" (Select)
    async fetchOnlineUsers() {
        // On considère en ligne ceux vus il y a moins de 60 secondes
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

        const { data } = await supabase
            .from('user_presence')
            .select('user_id, last_seen_at, profiles(full_name, avatar_url)')
            .gt('last_seen_at', oneMinuteAgo)
            .order('last_seen_at', { ascending: false });

        if (data) {
            onlineUsers = data.map(u => u.profiles); // On garde juste les profils
        }
    },

    // Nettoyage (optionnel si SPA, mais propre)
    destroy() {
        clearInterval(heartbeatInterval);
        clearInterval(fetchInterval);
    }
};