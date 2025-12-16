<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import { 
        CheckSquare, Loader2, Calendar, Sun, Sunset, Moon, 
        Bus, DollarSign, RotateCcw, Save, MessageSquare
    } from 'lucide-svelte';

    // --- CONSTANTES ---
    const PERIODS = ['morning', 'afternoon', 'night'];
    const SERVICES = ['BUS', 'TAXIS', 'TAXIS_PMR'];
    const FUNCTIONS = ['PACO', 'RCCA'];
    
    // --- ÉTATS GLOBALS ---
    let isLoading = true;
    let isSubmitting = false;
    let currentUser = null;
    
    // --- ÉTATS DU RAPPORT ---
    let selectedDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    let reportId = null; // ID du rapport Supabase s'il existe
    let reportData = {}; // Contient toutes les données structurées
    
    // Structure de données par défaut (utilisée pour l'initialisation)
    const getDefaultReportData = () => {
        const data = {};
        for (const period of PERIODS) {
            data[period] = {};
            for (const func of FUNCTIONS) {
                // RCCA n'a pas de prestation de nuit
                if (func === 'RCCA' && period === 'night') continue;

                data[period][func] = {
                    comment: '',
                    next_comment: '',
                    services: {}
                };
                for (const service of SERVICES) {
                    data[period][func].services[service] = false;
                }
            }
            // Section commentaire générale pour la période
            data[period].general_comment = '';
            // Section commentaire pour le jour/service suivant
            data[period].next_day_comment = '';
        }
        return data;
    };
    
    // --- LOGIQUE SUPABASE ---
    onMount(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;
        if (currentUser) {
            await loadReport(selectedDate);
        }
        isLoading = false;
    });

    // Fonction de chargement lorsque la date change
    $: if (selectedDate && currentUser) {
        loadReport(selectedDate);
    }
    
    async function loadReport(date) {
        isLoading = true;
        
        const { data, error } = await supabase
            .from('b201_reports')
            .select('id, report_data')
            .eq('report_date', date)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = pas de ligne trouvée
            console.error("Erreur chargement rapport B201:", error);
            toast.error("Erreur lors du chargement du rapport.");
        }

        if (data) {
            reportId = data.id;
            // Fusionner les données existantes avec la structure par défaut pour éviter les erreurs de référence
            reportData = { ...getDefaultReportData(), ...data.report_data };
        } else {
            reportId = null;
            reportData = getDefaultReportData();
        }
        isLoading = false;
    }

    async function saveReport() {
        if (!currentUser) {
            toast.error("Veuillez vous connecter pour enregistrer.");
            return;
        }
        if (isLoading) return;

        isSubmitting = true;
        let query;
        let successMessage;

        const reportObject = {
            report_date: selectedDate,
            report_data: reportData,
        };

        try {
            if (reportId) {
                // Mise à jour (UPDATE)
                query = supabase
                    .from('b201_reports')
                    .update(reportObject)
                    .eq('id', reportId);
                successMessage = "Rapport mis à jour avec succès !";
            } else {
                // Création (INSERT)
                query = supabase
                    .from('b201_reports')
                    .insert({ ...reportObject, created_by: currentUser.id })
                    .select('id')
                    .single();
                successMessage = "Rapport créé et enregistré !";
            }
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            if (data && !reportId) {
                reportId = data.id; // Stocker le nouvel ID
            }

            toast.success(successMessage);
        } catch (e) {
            console.error("Erreur lors de l'enregistrement:", e);
            toast.error(`Échec de l'enregistrement. Code : ${e.code || ''}`);
        } finally {
            isSubmitting = false;
        }
    }
    
    // --- UTILITAIRES D'AFFICHAGE ---

    function getPeriodIcon(period) {
        switch(period) {
            case 'morning': return Sun;
            case 'afternoon': return Sunset;
            case 'night': return Moon;
            default: return Sun;
        }
    }

    function getPeriodLabel(period) {
        switch(period) {
            case 'morning': return 'Matin (06h-13h)';
            case 'afternoon': return 'Après-midi (13h-21h)';
            case 'night': return 'Nuit (21h-06h)';
            default: return '';
        }
    }
    
    function formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    
    // Permet d'avancer/reculer le calendrier d'un jour
    function changeDate(days) {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        selectedDate = date.toISOString().split('T')[0];
    }

</script>

