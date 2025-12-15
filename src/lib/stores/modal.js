import { writable } from 'svelte/store';

// Store principal pour gérer l'état de la modale de confirmation
export const confirmModal = writable({
    isOpen: false,
    message: '',
    callback: null, // Fonction à exécuter si l'utilisateur confirme
});

/**
 * Affiche la modale de confirmation.
 * @param {string} message - Le message de confirmation (ex: "Êtes-vous sûr de supprimer ?").
 * @param {function} callback - La fonction à appeler si l'utilisateur clique sur "Confirmer".
 */
export function openConfirmModal(message, callback) {
    confirmModal.set({
        isOpen: true,
        message,
        callback,
    });
}

/**
 * Ferme la modale (utilisée pour l'annulation ou après l'exécution du callback).
 */
export function closeConfirmModal() {
    confirmModal.set({
        isOpen: false,
        message: '',
        callback: null,
    });
}