<script>
    import { onMount } from 'svelte';
    import { toast } from '$lib/stores/toast';
    import { detectZone } from '$lib/utils/deplacements.helpers.js';
    import { DEFAULT_PRESENCE } from '$lib/utils/deplacements.constants.js';
    import * as DeplacementsService from '$lib/services/deplacements.service.js';
    import { copyForOutlook } from '$lib/services/emailGenerator.service.js';
    import { generatePDF } from '$lib/services/pdfGenerator.service.js';

    // Components
    import DeplacementHeader from './components/DeplacementHeader.svelte';
    import DateSelector from './components/DateSelector.svelte';
    import PrestationSection from './components/PrestationSection.svelte';
    import InterventionsTable from './components/InterventionsTable.svelte';
    import NotesFooter from './components/NotesFooter.svelte';

    // --- État (Svelte 5 Runes) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);

    // Présences
    let presenceMons = $state({ ...DEFAULT_PRESENCE });
    let presenceTournai = $state({ ...DEFAULT_PRESENCE });
    let presenceMonsAM = $state({ ...DEFAULT_PRESENCE });
    let presenceTournaiAM = $state({ ...DEFAULT_PRESENCE });

    // Interventions
    let interventions = $state([]);
    let interventionsAM = $state([]);

    // Gares
    let stationList = $state([]);

    // --- Initialisation ---
    onMount(async () => {
        // Récupérer date depuis URL si présente
        const urlParams = new URLSearchParams(window.location.search);
        const urlDate = urlParams.get('date');
        if (urlDate) date = urlDate;

        // Charger les données
        await loadStations();
        await loadDailyReport();
    });

    async function loadStations() {
        stationList = await DeplacementsService.loadStations();
    }

    async function loadDailyReport() {
        loading = true;
        try {
            const report = await DeplacementsService.loadDailyReport(date);

            presenceMons = report.presenceMons;
            presenceTournai = report.presenceTournai;
            presenceMonsAM = report.presenceMonsAM;
            presenceTournaiAM = report.presenceTournaiAM;
            interventions = report.interventions;
            interventionsAM = report.interventionsAM;

            // Assurer au moins une ligne vide
            if (interventions.length === 0) addRow();
            if (interventionsAM.length === 0) addRowAM();
        } catch (error) {
            toast.error("Erreur lors du chargement: " + error.message);
        } finally {
            loading = false;
        }
    }

    async function saveData() {
        loading = true;
        try {
            await DeplacementsService.saveDailyReport({
                date,
                presenceMons,
                presenceTournai,
                presenceMonsAM,
                presenceTournaiAM,
                interventions,
                interventionsAM
            });
            toast.success("Sauvegardé avec succès !");
        } catch (error) {
            toast.error("Erreur lors de la sauvegarde: " + error.message);
        } finally {
            loading = false;
        }
    }

    async function handleCopyEmail() {
        try {
            await copyForOutlook({
                date,
                presenceMons,
                presenceTournai,
                presenceMonsAM,
                presenceTournaiAM,
                interventions,
                interventionsAM
            });
            toast.success("Email copié ! Collez-le dans Outlook avec CTRL+V");
        } catch (error) {
            toast.error("Erreur lors de la copie: " + error.message);
        }
    }

    async function handleGeneratePDF() {
        try {
            const result = await generatePDF({
                date,
                presenceMons,
                presenceTournai,
                presenceMonsAM,
                presenceTournaiAM,
                interventions,
                interventionsAM
            });
            toast.success(`PDF généré : ${result.filename}`);
        } catch (error) {
            toast.error("Erreur lors de la génération PDF: " + error.message);
        }
    }

    // --- Gestion interventions MATIN ---
    function addRow() {
        interventions = [...interventions, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }];
    }

    function removeRow(index) {
        interventions = interventions.filter((_, i) => i !== index);
    }

    function handleStationChange(index, value) {
        interventions[index].station = value.toUpperCase();
        interventions[index].zone = detectZone(value);
    }

    // --- Gestion interventions APRÈS-MIDI ---
    function addRowAM() {
        interventionsAM = [...interventionsAM, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }];
    }

    function removeRowAM(index) {
        interventionsAM = interventionsAM.filter((_, i) => i !== index);
    }

    function handleStationChangeAM(index, value) {
        interventionsAM[index].station = value.toUpperCase();
        interventionsAM[index].zone = detectZone(value);
    }
</script>

<div class="min-h-screen bg-deep-space">
    <!-- Header avec actions -->
    <DeplacementHeader
        bind:loading
        onSave={saveData}
        onCopyEmail={handleCopyEmail}
        onGeneratePDF={handleGeneratePDF}
    />

    <!-- Container principal -->
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <!-- Sélecteur de date -->
        <DateSelector
            bind:date
            onChange={loadDailyReport}
        />

        <!-- Section Matin -->
        <PrestationSection
            title="Prestation matin"
            bind:presenceMons
            bind:presenceTournai
            period="morning"
        />

        <!-- Tableau interventions Matin -->
        <InterventionsTable
            title="Interventions MATIN"
            bind:interventions
            {stationList}
            onAdd={addRow}
            onRemove={removeRow}
            onStationChange={handleStationChange}
            period="morning"
        />

        <!-- Section Après-midi -->
        <PrestationSection
            title="Prestation après-midi"
            bind:presenceMons={presenceMonsAM}
            bind:presenceTournai={presenceTournaiAM}
            period="afternoon"
        />

        <!-- Tableau interventions Après-midi -->
        <InterventionsTable
            title="Interventions APRÈS-MIDI"
            bind:interventions={interventionsAM}
            {stationList}
            onAdd={addRowAM}
            onRemove={removeRowAM}
            onStationChange={handleStationChangeAM}
            period="afternoon"
        />

        <!-- Notes footer -->
        <NotesFooter />

    </div>
</div>

<!-- Datalist pour autocomplete stations -->
<datalist id="stations">
    {#each stationList as station}
        <option value={station.abbreviation} />
    {/each}
</datalist>

<style>
    @reference "tailwindcss";

    .animate-fade-in {
        animation: fadeIn 0.6s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>
