import { supabase } from '$lib/supabase';

export const BusService = {
    /**
     * Récupère et structure les lignes par district (DSE/DSO/DCE)
     */
    async fetchLinesStructure() {
        // 1. Récupérer toutes les lignes utilisées par les bus
        const { data: busData, error: busError } = await supabase.from('lignes_bus').select('ligne');
        if (busError) throw busError;

        // On filtre les valeurs nulles ou vides
        const uniqueBusLines = [...new Set((busData || []).map(item => item.ligne).filter(Boolean))];

        // 2. Récupérer les infos de district pour ces lignes
        const { data: linesInfo, error: linesError } = await supabase
            .from('ligne_data')
            .select('ligne_nom, district')
            .in('ligne_nom', uniqueBusLines);
        
        if (linesError) throw linesError;

        // 3. Structuration (Ajout de DCE ici)
        const structure = { 'DSE': new Set(), 'DSO': new Set(), 'DCE': new Set() };
        const knownLinesMap = {};

        // Lignes connues
        linesInfo?.forEach(info => {
            // Sécurité : on force en majuscule et on vérifie si la clé existe
            let dist = (info.district || 'DSO').toUpperCase();
            
            // Si le district reçu n'est pas DSE, DSO ou DCE, on fallback sur DSO
            if (!structure[dist]) {
                dist = 'DSO';
            }
            
            structure[dist].add(info.ligne_nom);
            knownLinesMap[info.ligne_nom] = dist;
        });

        // Lignes inconnues
        uniqueBusLines.forEach(l => {
            if (!knownLinesMap[l]) {
                structure['DSO'].add(l);
                knownLinesMap[l] = 'DSO';
            }
        });

        // Tri numérique naturel
        const sortLines = (a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
        };

        return {
            linesByDistrict: {
                'DSE': Array.from(structure['DSE']).sort(sortLines),
                'DSO': Array.from(structure['DSO']).sort(sortLines),
                'DCE': Array.from(structure['DCE']).sort(sortLines) // Ajouté
            },
            knownLinesMap
        };
    },

    /**
     * Recherche globale (Sociétés, Chauffeurs, Contacts)
     */
    async searchSocietes(term) {
        if (!term) return [];
        const t = `%${term}%`;

        // Recherche parallèle
        const [socs, chauff, cont] = await Promise.all([
            supabase.from('societes_bus').select('id').ilike('nom', t),
            supabase.from('chauffeurs_bus').select('societe_id').ilike('nom', t),
            supabase.from('contacts_bus').select('societe_id').ilike('nom', t)
        ]);

        const allIds = new Set([
            ...(socs.data?.map(s => s.id) || []),
            ...(chauff.data?.map(c => c.societe_id) || []),
            ...(cont.data?.map(c => c.societe_id) || [])
        ]);

        if (allIds.size === 0) return [];

        const { data } = await supabase
            .from('societes_bus')
            .select('id, nom')
            .in('id', [...allIds])
            .order('nom');
            
        return data || [];
    },

    /**
     * Récupère les sociétés liées à une liste de lignes
     */
    async getSocietesByLines(lines) {
        if (!lines || lines.length === 0) return [];

        const { data: lignesData } = await supabase
            .from('lignes_bus')
            .select('societe_id')
            .in('ligne', lines);
            
        const uniqueIds = [...new Set(lignesData?.map(item => item.societe_id) || [])];
        if (uniqueIds.length === 0) return [];

        const { data } = await supabase
            .from('societes_bus')
            .select('id, nom')
            .in('id', uniqueIds)
            .order('nom');

        return data || [];
    },

    /**
     * Récupère les détails (contacts/chauffeurs) pour les sociétés sélectionnées
     */
    async getDetails(societeIds) {
        if (!societeIds || societeIds.length === 0) return { contacts: [], chauffeurs: [] };

        const [contacts, chauffeurs] = await Promise.all([
            supabase.from('contacts_bus')
                .select('id, nom, tel, societes_bus(nom)')
                .in('societe_id', societeIds),
            supabase.from('chauffeurs_bus')
                .select('id, nom, tel, societes_bus(nom)')
                .in('societe_id', societeIds)
        ]);

        return {
            contacts: contacts.data || [],
            chauffeurs: chauffeurs.data || []
        };
    },

    /**
     * Ajoute ou met à jour une société (via RPC)
     */
    async upsertSociete(payload) {
        // 1. S'assurer que les lignes existent dans ligne_data
        if (payload.new_lignes && payload.new_lignes.length > 0) {
            for (const line of payload.new_lignes) {
                // On tente un upsert "silencieux" pour créer la ligne si elle manque
                await supabase.from('ligne_data')
                    .upsert(
                        { ligne_nom: line, district: 'DSO', gare: 'Gare Inconnue' }, 
                        { onConflict: 'ligne_nom', ignoreDuplicates: true }
                    );
            }
        }

        // 2. Appel RPC
        const { error } = await supabase.rpc('upsert_societe_bus', payload);
        if (error) throw error;
    },

    /**
     * Supprime une société
     */
    async deleteSociete(id) {
        const { error } = await supabase.rpc('delete_societe_bus', { societe_id_to_delete: id });
        if (error) throw error;
    }
};