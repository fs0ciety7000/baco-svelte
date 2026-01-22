<script>
    import { Car, Train, Save, Mail, FileDown } from 'lucide-svelte';

    let { loading = $bindable(false), onSave, onCopyEmail, onGeneratePDF } = $props();
</script>

<header class="bg-white/15 backdrop-blur-md border-b border-white/30 sticky top-0 z-10 shadow-xl">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <!-- Titre -->
            <div class="flex items-center gap-3">
                <div class="p-2.5 rounded-lg bg-blue-600 text-white shadow-lg">
                    <Car class="w-6 h-6" />
                </div>
                <div>
                    <h1 class="text-2xl font-bold text-white">
                        Déplacements PMR
                    </h1>
                    <p class="text-sm text-gray-200 mt-0.5">
                        Gestion des prises en charge
                    </p>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 flex-wrap">
                <a
                    href="/deplacements/historique"
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-white/10 border border-white/30 rounded-lg hover:bg-white/20 transition-colors"
                >
                    <Train class="w-4 h-4" />
                    <span class="hidden sm:inline">Historique</span>
                </a>
                <button
                    onclick={onSave}
                    disabled={loading}
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {#if loading}
                        <span class="animate-spin">⏳</span>
                    {:else}
                        <Save class="w-4 h-4" />
                    {/if}
                    Sauvegarder
                </button>
                <button
                    onclick={onCopyEmail}
                    disabled={loading}
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                    <Mail class="w-4 h-4" />
                    <span class="hidden sm:inline">Email</span>
                </button>
                <button
                    onclick={onGeneratePDF}
                    disabled={loading}
                    class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                    <FileDown class="w-4 h-4" />
                    <span class="hidden sm:inline">PDF</span>
                </button>
            </div>
        </div>
    </div>
</header>

<style>
    @reference "tailwindcss";
</style>
