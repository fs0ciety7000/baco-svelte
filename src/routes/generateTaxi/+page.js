// src/routes/generateTaxi/+page.js
import { supabase } from '$lib/supabase';

export async function load({ parent }) {
    const { session } = await parent();

    // On lance toutes les requêtes en parallèle pour la vitesse
    const [taxisRes, pmrRes, ebpRes, historyRes] = await Promise.all([
        supabase.from('taxis').select('id, nom, adresse, email').order('nom'),
        supabase.from('pmr_clients').select('id, nom, prenom, telephone').order('nom'),
        supabase.from('ebp').select('PtCar').order('PtCar'), // Récupère les gares
        supabase.from('taxi_commands').select('*').order('created_at', { ascending: false }).limit(50)
    ]);

    // On nettoie les gares (doublons éventuels et valeurs nulles)
    const stations = [...new Set((ebpRes.data || []).map(i => i.PtCar).filter(Boolean))];

    return {
        taxis: taxisRes.data || [],
        pmrClients: pmrRes.data || [],
        stations: stations, // Liste simple de noms de gares
        history: historyRes.data || [],
        user: session?.user
    };
}