<script>
    import { onMount } from 'svelte';
    import { supabase } from '$lib/supabase';
    import { toast } from '$lib/stores/toast';
    import { page } from '$app/stores';
    import jsPDF from 'jspdf';
    import autoTable from 'jspdf-autotable';
    import {
        Save,
        Mail,
        FileDown,
        Plus,
        Trash2,
        Car,
        Calendar,
        MapPin,
        Users,
        Briefcase,
        Train
    } from 'lucide-svelte';

    // --- ÉTAT (Svelte 5 Runes) ---
    let date = $state(new Date().toISOString().split('T')[0]);
    let loading = $state(false);

    // Données MATIN
    let presenceMons = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournai = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventions = $state([]);

    // Données APRÈS-MIDI
    let presenceMonsAM = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let presenceTournaiAM = $state({ spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 });
    let interventionsAM = $state([]);

    let stationList = $state([]);

    // --- CONFIGURATION ---
    const PRESET_STATIONS_FMS = ['FMS', 'FSG', 'FGH', 'FJR', 'LVRS', 'ATH', 'FBC', 'FLZ', 'FNG'];
    const PRESET_STATIONS_FTY = ['FTY', 'ATH', 'FMC', 'FNG', 'FLZ', 'FLN'];

    const ASSIGNEES = [
        "ACP TEMP (Blaise)", "CPI BUFFER FTY", "CPI BUFFER FMS", "CPI FMS", 
        "CPI FBC", "CPI FTY", "OPI 1", "OPI 2", "SPI FTY", "SPI FMS", 
        "SPI Buffer FMS", "SPI Buffer FTY", "Team Leader", "MPI", "PA", 
        "OPI 5-13", "OPI 13-21", "PA 10-18", "CPI 10-18", "SPI 10-18"
    ];

    // --- INITIALISATION ---
    onMount(async () => {
        // Vérifier si une date est passée en paramètre d'URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlDate = urlParams.get('date');
        if (urlDate) {
            date = urlDate;
        }

        await loadStations();
        await loadDailyReport();
    });

    async function loadStations() {
        const { data } = await supabase.from('ptcar_abbreviations').select('abbreviation, zone_name');
        if (data) stationList = data;
    }

    // --- LOGIQUE ---
    function detectZone(stationName) {
        const s = stationName?.toUpperCase() || '';
        if (PRESET_STATIONS_FTY.includes(s) && !PRESET_STATIONS_FMS.includes(s)) return 'FTY';
        return 'FMS'; 
    }

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

    // Fonctions pour l'après-midi
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

    // Helper pour générer le texte groupé par gare (pour export)
    function getStationText(stationCode, zoneFilter = null, period = 'morning') {
        const sourceInterventions = period === 'afternoon' ? interventionsAM : interventions;
        const matches = sourceInterventions.filter(i =>
            i.station === stationCode &&
            (zoneFilter ? i.zone === zoneFilter : true)
        );

        if (matches.length === 0) return "///";

        return matches.map(m => {
            const details = m.pmr_details ? m.pmr_details : "";
            const assignee = m.assigned_to ? `(${m.assigned_to})` : "";
            return `${details} ${assignee}`.trim();
        }).join('<br/>      ');
    }

    // --- SUPABASE ---
    async function loadDailyReport() {
        loading = true;
        try {
            const { data: report } = await supabase.from('daily_movements').select('*').eq('date', date).single();
            if (report) {
                // Données matin
                presenceMons = report.presence_mons || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournai = report.presence_tournai || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };

                // Données après-midi
                presenceMonsAM = report.presence_mons_am || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournaiAM = report.presence_tournai_am || { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };

                // Interventions (matin et après-midi)
                const { data: lines } = await supabase.from('movement_interventions').select('*').eq('movement_id', report.id).order('created_at', { ascending: true });
                if (lines) {
                    interventions = lines.filter(l => l.period === 'morning' || !l.period) || [];
                    interventionsAM = lines.filter(l => l.period === 'afternoon') || [];
                }
            } else {
                presenceMons = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournai = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceMonsAM = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                presenceTournaiAM = { spi: 0, opi: 0, cpi: 0, pa: 0, shift_10_18: 0 };
                interventions = [];
                interventionsAM = [];
            }
            if (interventions.length === 0) addRow();
            if (interventionsAM.length === 0) addRowAM();
        } catch (e) {
            console.error(e);
        } finally {
            loading = false;
        }
    }

    async function saveData() {
        loading = true;
        try {
            const { data: report, error: errRep } = await supabase
                .from('daily_movements')
                .upsert({
                    date,
                    presence_mons: presenceMons,
                    presence_tournai: presenceTournai,
                    presence_mons_am: presenceMonsAM,
                    presence_tournai_am: presenceTournaiAM
                }, { onConflict: 'date' })
                .select().single();
            if (errRep) throw errRep;

            // Supprimer toutes les interventions existantes
            await supabase.from('movement_interventions').delete().eq('movement_id', report.id);

            // Préparer les interventions du matin et de l'après-midi
            const validLinesMorning = interventions
                .filter(i => i.station.trim() !== '')
                .map(i => ({ ...i, movement_id: report.id, period: 'morning' }));

            const validLinesAfternoon = interventionsAM
                .filter(i => i.station.trim() !== '')
                .map(i => ({ ...i, movement_id: report.id, period: 'afternoon' }));

            const allValidLines = [...validLinesMorning, ...validLinesAfternoon];

            if (allValidLines.length > 0) {
                const { error: errLines } = await supabase.from('movement_interventions').insert(allValidLines);
                if (errLines) throw errLines;
            }
            toast.success("Rapport sauvegardé avec succès !");
        } catch (e) {
            toast.error("Erreur : " + e.message);
        } finally {
            loading = false;
        }
    }

    // --- EXPORT OUTLOOK (HTML Moderne et Vibrant) ---
    async function copyForOutlook() {
        const formattedDate = new Date(date).toLocaleDateString('fr-BE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const html = `
            <div style="font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11pt; color: #1e293b; background: linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%); padding: 30px; border-radius: 16px;">
                <!-- En-tête avec dégradé -->
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);">
                    <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 900; text-align: center; text-shadow: 0 2px 10px rgba(0,0,0,0.2);">
                        🚂 DÉPLACEMENTS PMR
                    </h1>
                    <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 16px; text-align: center; font-weight: 600;">
                        ${formattedDate}
                    </p>
                </div>

                <!-- PRESTATION MATIN FMS -->
                <div style="margin-bottom: 30px; border: 3px solid #3b82f6; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.2); background: #ffffff;">
                    <div style="background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%); padding: 16px 20px; border-bottom: 2px solid #2563eb;">
                        <span style="color: #ffffff; font-weight: 900; font-size: 14pt; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">☀️ PRESTATION MATIN - Zone FMS</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 16px; border-radius: 12px; margin-bottom: 20px; border-left: 5px solid #3b82f6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);">
                            <p style="margin: 0; font-size: 10pt; color: #1e40af; font-weight: bold;">📍 Prévu dans Quinyx gare de Mons</p>
                            <div style="margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap;">
                                <span style="background: #3b82f6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">SPI: ${presenceMons.spi}</span>
                                <span style="background: #3b82f6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">OPI: ${presenceMons.opi}</span>
                                <span style="background: #3b82f6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">CPI: ${presenceMons.cpi}</span>
                                <span style="background: #3b82f6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">PA: ${presenceMons.pa}</span>
                                <span style="background: #3b82f6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">10-18h: ${presenceMons.shift_10_18}</span>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10pt; border: 2px solid #dbeafe; border-radius: 12px; overflow: hidden;">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%);">
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left; width: 100px;">GARE</th>
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left;">INTERVENTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${PRESET_STATIONS_FMS.map((st, index) => {
                                    const txt = getStationText(st, 'FMS', 'morning');
                                    const bgColor = index % 2 === 0 ? '#f0f9ff' : '#ffffff';
                                    return `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #dbeafe;">
                                        <td style="padding: 12px; font-weight: 900; color: #1e40af; border-right: 2px solid #dbeafe;">${st}</td>
                                        <td style="padding: 12px; color: #334155; line-height: 1.6;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PRESTATION MATIN FTY -->
                <div style="margin-bottom: 30px; border: 3px solid #8b5cf6; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(139, 92, 246, 0.2); background: #ffffff;">
                    <div style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%); padding: 16px 20px; border-bottom: 2px solid #7c3aed;">
                        <span style="color: #ffffff; font-weight: 900; font-size: 14pt; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">☀️ PRESTATION MATIN - Zone FTY</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); padding: 16px; border-radius: 12px; margin-bottom: 20px; border-left: 5px solid #8b5cf6; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);">
                            <p style="margin: 0; font-size: 10pt; color: #6d28d9; font-weight: bold;">📍 Prévu dans Quinyx gare de Tournai</p>
                            <div style="margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap;">
                                <span style="background: #8b5cf6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">SPI: ${presenceTournai.spi}</span>
                                <span style="background: #8b5cf6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">CPI: ${presenceTournai.cpi}</span>
                                <span style="background: #8b5cf6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">PA: ${presenceTournai.pa}</span>
                                <span style="background: #8b5cf6; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">10-18h: ${presenceTournai.shift_10_18}</span>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10pt; border: 2px solid #ede9fe; border-radius: 12px; overflow: hidden;">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);">
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left; width: 100px;">GARE</th>
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left;">INTERVENTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${PRESET_STATIONS_FTY.map((st, index) => {
                                    const txt = getStationText(st, 'FTY', 'morning');
                                    const bgColor = index % 2 === 0 ? '#faf5ff' : '#ffffff';
                                    return `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #ede9fe;">
                                        <td style="padding: 12px; font-weight: 900; color: #6d28d9; border-right: 2px solid #ede9fe;">${st}</td>
                                        <td style="padding: 12px; color: #334155; line-height: 1.6;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PRESTATION APRÈS-MIDI FMS -->
                <div style="margin-bottom: 30px; border: 3px solid #3b82f6; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(59, 130, 246, 0.2); background: #ffffff;">
                    <div style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); padding: 16px 20px; border-bottom: 2px solid #1d4ed8;">
                        <span style="color: #ffffff; font-weight: 900; font-size: 14pt; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">🌙 PRESTATION APRÈS-MIDI - Zone FMS</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); padding: 16px; border-radius: 12px; margin-bottom: 20px; border-left: 5px solid #3b82f6; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);">
                            <p style="margin: 0; font-size: 10pt; color: #1e40af; font-weight: bold;">📍 Prévu dans Quinyx gare de Mons</p>
                            <div style="margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap;">
                                <span style="background: #2563eb; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">SPI: ${presenceMonsAM.spi}</span>
                                <span style="background: #2563eb; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">OPI: ${presenceMonsAM.opi}</span>
                                <span style="background: #2563eb; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">CPI: ${presenceMonsAM.cpi}</span>
                                <span style="background: #2563eb; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">PA: ${presenceMonsAM.pa}</span>
                                <span style="background: #2563eb; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">10-18h: ${presenceMonsAM.shift_10_18}</span>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10pt; border: 2px solid #dbeafe; border-radius: 12px; overflow: hidden;">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);">
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left; width: 100px;">GARE</th>
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left;">INTERVENTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${PRESET_STATIONS_FMS.map((st, index) => {
                                    const txt = getStationText(st, 'FMS', 'afternoon');
                                    const bgColor = index % 2 === 0 ? '#f0f9ff' : '#ffffff';
                                    return `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #dbeafe;">
                                        <td style="padding: 12px; font-weight: 900; color: #1e40af; border-right: 2px solid #dbeafe;">${st}</td>
                                        <td style="padding: 12px; color: #334155; line-height: 1.6;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- PRESTATION APRÈS-MIDI FTY -->
                <div style="margin-bottom: 30px; border: 3px solid #8b5cf6; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 24px rgba(139, 92, 246, 0.2); background: #ffffff;">
                    <div style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); padding: 16px 20px; border-bottom: 2px solid #6d28d9;">
                        <span style="color: #ffffff; font-weight: 900; font-size: 14pt; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">🌙 PRESTATION APRÈS-MIDI - Zone FTY</span>
                    </div>
                    <div style="padding: 20px;">
                        <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); padding: 16px; border-radius: 12px; margin-bottom: 20px; border-left: 5px solid #8b5cf6; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.1);">
                            <p style="margin: 0; font-size: 10pt; color: #6d28d9; font-weight: bold;">📍 Prévu dans Quinyx gare de Tournai</p>
                            <div style="margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap;">
                                <span style="background: #7c3aed; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">SPI: ${presenceTournaiAM.spi}</span>
                                <span style="background: #7c3aed; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">CPI: ${presenceTournaiAM.cpi}</span>
                                <span style="background: #7c3aed; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">PA: ${presenceTournaiAM.pa}</span>
                                <span style="background: #7c3aed; color: white; padding: 6px 12px; border-radius: 8px; font-weight: bold; font-size: 10pt;">10-18h: ${presenceTournaiAM.shift_10_18}</span>
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: separate; border-spacing: 0; font-size: 10pt; border: 2px solid #ede9fe; border-radius: 12px; overflow: hidden;">
                            <thead>
                                <tr style="background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%);">
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left; width: 100px;">GARE</th>
                                    <th style="padding: 12px; font-weight: 900; color: white; text-align: left;">INTERVENTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${PRESET_STATIONS_FTY.map((st, index) => {
                                    const txt = getStationText(st, 'FTY', 'afternoon');
                                    const bgColor = index % 2 === 0 ? '#faf5ff' : '#ffffff';
                                    return `<tr style="background-color: ${bgColor}; border-bottom: 1px solid #ede9fe;">
                                        <td style="padding: 12px; font-weight: 900; color: #6d28d9; border-right: 2px solid #ede9fe;">${st}</td>
                                        <td style="padding: 12px; color: #334155; line-height: 1.6;">${txt}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Footer amélioré -->
                <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border: 3px solid #f59e0b; border-radius: 16px; padding: 24px; margin-top: 30px; box-shadow: 0 8px 24px rgba(245, 158, 11, 0.2);">
                    <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 24px;">⚠️</div>
                        <h3 style="margin: 0; color: #92400e; font-size: 14pt; font-weight: 900;">INFORMATIONS IMPORTANTES</h3>
                    </div>
                    <div style="color: #78350f; font-size: 10pt; line-height: 1.8;">
                        <p style="margin: 8px 0; display: flex; align-items: start; gap: 8px;">
                            <span style="color: #f59e0b; font-weight: bold; font-size: 14pt;">•</span>
                            <span>Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.</span>
                        </p>
                        <p style="margin: 8px 0; display: flex; align-items: start; gap: 8px;">
                            <span style="color: #f59e0b; font-weight: bold; font-size: 14pt;">•</span>
                            <span>Interventions PMR pour B-CS : Voir DICOS.</span>
                        </p>
                        <div style="margin-top: 16px; padding: 12px; background: rgba(245, 158, 11, 0.2); border-radius: 8px; border-left: 4px solid #f59e0b;">
                            <p style="margin: 0; font-weight: 900; color: #92400e; font-size: 11pt;">
                                📱 L'App DICOS PMR reste la base à consulter
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        try {
            const blobHtml = new Blob([html], { type: 'text/html' });
            const blobText = new Blob(['Rapport Déplacements PMR - ' + formattedDate], { type: 'text/plain' });
            await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
            toast.success("HTML copié ! Collez-le dans un nouveau mail Outlook (Ctrl+V)");

            // Optionnel : Ouvrir Outlook avec un mailto basique
            const subject = encodeURIComponent(`Déplacements PMR - ${formattedDate}`);
            window.open(`mailto:?subject=${subject}`, '_blank');
        } catch (err) {
            toast.error("Erreur : " + err.message);
        }
    }

    // --- PDF AMÉLIORÉ avec autoTable ---
    function generatePDF() {
        const doc = new jsPDF();
        const formattedDate = new Date(date).toLocaleDateString('fr-BE', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let currentY = 20;

        // En-tête principal avec bordure
        doc.setFillColor(37, 99, 235); // Bleu
        doc.rect(0, 0, 210, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text("DÉPLACEMENTS PMR", 105, 15, { align: 'center' });
        doc.setFontSize(12);
        doc.setFont("helvetica", "normal");
        doc.text(formattedDate, 105, 25, { align: 'center' });

        currentY = 45;

        // Fonction pour créer une section
        const createSection = (title, presenceMons, presenceTournai, zone, period, color) => {
            // Titre de section avec bordure colorée
            doc.setFillColor(...color);
            doc.rect(10, currentY, 190, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text(title, 15, currentY + 7);

            currentY += 15;

            // Tableau de présence Mons
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("📍 Gare de Mons", 15, currentY);
            currentY += 2;

            autoTable(doc, {
                startY: currentY,
                head: [['SPI', 'OPI', 'CPI', 'PA', '10h-18h']],
                body: [[
                    presenceMons.spi.toString(),
                    presenceMons.opi.toString(),
                    presenceMons.cpi.toString(),
                    presenceMons.pa.toString(),
                    presenceMons.shift_10_18.toString()
                ]],
                theme: 'grid',
                headStyles: {
                    fillColor: color,
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    halign: 'center',
                    fontSize: 11,
                    fontStyle: 'bold'
                },
                margin: { left: 15, right: 15 },
                tableWidth: 90
            });

            currentY = doc.lastAutoTable.finalY + 10;

            // Tableau de présence Tournai
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text("📍 Gare de Tournai", 110, currentY - 8 - doc.lastAutoTable.body.length * 10);

            autoTable(doc, {
                startY: currentY - 10 - doc.lastAutoTable.body.length * 10,
                head: [['SPI', 'CPI', 'PA', '10h-18h']],
                body: [[
                    presenceTournai.spi.toString(),
                    presenceTournai.cpi.toString(),
                    presenceTournai.pa.toString(),
                    presenceTournai.shift_10_18.toString()
                ]],
                theme: 'grid',
                headStyles: {
                    fillColor: [147, 51, 234], // Purple
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                bodyStyles: {
                    halign: 'center',
                    fontSize: 11,
                    fontStyle: 'bold'
                },
                margin: { left: 110 },
                tableWidth: 85
            });

            currentY = Math.max(currentY, doc.lastAutoTable.finalY + 8);

            // Tableaux des interventions FMS
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...color);
            doc.text("Zone FMS", 15, currentY);
            currentY += 5;

            const fmsRows = PRESET_STATIONS_FMS.map(st => {
                const txt = getStationText(st, 'FMS', period).replace(/<br\/>/g, " | ").replace(/<br \/>/g, " | ");
                return [st, txt];
            });

            autoTable(doc, {
                startY: currentY,
                head: [['Gare', 'Détails Interventions']],
                body: fmsRows,
                theme: 'striped',
                headStyles: {
                    fillColor: color,
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 10
                },
                bodyStyles: {
                    fontSize: 9
                },
                columnStyles: {
                    0: { cellWidth: 25, fontStyle: 'bold', halign: 'center' },
                    1: { cellWidth: 'auto' }
                },
                margin: { left: 15, right: 15 },
                alternateRowStyles: {
                    fillColor: [245, 247, 250]
                }
            });

            currentY = doc.lastAutoTable.finalY + 10;

            // Tableaux des interventions FTY
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(147, 51, 234); // Purple
            doc.text("Zone FTY", 15, currentY);
            currentY += 5;

            const ftyRows = PRESET_STATIONS_FTY.map(st => {
                const txt = getStationText(st, 'FTY', period).replace(/<br\/>/g, " | ").replace(/<br \/>/g, " | ");
                return [st, txt];
            });

            autoTable(doc, {
                startY: currentY,
                head: [['Gare', 'Détails Interventions']],
                body: ftyRows,
                theme: 'striped',
                headStyles: {
                    fillColor: [147, 51, 234],
                    textColor: 255,
                    fontStyle: 'bold',
                    fontSize: 10
                },
                bodyStyles: {
                    fontSize: 9
                },
                columnStyles: {
                    0: { cellWidth: 25, fontStyle: 'bold', halign: 'center' },
                    1: { cellWidth: 'auto' }
                },
                margin: { left: 15, right: 15 },
                alternateRowStyles: {
                    fillColor: [250, 245, 255]
                }
            });

            currentY = doc.lastAutoTable.finalY + 15;
        };

        // Créer les sections
        createSection(
            "☀️ PRESTATION MATIN",
            presenceMons,
            presenceTournai,
            'both',
            'morning',
            [37, 99, 235] // Bleu
        );

        // Nouvelle page pour l'après-midi
        doc.addPage();
        currentY = 20;

        createSection(
            "🌙 PRESTATION APRÈS-MIDI",
            presenceMonsAM,
            presenceTournaiAM,
            'both',
            'afternoon',
            [147, 51, 234] // Purple
        );

        // Footer avec bordure
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFillColor(255, 243, 205);
            doc.rect(10, 270, 190, 20, 'FD');
            doc.setDrawColor(251, 191, 36);
            doc.setLineWidth(0.5);
            doc.rect(10, 270, 190, 20);

            doc.setTextColor(120, 53, 15);
            doc.setFontSize(8);
            doc.setFont("helvetica", "italic");
            doc.text("Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.", 15, 275);
            doc.text("Interventions PMR pour B-CS : Voir DICOS.", 15, 280);
            doc.setFont("helvetica", "bold");
            doc.text("⚠️ L'App DICOS PMR reste la base à consulter", 15, 286);

            // Numéro de page
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Page ${i} / ${pageCount}`, 195, 286, { align: 'right' });
        }

        doc.save(`deplacements_pmr_${date}.pdf`);
        toast.success("PDF généré avec succès !");
    }
</script>

<div class="space-y-8 p-4 md:p-8 max-w-[1800px] mx-auto pb-32 animate-fade-in">

    <!-- Header avec dégradé -->
    <header class="relative flex flex-col md:flex-row md:justify-between md:items-end gap-6 pb-8 overflow-hidden">
        <!-- Fond dégradé animé -->
        <div class="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 rounded-3xl animate-gradient-shift"></div>
        <div class="absolute inset-0 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-sm"></div>

        <div class="relative flex items-center gap-4 p-6">
            <div class="p-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/50 animate-pulse-soft">
                <Car class="w-10 h-10" />
            </div>
            <div>
                <h1 class="text-4xl font-black bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    Déplacements PMR
                </h1>
                <p class="text-slate-400 text-sm mt-2 font-medium">Gestion centralisée des prises en charge</p>
            </div>
        </div>

        <div class="relative flex flex-wrap gap-3 p-6">
            <a
                href="/deplacements/historique"
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-slate-500/50 hover:shadow-xl hover:shadow-slate-500/70 hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Train class="w-5 h-5" />
                Historique
            </a>
            <button
                onclick={saveData}
                disabled={loading}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                {#if loading}<span class="animate-spin">⏳</span>{:else}<Save class="w-5 h-5" />{/if}
                Sauvegarder
            </button>
            <button
                onclick={copyForOutlook}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/70 hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Mail class="w-5 h-5" />
                Copier pour Outlook
            </button>
            <button
                onclick={generatePDF}
                class="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white rounded-xl font-bold transition-all duration-300 shadow-lg shadow-red-500/50 hover:shadow-xl hover:shadow-red-500/70 hover:scale-105"
            >
                <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <FileDown class="w-5 h-5" />
                Télécharger PDF
            </button>
        </div>
    </header>

    <!-- Date Selector avec effet -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur-lg opacity-25 group-hover:opacity-50 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
            <label class="text-xs uppercase font-bold text-transparent bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text mb-3 flex items-center gap-2 tracking-widest">
                <Calendar class="w-5 h-5 text-blue-400 animate-pulse-soft" /> Date du rapport
            </label>
            <input
                type="date"
                bind:value={date}
                onchange={loadDailyReport}
                class="w-full max-w-md bg-slate-950 border-2 border-slate-800 text-white rounded-xl px-5 py-3.5 text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-300 cursor-pointer hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/30"
            />
        </div>
    </div>

    <!-- PRESTATION MATIN avec dégradés -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-blue-500/30 rounded-2xl p-8 shadow-2xl">
            <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2 border-gradient-to-r from-blue-500 to-cyan-500">
                <div class="p-3 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl shadow-lg shadow-blue-500/50 animate-pulse-soft">
                    <MapPin class="w-6 h-6 text-white" />
                </div>
                <span class="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Prestation matin</span>
            </h2>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Présence MONS Matin -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-blue-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-blue-400" />
                            <span class="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">
                                Quinyx gare de Mons
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceMons) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-blue-900/30 hover:to-blue-800/30 rounded-xl p-3 border-2 border-blue-500/20 hover:border-blue-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30">
                                    <span class="text-[10px] uppercase text-blue-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceMons[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-blue-100 outline-none appearance-none hover:text-blue-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Présence TOURNAI Matin -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-500 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-purple-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-purple-400" />
                            <span class="bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">
                                Quinyx gare de Tournai
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceTournai) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-purple-900/30 hover:to-pink-900/30 rounded-xl p-3 border-2 border-purple-500/20 hover:border-purple-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30">
                                    <span class="text-[10px] uppercase text-purple-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceTournai[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-purple-100 outline-none appearance-none hover:text-purple-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Interventions Matin -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-blue-600 rounded-3xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-xl border-2 border-blue-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-5 border-b-2 border-blue-500/30 flex justify-between items-center bg-gradient-to-r from-slate-950/80 to-blue-950/30">
                <h3 class="font-black text-lg flex items-center gap-3">
                    <div class="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg shadow-lg">
                        <Users class="w-5 h-5 text-white" />
                    </div>
                    <span class="bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">Interventions MATIN</span>
                    <span class="bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-2 border-blue-400/50 text-sm px-3 py-1 rounded-full font-bold shadow-lg">{interventions.length}</span>
                </h3>
                <button
                    onclick={addRow}
                    class="group/btn relative bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:scale-105"
                >
                    <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                    <Plus class="w-4 h-4 relative z-10" /> <span class="relative z-10">Ajouter</span>
                </button>
            </div>

            <div class="overflow-x-auto flex-1 custom-scrollbar">
                <table class="w-full text-sm text-left border-collapse">
                    <thead class="text-blue-300 uppercase text-xs font-black bg-gradient-to-r from-slate-950 to-blue-950/50 sticky top-0 z-10 border-b-2 border-blue-500/30">
                        <tr>
                            <th class="px-4 py-4 w-20 text-center">Zone</th>
                            <th class="px-4 py-4 w-32">Gare</th>
                            <th class="px-4 py-4">PMR / Mission</th>
                            <th class="px-4 py-4 w-64">Prise en charge par</th>
                            <th class="px-2 py-4 w-12"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-blue-500/10">
                        {#each interventions as row, i}
                            <tr class="hover:bg-blue-500/5 group/row transition-all duration-200 hover:shadow-lg">
                                <td class="p-3">
                                    <input
                                        bind:value={row.zone}
                                        class="w-16 bg-slate-950/50 text-center font-mono text-sm uppercase border-2 border-blue-500/20 hover:border-blue-400/50 rounded-lg px-2 py-2 text-blue-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 outline-none transition-all"
                                        placeholder="-"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        list="stations"
                                        value={row.station}
                                        oninput={(e) => handleStationChange(i, e.target.value)}
                                        class="w-full bg-slate-950/50 border-2 border-blue-500/20 hover:border-blue-400/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg px-3 py-2 font-bold uppercase text-white outline-none transition-all"
                                        placeholder="GARE"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        bind:value={row.pmr_details}
                                        class="w-full bg-slate-950/50 border-2 border-blue-500/20 hover:border-blue-400/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg px-3 py-2 text-slate-200 outline-none transition-all"
                                        placeholder="Ex: 2026-01-20-0081 1 NV IN E 1708 à 08H31"
                                    />
                                </td>
                                <td class="p-3">
                                    <select
                                        bind:value={row.assigned_to}
                                        class="w-full bg-slate-950/50 border-2 border-blue-500/20 hover:border-blue-400/50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer transition-all font-medium"
                                    >
                                        <option value="">- Choisir -</option>
                                        {#each ASSIGNEES as person}
                                            <option value={person}>{person}</option>
                                        {/each}
                                    </select>
                                </td>
                                <td class="p-3 text-center">
                                    <button
                                        onclick={() => removeRow(i)}
                                        class="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover/row:opacity-100 hover:scale-110 border border-transparent hover:border-red-500/30"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- PRESTATION APRÈS-MIDI avec dégradés -->
    <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-3xl blur-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-md border border-purple-500/30 rounded-2xl p-8 shadow-2xl">
            <h2 class="text-3xl font-black mb-8 flex items-center gap-3 pb-5 border-b-2 border-gradient-to-r from-purple-500 to-pink-500">
                <div class="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-lg shadow-purple-500/50 animate-pulse-soft">
                    <MapPin class="w-6 h-6 text-white" />
                </div>
                <span class="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">Prestation après-midi</span>
            </h2>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Présence MONS Après-midi -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-blue-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-blue-400" />
                            <span class="bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">
                                Quinyx gare de Mons
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceMonsAM) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-blue-900/30 hover:to-blue-800/30 rounded-xl p-3 border-2 border-blue-500/20 hover:border-blue-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/30">
                                    <span class="text-[10px] uppercase text-blue-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceMonsAM[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-blue-100 outline-none appearance-none hover:text-blue-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <!-- Présence TOURNAI Après-midi -->
                <div class="relative group/card">
                    <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-pink-500 rounded-2xl opacity-50 group-hover/card:opacity-100 transition duration-300 blur"></div>
                    <div class="relative bg-slate-950/80 border-2 border-purple-500/30 rounded-2xl p-6 shadow-xl">
                        <h3 class="font-black text-slate-100 mb-5 flex items-center gap-2 text-base">
                            <MapPin class="w-5 h-5 text-purple-400" />
                            <span class="bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">
                                Quinyx gare de Tournai
                            </span>
                        </h3>
                        <div class="grid grid-cols-5 gap-3">
                            {#each Object.keys(presenceTournaiAM) as key}
                                <div class="group/input bg-gradient-to-br from-slate-900 to-slate-800 hover:from-purple-900/30 hover:to-pink-900/30 rounded-xl p-3 border-2 border-purple-500/20 hover:border-purple-400/50 flex flex-col items-center transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/30">
                                    <span class="text-[10px] uppercase text-purple-300 font-black mb-2 tracking-wide">{key.replace('shift_', '')}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        bind:value={presenceTournaiAM[key]}
                                        class="w-full bg-transparent text-center text-lg font-black text-purple-100 outline-none appearance-none hover:text-purple-300 transition-colors"
                                    />
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Interventions Après-midi -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 rounded-3xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-slate-900/90 backdrop-blur-xl border-2 border-purple-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-5 border-b-2 border-purple-500/30 flex justify-between items-center bg-gradient-to-r from-slate-950/80 to-purple-950/30">
                <h3 class="font-black text-lg flex items-center gap-3">
                    <div class="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg shadow-lg">
                        <Users class="w-5 h-5 text-white" />
                    </div>
                    <span class="bg-gradient-to-r from-purple-300 to-pink-300 bg-clip-text text-transparent">Interventions APRÈS-MIDI</span>
                    <span class="bg-gradient-to-r from-purple-600 to-pink-600 text-white border-2 border-purple-400/50 text-sm px-3 py-1 rounded-full font-bold shadow-lg">{interventionsAM.length}</span>
                </h3>
                <button
                    onclick={addRowAM}
                    class="group/btn relative bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-4 py-2.5 rounded-xl transition-all duration-300 flex items-center gap-2 font-bold shadow-lg shadow-purple-500/50 hover:shadow-xl hover:scale-105"
                >
                    <div class="absolute inset-0 bg-white/20 rounded-xl opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                    <Plus class="w-4 h-4 relative z-10" /> <span class="relative z-10">Ajouter</span>
                </button>
            </div>

            <div class="overflow-x-auto flex-1 custom-scrollbar">
                <table class="w-full text-sm text-left border-collapse">
                    <thead class="text-purple-300 uppercase text-xs font-black bg-gradient-to-r from-slate-950 to-purple-950/50 sticky top-0 z-10 border-b-2 border-purple-500/30">
                        <tr>
                            <th class="px-4 py-4 w-20 text-center">Zone</th>
                            <th class="px-4 py-4 w-32">Gare</th>
                            <th class="px-4 py-4">PMR / Mission</th>
                            <th class="px-4 py-4 w-64">Prise en charge par</th>
                            <th class="px-2 py-4 w-12"></th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-purple-500/10">
                        {#each interventionsAM as row, i}
                            <tr class="hover:bg-purple-500/5 group/row transition-all duration-200 hover:shadow-lg">
                                <td class="p-3">
                                    <input
                                        bind:value={row.zone}
                                        class="w-16 bg-slate-950/50 text-center font-mono text-sm uppercase border-2 border-purple-500/20 hover:border-purple-400/50 rounded-lg px-2 py-2 text-purple-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 outline-none transition-all"
                                        placeholder="-"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        list="stations"
                                        value={row.station}
                                        oninput={(e) => handleStationChangeAM(i, e.target.value)}
                                        class="w-full bg-slate-950/50 border-2 border-purple-500/20 hover:border-purple-400/50 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg px-3 py-2 font-bold uppercase text-white outline-none transition-all"
                                        placeholder="GARE"
                                    />
                                </td>
                                <td class="p-3">
                                    <input
                                        bind:value={row.pmr_details}
                                        class="w-full bg-slate-950/50 border-2 border-purple-500/20 hover:border-purple-400/50 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg px-3 py-2 text-slate-200 outline-none transition-all"
                                        placeholder="Ex: 2026-01-21-0080 1NV IN E4868 à 18h59"
                                    />
                                </td>
                                <td class="p-3">
                                    <select
                                        bind:value={row.assigned_to}
                                        class="w-full bg-slate-950/50 border-2 border-purple-500/20 hover:border-purple-400/50 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/30 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer transition-all font-medium"
                                    >
                                        <option value="">- Choisir -</option>
                                        {#each ASSIGNEES as person}
                                            <option value={person}>{person}</option>
                                        {/each}
                                    </select>
                                </td>
                                <td class="p-3 text-center">
                                    <button
                                        onclick={() => removeRowAM(i)}
                                        class="text-slate-600 hover:text-red-400 hover:bg-red-500/10 p-2 rounded-lg transition-all opacity-0 group-hover/row:opacity-100 hover:scale-110 border border-transparent hover:border-red-500/30"
                                    >
                                        <Trash2 class="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- Footer note avec design amélioré -->
    <div class="relative group">
        <div class="absolute -inset-0.5 bg-gradient-to-r from-yellow-600 via-orange-500 to-yellow-600 rounded-2xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
        <div class="relative bg-gradient-to-br from-slate-900/90 to-yellow-900/20 border-2 border-yellow-500/30 rounded-2xl p-6 shadow-2xl">
            <div class="flex items-start gap-4">
                <div class="p-3 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-xl shadow-lg flex-shrink-0">
                    <Briefcase class="w-6 h-6 text-white" />
                </div>
                <div class="text-sm space-y-2">
                    <p class="text-slate-300 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                        Des TAXIS PMR sont prévus sans intervention B-Pt voir Planificateur PMR.
                    </p>
                    <p class="text-slate-300 flex items-center gap-2">
                        <span class="w-1.5 h-1.5 bg-yellow-400 rounded-full"></span>
                        Interventions PMR pour B-CS : Voir DICOS.
                    </p>
                    <p class="font-black text-transparent bg-gradient-to-r from-yellow-300 via-orange-300 to-yellow-400 bg-clip-text mt-4 text-base flex items-center gap-2">
                        <span class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                        L'App DICOS PMR reste la base à consulter
                    </p>
                </div>
            </div>
        </div>
    </div>

</div>

<datalist id="stations">
    {#each stationList as s}<option value={s.abbreviation} />{/each}
</datalist>

<style>
    /* Scrollbar moderne avec dégradés */
    .custom-scrollbar::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(15, 23, 42, 0.5);
        border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, rgba(59, 130, 246, 0.5), rgba(147, 51, 234, 0.5));
        border-radius: 10px;
        border: 2px solid rgba(15, 23, 42, 0.5);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: linear-gradient(180deg, rgba(59, 130, 246, 0.8), rgba(147, 51, 234, 0.8));
    }

    /* Animation de fade-in pour toute la page */
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

    .animate-fade-in {
        animation: fadeIn 0.6s ease-out;
    }

    /* Animation de pulse douce */
    @keyframes pulseSoft {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.85;
            transform: scale(1.03);
        }
    }

    .animate-pulse-soft {
        animation: pulseSoft 3s ease-in-out infinite;
    }

    /* Animation de dégradé qui se déplace */
    @keyframes gradientShift {
        0% {
            background-position: 0% 50%;
        }
        50% {
            background-position: 100% 50%;
        }
        100% {
            background-position: 0% 50%;
        }
    }

    .animate-gradient-shift {
        background-size: 200% 200%;
        animation: gradientShift 15s ease infinite;
    }

    /* Masquer les flèches des inputs number */
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    input[type="number"] {
        -moz-appearance: textfield;
    }

    /* Effet de brillance au survol */
    @keyframes shine {
        to {
            background-position: 200% center;
        }
    }
</style>