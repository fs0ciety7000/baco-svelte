import { supabase } from '$lib/supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export const RepertoireService = {
    /**
     * Charge tous les contacts
     */
    async loadContacts() {
        const { data, error } = await supabase
            .from('contacts_repertoire')
            .select('*')
            .order('nom');
        
        if (error) throw error;
        return data || [];
    },

    /**
     * Extrait les filtres (Catégories, Zones ET Groupes)
     */
    extractFilters(data) {
        const categories = [...new Set(data.map(c => c.categorie_principale).filter(Boolean))].sort();
        const zones = [...new Set(data.map(c => c.zone).filter(Boolean))].sort();
        const groupes = [...new Set(data.map(c => c.groupe).filter(Boolean))].sort();
        
        return { categories, zones, groupes };
    },

    /**
     * Ajoute ou met à jour un contact
     */
    async saveContact(contact) {
        const payload = { ...contact };
        const id = payload.id;
        delete payload.id; 

        // Nettoyage
        Object.keys(payload).forEach(k => {
            if (!payload[k] || typeof payload[k] === 'string' && payload[k].trim() === '') {
                payload[k] = null;
            }
        });

        let result;
        if (id) {
            result = await supabase.from('contacts_repertoire').update(payload).eq('id', id).select();
        } else {
            result = await supabase.from('contacts_repertoire').insert([payload]).select();
        }

        if (result.error) throw result.error;
        return result.data[0];
    },

    /**
     * Supprime un contact
     */
    async deleteContact(id) {
        const { error } = await supabase.from('contacts_repertoire').delete().eq('id', id);
        if (error) throw error;
    },

    /**
     * Export Excel/PDF
     */
    exportData(contacts, type) {
        const flatData = contacts.map(c => ({
            "Nom": c.nom,
            "Groupe": c.groupe || '',
            "Tel": c.tel || '',
            "Email": c.email || '',
            "Catégorie": c.categorie_principale || '',
            "Zone": c.zone || ''
        }));

        if (type === 'xlsx') {
            const ws = XLSX.utils.json_to_sheet(flatData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Repertoire");
            XLSX.writeFile(wb, `repertoire_${new Date().toISOString().slice(0,10)}.xlsx`);
        } else {
            const doc = new jsPDF();
            doc.text(`Répertoire BACO - ${new Date().toLocaleDateString()}`, 14, 15);
            autoTable(doc, {
                startY: 20,
                head: [['Nom', 'Groupe', 'Tel', 'Email', 'Cat', 'Zone']],
                body: flatData.map(Object.values),
                theme: 'grid',
                styles: { fontSize: 8 }
            });
            doc.save(`repertoire_${new Date().toISOString().slice(0,10)}.pdf`);
        }
    }
};