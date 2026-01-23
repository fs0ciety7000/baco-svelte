import { supabase } from '$lib/supabase';

// Définition des zones (Polygones)
const ZONES = {
    'FTY': { 
        coords: [[
            [3.171566, 50.762703], [3.259986, 50.703089], [3.422346, 50.545890], 
            [3.609590, 50.519025], [3.666147, 50.505289], [4.178260, 50.713701], 
            [3.849421, 50.746417], [3.633609, 50.715668], [3.171566, 50.762703]
        ]], 
        color: '#3b82f6', name: "Zone FTY" 
    },
    'FMS': { 
        coords: [[
            [3.907979, 50.329412], [4.255675, 50.431412], [4.228154, 50.721537], 
            [3.666565, 50.505424], [3.684118, 50.409855], [3.907979, 50.329412]
        ]], 
        color: '#eab308', name: "Zone FMS" 
    },
    'FCR': { 
        coords: [[
            [4.378195, 50.730550], [4.235961, 50.505222], [4.248338, 50.457706], 
            [4.223177, 50.210008], [4.491800, 50.055506], [4.543671, 50.086156], 
            [4.564718, 50.206071], [4.538540, 50.399260], [4.685786, 50.465597], 
            [4.564530, 50.517162], [4.536164, 50.537715], [4.378195, 50.730550]
        ]], 
        color: '#ef4444', name: "Zone FCR" 
    }
};

// Algorithme Point in Polygon
function isPointInPolygon(point, vs) {
    var x = point[0], y = point[1];
    var inside = false;
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        var xi = vs[i][0], yi = vs[i][1];
        var xj = vs[j][0], yj = vs[j][1];
        var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export const PnService = {
    getZones() {
        return Object.entries(ZONES).map(([key, z]) => ({
            key,
            name: z.name,
            color: z.color,
            geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: z.coords } }
        }));
    },

    async loadLines() {
        const { data } = await supabase.from('pn_data').select('ligne_nom');
        if (!data) return [];
        return [...new Set(data.map(i => i.ligne_nom).filter(Boolean))].sort((a,b) => 
            parseInt(a.replace(/\D/g, '')) - parseInt(b.replace(/\D/g, ''))
        );
    },

    async loadPnData() {
        const { data, error } = await supabase.from('pn_data').select('*');
        if (error) throw error;

        // Calcul dynamique des zones côté client + Tri numérique
        const processed = data.map(pn => {
            let computedZone = 'Autre';
            if (pn.geo) {
                const [lat, lon] = pn.geo.split(',').map(parseFloat);
                for (const [key, z] of Object.entries(ZONES)) {
                    if (isPointInPolygon([lon, lat], z.coords[0])) {
                        computedZone = key;
                        break;
                    }
                }
            }
            return { ...pn, zone: computedZone };
        });

        // Tri : PN 2 avant PN 10 (on extrait les chiffres)
        return processed.sort((a, b) => {
            const numA = parseInt((a.pn || '').replace(/\D/g, '')) || 0;
            const numB = parseInt((b.pn || '').replace(/\D/g, '')) || 0;
            return numA - numB;
        });
    },

    async updatePnZone(id, zone) {
        const { error } = await supabase.from('pn_data').update({ zone }).eq('id', id);
        if (error) throw error;
    }
};