import { supabase } from '$lib/supabase';

const COORDS_CACHE = new Map();

export const GeoService = {
    /**
     * Récupère les coordonnées GPS d'une gare.
     * Ordre de résolution : cache mémoire -> table gare_coordinates (persistée,
     * corrigeable manuellement par un admin) -> géocodage Nominatim (résultat
     * ensuite sauvegardé en base pour ne plus jamais re-géocoder cette gare).
     */
    async getGareCoordinates(gareName) {
        if (!gareName) return null;
        const cleanName = gareName.replace(/\(.*\)/, '').trim();

        if (COORDS_CACHE.has(cleanName)) return COORDS_CACHE.get(cleanName);

        // 1. Table gare_coordinates : source de vérité une fois résolue/corrigée
        try {
            const { data: cached } = await supabase
                .from('gare_coordinates')
                .select('lon, lat')
                .eq('nom', cleanName)
                .maybeSingle();
            if (cached) {
                const coords = [cached.lon, cached.lat];
                COORDS_CACHE.set(cleanName, coords);
                return coords;
            }
        } catch (e) {
            console.warn('GeoService: lecture cache DB gare_coordinates échouée', e);
        }

        const geocoded = await this._geocodeViaNominatim(cleanName);
        if (geocoded) {
            COORDS_CACHE.set(cleanName, geocoded);
            // Sauvegarde en base pour ne plus jamais re-géocoder cette gare
            supabase
                .from('gare_coordinates')
                .upsert({ nom: cleanName, lon: geocoded[0], lat: geocoded[1], source: 'nominatim' }, { onConflict: 'nom' })
                .then(({ error }) => {
                    if (error) console.warn('GeoService: échec sauvegarde gare_coordinates', error);
                });
        }
        return geocoded;
    },

    /**
     * Géocodage direct via Nominatim, sans passer par le cache DB (fallback interne
     * uniquement, ou utilisé par l'UI admin pour re-résoudre une gare).
     */
    async _geocodeViaNominatim(cleanName) {
        // Restreindre géographiquement à la Belgique et une bande frontalière proche
        // (Lille, Aachen, Maastricht, Luxembourg-Ville...) plutôt qu'à des pays entiers :
        // countrycodes=...,de,fr seul autorisait n'importe quel résultat n'importe où en
        // Allemagne/France dès qu'une requête de repli ambiguë (ex: juste "Nivelles") ne
        // trouvait pas de correspondance précise — d'où des gares belges qui se
        // retrouvaient géocodées près de Heidelberg. bounded=1 + viewbox élimine ce
        // problème tout en gardant les vraies gares transfrontalières proches.
        const viewbox = '2.0,51.6,6.6,49.0'; // lon_gauche,lat_haut,lon_droite,lat_bas
        // "X railway station" cible en priorité le nœud ferroviaire précis ; "Gare de X"
        // matche parfois un bâtiment de gare voisin proche mais différent (ex: recherche
        // "Gare de Nivelles" → répond "Gare de Court-Saint-Étienne").
        const queries = [
            `${cleanName} railway station`,
            `Gare de ${cleanName}`,
            cleanName
        ];

        for (const query of queries) {
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=1&limit=1`;
                const res = await fetch(url, { headers: { 'User-Agent': 'BacoApp/2.0' } });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.length > 0) {
                        const coords = [parseFloat(data[0].lon), parseFloat(data[0].lat)];
                        COORDS_CACHE.set(cleanName, coords);
                        return coords;
                    }
                }
            } catch (e) {
                console.warn(`GeoService: Echec recherche pour "${query}"`, e);
            }
            // Petit délai pour éviter le rate-limiting
            await new Promise(r => setTimeout(r, 100));
        }
        return null;
    },

    /**
     * Liste toutes les gares en cache DB (pour l'UI admin de correction).
     */
    async listCachedGares() {
        const { data, error } = await supabase
            .from('gare_coordinates')
            .select('*')
            .order('nom', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    /**
     * Corrige/force manuellement les coordonnées d'une gare (admin).
     */
    async setGareCoordinates(nom, lon, lat) {
        const cleanName = nom.replace(/\(.*\)/, '').trim();
        const { error } = await supabase
            .from('gare_coordinates')
            .upsert({ nom: cleanName, lon, lat, source: 'manuel' }, { onConflict: 'nom' });
        if (error) throw error;
        COORDS_CACHE.set(cleanName, [lon, lat]);
    },

    /**
     * Supprime une gare du cache DB (elle sera re-géocodée via Nominatim au prochain usage).
     */
    async deleteCachedGare(nom) {
        const { error } = await supabase.from('gare_coordinates').delete().eq('nom', nom);
        if (error) throw error;
        COORDS_CACHE.delete(nom);
    },

    /**
     * Calcule un itinéraire routier via OSRM
     * @param {Array<Array<number>>} coordinates - Tableau de coordonnées [lon, lat]
     */
    async fetchRouteOSRM(coordinates) {
        if (!coordinates || coordinates.length < 2) return null;
        
        // OSRM format: lon1,lat1;lon2,lat2
        const coordString = coordinates.map(c => c.join(',')).join(';');
        
        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                return data.routes[0].geometry;
            }
        } catch (e) {
            console.warn("GeoService: Erreur OSRM, fallback ligne droite", e);
        }
        
        // Fallback: Ligne Droite simple si OSRM échoue
        return {
            type: 'LineString',
            coordinates: coordinates
        };
    }
};