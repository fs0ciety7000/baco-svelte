const COORDS_CACHE = new Map();

export const GeoService = {
    /**
     * Récupère les coordonnées GPS d'une gare (avec cache mémoire)
     */
    async getGareCoordinates(gareName) {
        if (!gareName) return null;
        const cleanName = gareName.replace(/\(.*\)/, '').trim();
        
        if (COORDS_CACHE.has(cleanName)) return COORDS_CACHE.get(cleanName);

        const queries = [
            `Gare de ${cleanName}, Belgique`,
            `${cleanName} Station, Belgium`,
            `${cleanName}, Belgique`
        ];

        for (const query of queries) {
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
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