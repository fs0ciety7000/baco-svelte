<script>
    import { confirmModal, closeConfirmModal } from '$lib/stores/modal.js';
    import { fly, fade } from 'svelte/transition';
    import { AlertTriangle, X } from 'lucide-svelte'; // Icônes Lucide

    // Gère l'action de confirmation
    function handleConfirm() {
        if ($confirmModal.callback) {
            $confirmModal.callback(); // Exécute la fonction demandée
        }
        closeConfirmModal();
    }

    // Gestion de la fermeture par la touche Échap
    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            closeConfirmModal();
        }
    }
</script>

{#if $confirmModal.isOpen}
    <div 
        class="fixed inset-0 z-[1010] bg-gray-900/75 dark:bg-gray-900/90 flex items-center justify-center p-4"
        transition:fade|local
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        on:click|self={closeConfirmModal} 
        on:keydown={handleKeyDown}
        tabindex="-1"
    >
        <div 
            class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-sm w-full transform overflow-hidden"
            transition:fly|local={{ y: 20, duration: 200 }}
        >
            <div class="p-6">
                <div class="flex items-start">
                    <div class="flex-shrink-0 mr-4 mt-1">
                        <AlertTriangle class="h-6 w-6 text-yellow-500" aria-hidden="true" />
                    </div>
                    
                    <div class="flex-grow">
                        <h3 id="modal-title" class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            Confirmer l'Action
                        </h3>
                        <p class="text-sm text-gray-600 dark:text-gray-400">
                            {$confirmModal.message}
                        </p>
                    </div>

                    <button 
                        on:click={closeConfirmModal}
                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0 ml-4"
                    >
                        <X class="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div class="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end space-x-3">
                
                <button
                    on:click={closeConfirmModal}
                    type="button"
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                    Annuler
                </button>

                <button
                    on:click={handleConfirm}
                    type="button"
                    class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors shadow-md"
                >
                    Confirmer
                </button>
            </div>
        </div>
    </div>
{/if}