import { supabase } from '$lib/supabase';

export const DocumentsService = {
    /**
     * Récupère la liste des catégories uniques
     */
    async loadCategories() {
        const { data, error } = await supabase
            .from('document_metadata')
            .select('categorie');
        
        if (error) throw error;
        
        // Extraction unique et tri
        return [...new Set((data || []).map(p => p.categorie))].sort();
    },

    /**
     * Charge les documents filtrés
     */
    async loadDocuments({ category = 'all', search = '' } = {}) {
        let query = supabase
            .from('document_metadata')
            .select('file_name, categorie, created_at')
            .order('file_name', { ascending: true });

        if (category !== 'all') {
            query = query.eq('categorie', category);
        }
        
        if (search.trim()) {
            query = query.ilike('file_name', `%${search.trim()}%`);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /**
     * Upload un fichier et crée sa métadonnée
     */
    async uploadDocument(file, category, userId) {
        // 1. Upload Storage
        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(file.name, file, { upsert: true });

        if (uploadError) throw uploadError;

        // 2. Insert Metadata
        const { error: metadataError } = await supabase
            .from('document_metadata')
            .upsert({ 
                file_name: file.name, 
                categorie: category,
                uploaded_by: userId 
            }, { 
                onConflict: 'file_name' 
            });

        if (metadataError) throw metadataError;
    },

    /**
     * Supprime un document (Storage + Metadata)
     */
    async deleteDocument(fileName) {
        // 1. Delete Metadata
        const { error: metadataError } = await supabase
            .from('document_metadata')
            .delete()
            .eq('file_name', fileName);
        
        if (metadataError) throw metadataError;
        
        // 2. Remove from Storage
        const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([fileName]);
        
        if (storageError) throw storageError;
    },

    /**
     * Génère l'URL publique
     */
    getPublicUrl(fileName) {
        const { data } = supabase.storage.from('documents').getPublicUrl(fileName);
        return data.publicUrl;
    }
};