import { supabase } from '$lib/supabase';

export const LignesService = {
    /**
     * Charge les filtres initiaux (Liste des lignes et districts associés)
     */
    async loadFilters() {
        const [pn, spi, gares] = await Promise.all([
            supabase.from('pn_data').select('ligne_nom'),
            supabase.from('spi_data').select('ligne_nom'),
            supabase.from('ligne_data').select('ligne_nom, district')
        ]);

        // Mapping Ligne -> District
        const linesToDistricts = {};
        (gares.data || []).forEach(g => {
            if (g.ligne_nom && g.district) {
                linesToDistricts[g.ligne_nom] = g.district;
            }
        });

        // Liste unique de toutes les lignes
        const allLinesRaw = [
            ...(pn.data || []).map(i => i.ligne_nom),
            ...(spi.data || []).map(i => i.ligne_nom),
            ...(gares.data || []).map(i => i.ligne_nom)
        ];

        // Tri naturel (L.2 < L.10)
        const availableLines = [...new Set(allLinesRaw.filter(Boolean))].sort((a, b) => {
            const parseLine = (str) => parseFloat(str.replace('L.', '').replace('A', '.1').replace('C', '.2').replace(/[^0-9.]/g, ''));
            return parseLine(a) - parseLine(b);
        });

        return { availableLines, linesToDistricts };
    },

    /**
     * Charge les données détaillées pour les lignes sélectionnées
     */
    async loadDetails(selectedLines, categories, selectedZones = []) {
        const results = {};
        // Initialisation de la structure pour chaque ligne
        selectedLines.forEach(line => {
            results[line] = { gares: [], pn: [], spi: [] };
        });

        const promises = [];

        // 1. Gares (Lignes)
        if (categories.includes("Lignes")) {
            promises.push(
                supabase.from('ligne_data')
                    .select('ligne_nom, gare')
                    .in('ligne_nom', selectedLines)
                    .order('ordre')
                    .then(res => ({ type: 'gares', data: res.data || [] }))
            );
        }

        // 2. PN
        if (categories.includes("Adresse PN")) {
            promises.push(
                supabase.from('pn_data')
                    .select('*')
                    .in('ligne_nom', selectedLines)
                    // Tri numérique des PN si possible, sinon string
                    .order('pn', { ascending: true }) 
                    .then(res => ({ type: 'pn', data: res.data || [] }))
            );
        }

        // 3. SPI
        if (categories.includes("Zone SPI")) {
            let q = supabase.from('spi_data').select('*').in('ligne_nom', selectedLines);
            if (selectedZones.length > 0) q = q.in('zone', selectedZones);
            promises.push(q.then(res => ({ type: 'spi', data: res.data || [] })));
        }

        // Exécution parallèle
        const responses = await Promise.all(promises);

        // Répartition des résultats
        responses.forEach(res => {
            res.data.forEach(item => {
                if (results[item.ligne_nom]) {
                    results[item.ligne_nom][res.type].push(item);
                }
            });
        });

        // Petit tri post-processing pour les PN (pour gérer les numéros mixtes comme "10A")
        Object.keys(results).forEach(line => {
            if (results[line].pn.length > 0) {
                results[line].pn.sort((a, b) => {
                    const numA = parseInt(String(a.pn).replace(/\D/g, '')) || 0;
                    const numB = parseInt(String(b.pn).replace(/\D/g, '')) || 0;
                    return numA - numB;
                });
            }
        });

        return results;
    }
};