<svelte:head>
    <title>Remise de Service B201 - BACO</title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
    <header class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b pb-4 border-gray-200 dark:border-gray-700">
        <h1 class="text-3xl font-bold tracking-tight text-gray-800 dark:text-gray-100 flex items-center gap-3">
            <CheckSquare class="w-8 h-8 text-blue-500" />
            Remise de Service B201
        </h1>
        <button on:click={saveReport} disabled={isSubmitting || isLoading || !currentUser} class="mt-2 sm:mt-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50">
            <Save class="w-4 h-4" /> Enregistrer le Rapport
        </button>
    </header>

    <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 flex flex-col md:flex-row justify-between items-center gap-4">
        
        <button on:click={() => changeDate(-1)} class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-600 font-bold">
            &lt; Jour Précédent
        </button>

        <div class="flex items-center gap-3 bg-gray-100 dark:bg-gray-700 p-3 rounded-xl border border-gray-200 dark:border-gray-600">
            <Calendar class="w-5 h-5 text-gray-500" />
            <span class="text-lg font-semibold dark:text-white">{formatDate(selectedDate)}</span>
            <input type="date" bind:value={selectedDate} class="bg-transparent text-gray-700 dark:text-gray-300 font-medium cursor-pointer" />
        </div>
        
        <button on:click={() => changeDate(1)} class="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-600 font-bold">
            Jour Suivant &gt;
        </button>
    </div>

    {#if isLoading}
        <div class="flex justify-center py-20"><Loader2 class="animate-spin text-blue-600" /></div>
    {:else}
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {#each PERIODS as period}
                <div class="bg-white dark:bg-gray-800 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
                    
                    <h2 class="text-2xl font-bold dark:text-white flex items-center gap-3 border-b pb-3 
                        {period === 'night' ? 'text-indigo-500' : period === 'afternoon' ? 'text-orange-500' : 'text-yellow-500'}">
                        <svelte:component this={getPeriodIcon(period)} class="w-6 h-6 fill-current" />
                        {getPeriodLabel(period)}
                    </h2>

                    <div class="space-y-4">
                        {#each FUNCTIONS as func}
                            {#if reportData[period][func]}
                                <div class="border border-gray-100 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-700/50">
                                    <h3 class="text-lg font-semibold dark:text-white mb-3 flex items-center gap-2">
                                        <Shield class="w-4 h-4 text-blue-500" /> Fonction {func}
                                    </h3>
                                    
                                    <div class="grid grid-cols-3 gap-2 text-sm">
                                        {#each SERVICES as service}
                                            <label class="flex items-center gap-2 cursor-pointer 
                                                {func === 'RCCA' && service.includes('TAXIS') && period === 'night' ? 'opacity-50 cursor-not-allowed' : ''}"
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    bind:checked={reportData[period][func].services[service]}
                                                    disabled={func === 'RCCA' && period === 'night'} 
                                                    class="w-4 h-4 text-blue-600 rounded"
                                                >
                                                <span class="dark:text-gray-300">{service.replace('_', ' ')}</span>
                                            </label>
                                        {/each}
                                    </div>

                                    <div class="mt-3">
                                        <label for="{period}-{func}-comment" class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                            Commentaire {func}
                                        </label>
                                        <textarea 
                                            id="{period}-{func}-comment" 
                                            bind:value={reportData[period][func].comment} 
                                            rows="2" 
                                            class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white text-sm"
                                            placeholder="Incidents spécifiques à la prestation..."
                                        ></textarea>
                                    </div>

                                    {#if period !== 'night'}
                                        <div class="mt-3">
                                            <label for="{period}-{func}-next-comment" class="block text-xs font-medium text-blue-500 dark:text-blue-400 mb-1">
                                                Commentaire pour la période suivante
                                            </label>
                                            <textarea 
                                                id="{period}-{func}-next-comment" 
                                                bind:value={reportData[period][func].next_comment} 
                                                rows="2" 
                                                class="w-full p-2 border border-blue-300 dark:border-blue-700 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
                                                placeholder="À transmettre à la période suivante..."
                                            ></textarea>
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>

                    {#if period === 'night'}
                        <div class="pt-4 border-t dark:border-gray-700">
                            <h3 class="text-lg font-semibold dark:text-white mb-2 flex items-center gap-2">
                                <MessageSquare class="w-4 h-4 text-green-500" /> Consignes pour le Jour Suivant
                            </h3>
                            <textarea 
                                bind:value={reportData[period].next_day_comment} 
                                rows="3" 
                                class="w-full p-2 border border-green-300 dark:border-green-700 rounded-lg dark:bg-gray-800 dark:text-white text-sm"
                                placeholder="Incidents majeurs à suivre le jour suivant..."
                            ></textarea>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
        
        <div class="flex justify-center mt-8">
            <button on:click={saveReport} disabled={isSubmitting || !currentUser} class="px-8 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50">
                <Save class="w-5 h-5" /> Enregistrer le Rapport {formatDate(selectedDate)}
            </button>
        </div>
    {/if}
</div>