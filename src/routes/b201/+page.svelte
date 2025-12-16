<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import { jsPDF } from 'jspdf';
    import html2canvas from 'html2canvas';
    import { 
        CheckSquare, Loader2, Calendar, Sun, Sunset, Moon, 
        Bus, DollarSign, RotateCcw, Save, MessageSquare, Shield, Download, Plus, X, List
    } from 'lucide-svelte';

    // --- CONSTANTES ---
    const PERIODS = ['morning', 'afternoon', 'night'];
    const SERVICES = ['BUS', 'TAXIS', 'TAXIS_PMR'];
    const FUNCTIONS = ['PACO', 'RCCA'];
    
    // --- ÉTATS GLOBAUX ---
    let isLoading = true;
    let isSubmitting = false;
    let currentUser = null;
    let reportContent; 
    
    // --- LISTES DE RÉFÉRENCE ---
    let busCompanies = [];
    let taxiCompanies = [];

    // --- ÉTATS DU RAPPORT ---
    let selectedDate = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    let reportId = null; 
    let reportData = {}; 
    
    // Éléments de formulaire temporaires pour l'ajout
    let tempTransport = {
        BUS: { company_id: '', time: '', origin: '', destination: '', tc_relation: '' },
        TAXIS: { company_id: '', persons: 1, time: '', origin: '', destination: '' },
        TAXIS_PMR: { company_id: '', persons: 1, time: '', origin: '', destination: '', file_number: '' }
    };
    let currentServiceBeingAdded = { period: '', func: '', service: '' };

    // Structure de données par défaut (MODIFIÉE pour stocker les tableaux de transports)
    const getDefaultReportData = () => {
        const data = {};
        for (const period of PERIODS) {
            data[period] = {};
            for (const func of FUNCTIONS) {
                if (func === 'RCCA' && period === 'night') continue;

                data[period][func] = {
                    comment: '',
                    next_comment: '',
                    services: {}
                };
                for (const service of SERVICES) {
                    // Les services sont désormais des tableaux de transports
                    data[period][func].services[service] = []; 
                }
            }
            data[period].general_comment = '';
            data[period].next_day_comment = '';
        }
        return data;
    };
    
    // --- LOGIQUE DE CHARGEMENT ---
    onMount(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        currentUser = user;
        
        await Promise.all([
            loadCompanies(),
            loadReport(selectedDate)
        ]);
        
        isLoading = false;
    });

    // Rechargement si la date change
    $: if (selectedDate && currentUser && !isLoading) {
        loadReport(selectedDate);
    }
    
    // Chargement des listes de référence
    async function loadCompanies() {
        const [busRes, taxiRes] = await Promise.all([
            supabase.from('societes_bus').select('id, nom'),
            supabase.from('taxis').select('id, nom')
        ]);
        
        if (busRes.data) busCompanies = busRes.data;
        if (taxiRes.data) taxiCompanies = taxiRes.data;
    }

    async function loadReport(date) {
        isLoading = true;
        
        const { data, error } = await supabase
            .from('b201_reports')
            .select('id, report_data')
            .eq('report_date', date)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error("Erreur chargement rapport B201:", error);
            toast.error("Erreur lors du chargement du rapport.");
        }

        if (data) {
            reportId = data.id;
            reportData = { ...getDefaultReportData(), ...data.report_data };
        } else {
            reportId = null;
            reportData = getDefaultReportData();
        }
        isLoading = false;
    }

    async function saveReport() {
        if (!currentUser || isLoading) return;

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
                reportId = data.id;
            }

            toast.success(successMessage);
        } catch (e) {
            console.error("Erreur lors de l'enregistrement:", e);
            toast.error(`Échec de l'enregistrement. Code : ${e.code || ''}`);
        } finally {
            isSubmitting = false;
        }
    }
    
    // --- LOGIQUE D'AJOUT DE TRANSPORT ---

    function startAddingTransport(period, func, service) {
        // RCCA n'a pas de service de nuit (sécurité)
        if (func === 'RCCA' && period === 'night') return;
        
        currentServiceBeingAdded = { period, func, service };
        // Réinitialiser les formulaires temporaires
        tempTransport = {
            BUS: { company_id: '', time: '', origin: '', destination: '', tc_relation: '' },
            TAXIS: { company_id: '', persons: 1, time: '', origin: '', destination: '' },
            TAXIS_PMR: { company_id: '', persons: 1, time: '', origin: '', destination: '', file_number: '' }
        };
    }

    function addTransport() {
        const { period, func, service } = currentServiceBeingAdded;
        const temp = tempTransport[service];
        
        if (!temp.company_id || !temp.time) {
            toast.error("Veuillez sélectionner une société et une heure.");
            return;
        }

        // Ajouter l'ID de la société (nom est chargé à l'affichage)
        const newTransport = {
            ...temp,
            company_name: service === 'BUS' 
                ? busCompanies.find(c => c.id === temp.company_id)?.nom 
                : taxiCompanies.find(c => c.id === temp.company_id)?.nom,
            id: Date.now(), // ID local pour la suppression
        };

        reportData[period][func].services[service] = [
            ...reportData[period][func].services[service],
            newTransport
        ];
        
        // Fermer la modale d'ajout
        currentServiceBeingAdded = { period: '', func: '', service: '' };
    }

    function removeTransport(period, func, service, id) {
        reportData[period][func].services[service] = reportData[period][func].services[service].filter(t => t.id !== id);
        // Nécessaire pour forcer la réactivité
        reportData = reportData; 
    }
    
    // --- UTILITAIRES D'AFFICHAGE ---

    function getCompanyName(companyId, service) {
        if (service === 'BUS') {
            return busCompanies.find(c => c.id === companyId)?.nom || 'Inconnue';
        }
        return taxiCompanies.find(c => c.id === companyId)?.nom || 'Inconnue';
    }

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
    
    function changeDate(days) {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        selectedDate = date.toISOString().split('T')[0];
    }
    
    // --- EXPORT PDF (Simplifié pour le rapport détaillé) ---

    async function exportReportToPDF() {
        if (!reportContent) {
            toast.error("Le rapport n'est pas chargé.");
            return;
        }

        let pdf;
        const originalBg = reportContent.style.backgroundColor;
        
        reportContent.style.backgroundColor = '#ffffff'; 

        try {
            const dateString = new Date().toLocaleDateString('fr-FR');
            const reportDateFormatted = formatDate(selectedDate);
            
            const canvas = await html2canvas(reportContent, {
                scale: 2, 
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            pdf = new jsPDF('p', 'mm', 'a4'); 

            const imgWidth = 190; 
            let imgHeight = (canvas.height * imgWidth) / canvas.width;
            let position = 10; 

            pdf.setFontSize(14);
            pdf.text("Rapport Journalier de Remise de Service B201", 10, position);
            position += 8;
            pdf.setFontSize(10);
            pdf.text(`Date du Rapport: ${reportDateFormatted}`, 10, position);
            pdf.text(`Généré le: ${dateString}`, 10, position + 5);
            position += 15; 

            pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
            
            pdf.save(`B201_Rapport_${selectedDate}.pdf`);
            toast.success("Export PDF réussi !");

        } catch (e) {
            console.error("Erreur lors de l'export PDF:", e);
            toast.error("Échec de l'export PDF. Vérifiez le format des données.");
        } finally {
            reportContent.style.backgroundColor = originalBg;
        }
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
        
        <div class="flex gap-3 mt-2 sm:mt-0">
            <button on:click={exportReportToPDF} disabled={isSubmitting || isLoading || !currentUser || !reportId} class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50">
                <Download class="w-4 h-4" /> Export PDF
            </button>

            <button on:click={saveReport} disabled={isSubmitting || isLoading || !currentUser} class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold transition-colors flex items-center gap-2 disabled:opacity-50">
                <Save class="w-4 h-4" /> Enregistrer
            </button>
        </div>
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
        <div class="b201-report-content" bind:this={reportContent} id="b201-content-export">
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
                                        
                                        <div class="space-y-4">
                                            {#each SERVICES as service}
                                                <div class="border-t pt-3 border-gray-200 dark:border-gray-600">
                                                    <div class="flex items-center justify-between mb-2">
                                                        <h4 class="font-medium dark:text-gray-200 flex items-center gap-1">
                                                            <Bus class="w-4 h-4 text-red-500" /> {service.replace('_', ' ')}
                                                            {#if reportData[period][func].services[service].length > 0}
                                                                <span class="text-xs ml-2 px-2 py-0.5 bg-blue-500/10 text-blue-600 rounded-full">{reportData[period][func].services[service].length} Prestations</span>
                                                            {/if}
                                                        </h4>
                                                        
                                                        <button 
                                                            on:click={() => startAddingTransport(period, func, service)} 
                                                            disabled={func === 'RCCA' && period === 'night'} 
                                                            class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 text-sm flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <Plus class="w-4 h-4" /> Ajouter
                                                        </button>
                                                    </div>

                                                    {#if reportData[period][func].services[service].length > 0}
                                                        <ul class="space-y-1 mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded-lg max-h-40 overflow-y-auto">
                                                            {#each reportData[period][func].services[service] as transport}
                                                                <li class="flex justify-between items-center border-b pb-1 dark:border-gray-600 last:border-b-0">
                                                                    <span class="font-medium text-gray-800 dark:text-gray-200">
                                                                        {transport.time} | {transport.company_name}
                                                                    </span>
                                                                    <button on:click={() => removeTransport(period, func, service, transport.id)} class="text-red-500 hover:text-red-700">
                                                                        <X class="w-3 h-3" />
                                                                    </button>
                                                                </li>
                                                            {/each}
                                                        </ul>
                                                    {:else}
                                                        <p class="text-xs text-gray-500 dark:text-gray-400 italic">Aucune prestation enregistrée.</p>
                                                    {/if}
                                                </div>
                                            {/each}
                                        </div>

                                        <div class="mt-4">
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
                                                    Consignes pour la période suivante
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
        </div>
    {/if}
</div>

{#if currentServiceBeingAdded.service}
    <div class="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            
            <h3 class="text-xl font-bold dark:text-white border-b pb-2">
                Ajouter Prestation : {currentServiceBeingAdded.service.replace('_', ' ')}
            </h3>
            
            <form on:submit|preventDefault={addTransport} class="space-y-4">
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium dark:text-gray-300 mb-1">Société</label>
                        <select bind:value={tempTransport[currentServiceBeingAdded.service].company_id} required class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white">
                            <option value="" disabled>-- Sélectionner --</option>
                            {#if currentServiceBeingAdded.service === 'BUS'}
                                {#each busCompanies as company}
                                    <option value={company.id}>{company.nom}</option>
                                {/each}
                            {:else}
                                {#each taxiCompanies as company}
                                    <option value={company.id}>{company.nom}</option>
                                {/each}
                            {/if}
                        </select>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium dark:text-gray-300 mb-1">Heure (HH:MM)</label>
                        <input type="time" bind:value={tempTransport[currentServiceBeingAdded.service].time} required class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white">
                    </div>
                </div>

                {#if currentServiceBeingAdded.service === 'BUS'}
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Origine</label>
                            <input type="text" bind:value={tempTransport.BUS.origin} class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white" placeholder="Ex: Gare A">
                        </div>
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Destination</label>
                            <input type="text" bind:value={tempTransport.BUS.destination} class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white" placeholder="Ex: Arrêt B">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium dark:text-gray-300 mb-1">Relation TC_XXXXXX</label>
                        <input type="text" bind:value={tempTransport.BUS.tc_relation} class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white" placeholder="Ex: TC_123456">
                    </div>
                
                {:else if currentServiceBeingAdded.service.startsWith('TAXIS')}
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Nb. Personnes</label>
                            <input type="number" bind:value={tempTransport[currentServiceBeingAdded.service].persons} min="1" required class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white">
                        </div>
                        <div class="col-span-1">
                            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Origine</label>
                            <input type="text" bind:value={tempTransport[currentServiceBeingAdded.service].origin} class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white" placeholder="Lieu de départ">
                        </div>
                        <div class="col-span-1">
                            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Destination</label>
                            <input type="text" bind:value={tempTransport[currentServiceBeingAdded.service].destination} class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white" placeholder="Lieu d'arrivée">
                        </div>
                    </div>
                    
                    {#if currentServiceBeingAdded.service === 'TAXIS_PMR'}
                        <div>
                            <label class="block text-sm font-medium dark:text-gray-300 mb-1">Numéro de Dossier PMR</label>
                            <input type="text" bind:value={tempTransport.TAXIS_PMR.file_number} class="w-full p-2 border rounded-lg dark:bg-gray-800 dark:text-white" placeholder="Ex: DOSS-00123">
                        </div>
                    {/if}
                {/if}

                <div class="flex justify-end space-x-3 pt-2">
                    <button type="button" on:click={() => currentServiceBeingAdded = { period: '', func: '', service: '' }} class="px-4 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                        Annuler
                    </button>
                    <button type="submit" class="px-4 py-2 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                        <Plus class="w-4 h-4" /> Confirmer l'ajout
                    </button>
                </div>
            </form>
        </div>
    </div>
{/if}