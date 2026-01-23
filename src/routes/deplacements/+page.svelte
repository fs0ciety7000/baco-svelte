<script>
    import { onMount } from 'svelte';
    import { toast } from '$lib/stores/toast';
    import { detectZone } from '$lib/utils/deplacements.helpers.js';
    import { DEFAULT_PRESENCE } from '$lib/utils/deplacements.constants.js';
    import { DeplacementsService } from '$lib/services/deplacements.service.js';
    import { copyForOutlook } from '$lib/services/emailGenerator.service.js';
    import { generatePDF } from '$lib/services/pdfGenerator.service.js';
    import { Loader2 } from 'lucide-svelte';

    // Components
    import DeplacementHeader from './components/DeplacementHeader.svelte';
    import DateSelector from './components/DateSelector.svelte';
    import PrestationSection from './components/PrestationSection.svelte';
    import InterventionsTable from './components/InterventionsTable.svelte';
    import NotesFooter from './components/NotesFooter.svelte';

    // --- ÉTAT (RUNES) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);
    let isInitializing = $state(true);

    // Données
    let presenceMons = $state({ ...DEFAULT_PRESENCE });
    let presenceTournai = $state({ ...DEFAULT_PRESENCE });
    let presenceMonsAM = $state({ ...DEFAULT_PRESENCE });
    let presenceTournaiAM = $state({ ...DEFAULT_PRESENCE });
    let interventions = $state([]);
    let interventionsAM = $state([]);
    let stationList = $state([]);

    // --- INIT ---
    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('date')) date = urlParams.get('date');

        try {
            await Promise.all([loadStations(), loadDailyReport()]);
        } finally {
            isInitializing = false;
        }
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

            if (interventions.length === 0) addRow();
            if (interventionsAM.length === 0) addRowAM();
        } catch (error) {
            toast.error(error.message);
        } finally {
            loading = false;
        }
    }

    async function saveData() {
        loading = true;
        try {
            await DeplacementsService.saveDailyReport({
                date, presenceMons, presenceTournai, presenceMonsAM, presenceTournaiAM, interventions, interventionsAM
            });
            toast.success("Sauvegardé !");
        } catch (error) {
            toast.error(error.message);
        } finally {
            loading = false;
        }
    }

    async function handleCopyEmail() {
        try {
            await copyForOutlook({ date, presenceMons, presenceTournai, presenceMonsAM, presenceTournaiAM, interventions, interventionsAM });
            toast.success("Copié !");
        } catch (e) { toast.error(e.message); }
    }

    async function handleGeneratePDF() {
        try {
            await generatePDF({ date, presenceMons, presenceTournai, presenceMonsAM, presenceTournaiAM, interventions, interventionsAM });
            toast.success("PDF généré !");
        } catch (e) { toast.error(e.message); }
    }

    // --- HELPERS ---
    function addRow() { interventions = [...interventions, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }]; }
    function removeRow(i) { interventions = interventions.filter((_, idx) => idx !== i); }
    function handleStationChange(i, v) { interventions[i].station = v.toUpperCase(); interventions[i].zone = detectZone(v); }

    function addRowAM() { interventionsAM = [...interventionsAM, { station: '', pmr_details: '', assigned_to: '', zone: 'FMS' }]; }
    function removeRowAM(i) { interventionsAM = interventionsAM.filter((_, idx) => idx !== i); }
    function handleStationChangeAM(i, v) { interventionsAM[i].station = v.toUpperCase(); interventionsAM[i].zone = detectZone(v); }
</script>

<div class="w-full min-h-screen pb-20">
    <DeplacementHeader
        bind:loading
        onSave={saveData}
        onCopyEmail={handleCopyEmail}
        onGeneratePDF={handleGeneratePDF}
    />

    {#if isInitializing}
        <div class="h-[60vh] flex items-center justify-center"><Loader2 class="w-8 h-8 animate-spin text-gray-500" /></div>
    {:else}
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            <div class="flex justify-center"><DateSelector bind:date onChange={loadDailyReport} /></div>

            <div class="space-y-4">
                <PrestationSection title="Prestations Matin" bind:presenceMons bind:presenceTournai period="morning" />
                <InterventionsTable title="Interventions Matin" bind:interventions {stationList} onAdd={addRow} onRemove={removeRow} onStationChange={handleStationChange} period="morning" />
            </div>

            <div class="relative py-4">
                <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-white/5"></div></div>
                <div class="relative flex justify-center"><span class="px-4 bg-[#0f1115] text-xs font-mono uppercase tracking-widest text-gray-600">Après-Midi</span></div>
            </div>

            <div class="space-y-4">
                <PrestationSection title="Prestations Après-Midi" bind:presenceMons={presenceMonsAM} bind:presenceTournai={presenceTournaiAM} period="afternoon" />
                <InterventionsTable title="Interventions Après-Midi" bind:interventions={interventionsAM} {stationList} onAdd={addRowAM} onRemove={removeRowAM} onStationChange={handleStationChangeAM} period="afternoon" />
            </div>

            <NotesFooter />
        </div>
    {/if}
</div>

<datalist id="stations">
    {#each stationList as station}<option value={station.abbreviation}>{station.zone_name}</option>{/each}
</datalist>