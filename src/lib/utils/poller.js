import { onMount, onDestroy } from 'svelte';

/**
 * Lance une fonction de mise à jour à intervalles réguliers.
 * S'arrête automatiquement si l'onglet n'est plus visible pour économiser les ressources.
 *
 * @param {Function} callback - La fonction async à appeler (ex: fetchTraffic)
 * @param {number} intervalMs - Intervalle en ms (défaut: 30000ms = 30s)
 */
export function usePolling(callback, intervalMs = 30000) {
    let interval;

    function start() {
        stop(); // Sécurité pour éviter les doublons
        interval = setInterval(() => {
            if (typeof document !== 'undefined' && !document.hidden) {
                callback();
            }
        }, intervalMs);
    }

    function stop() {
        if (interval) clearInterval(interval);
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stop();
        } else {
            // Reprendre immédiatement et relancer le timer quand l'utilisateur revient
            callback(); 
            start();
        }
    }

    onMount(() => {
        // Premier appel immédiat au montage
        callback();
        start();
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
        }
    });

    onDestroy(() => {
        stop();
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
    });
}