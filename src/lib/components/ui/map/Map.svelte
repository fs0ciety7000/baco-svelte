<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	let { 
        markers = [], 
        zones = [], 
        className = '', 
        clustering = false,
        showTraffic = false,
        map = $bindable() 
    } = $props();

	let activePopup = null;
    let mapLoaded = false;
    let trafficLayerVisible = false;

    // 1. Préparation Réactive des Données (GeoJSON)
    // Se met à jour automatiquement quand 'markers' change
    let pnsSourceData = $derived({
        type: 'FeatureCollection',
        features: markers
            .filter(m => m.geo)
            .map(m => {
                const [lat, lon] = m.geo.split(',').map(parseFloat);
                return {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [lon, lat] },
                    properties: { 
                        pn: m.pn, 
                        ligne: m.ligne_nom, 
                        bk: m.bk, 
                        adresse: m.adresse 
                    }
                };
            })
    });

	onMount(() => {
		const m = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
			center: [4.47, 50.63],
			zoom: 8,
			attributionControl: false
		});

		m.addControl(new maplibregl.NavigationControl(), 'bottom-right');
		m.addControl(new maplibregl.FullscreenControl(), 'top-right');

		m.on('load', () => {
			map = m; 
            
            // Initialisation des sources et couches
            initLayers();
            if (zones) drawZones(zones);
            
            mapLoaded = true;
		});

        // Events Popup & Cluster
        setupMapEvents(m);
	});

    function initLayers() {
        // Source vide au départ, sera remplie par l'effect
        map.addSource('pns-source', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: clustering,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // 1. Cercles Clusters
        map.addLayer({
            id: 'clusters', type: 'circle', source: 'pns-source',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], '#3b82f6', 10, '#eab308', 30, '#ef4444'],
                'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25],
                'circle-stroke-width': 2, 'circle-stroke-color': '#fff'
            }
        });

        // 2. Compteur Cluster
        map.addLayer({
            id: 'cluster-count', type: 'symbol', source: 'pns-source',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], // Font standard
                'text-size': 12
            },
            paint: { 'text-color': '#ffffff' }
        });

        // 3. Points Uniques (PN)
        map.addLayer({
            id: 'unclustered-point', type: 'circle', source: 'pns-source',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': '#f97316',
                'circle-radius': 6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
            }
        });
    }

    // 2. Réactivité : Mise à jour de la carte
    // Dès que pnsSourceData change (filtre), on met à jour la source MapLibre
    $effect(() => {
        if (mapLoaded && map.getSource('pns-source')) {
            map.getSource('pns-source').setData(pnsSourceData);
        }
    });

    // Réactivité : Trafic
    $effect(() => {
        if (mapLoaded) toggleTraffic(showTraffic);
    });

	onDestroy(() => {
		map?.remove();
	});

    function toggleTraffic(show) {
        if (!mapLoaded) return;
        const sourceId = 'traffic-source';
        
        if (show && !map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'raster',
                tiles: ['https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png'],
                tileSize: 256
            });
            map.addLayer({ 
                id: 'traffic-layer', type: 'raster', source: sourceId, 
                minzoom: 10, paint: { 'raster-opacity': 0.6 } 
            }, 'clusters'); // Insérer sous les clusters
        } else if (!show && map.getLayer('traffic-layer')) {
            map.removeLayer('traffic-layer');
            map.removeSource(sourceId);
        }
    }

	function drawZones(zonesData) {
		zonesData.forEach((zone, index) => {
			const sourceId = `zone-source-${index}`;
			if (!map.getSource(sourceId)) {
				map.addSource(sourceId, { 'type': 'geojson', 'data': zone.geojson });
				map.addLayer({
					'id': `zone-fill-${index}`, 'type': 'fill', 'source': sourceId,
					'paint': { 'fill-color': zone.color || '#3b82f6', 'fill-opacity': 0.1 }
				}, 'clusters'); // Sous les clusters
				map.addLayer({
					'id': `zone-line-${index}`, 'type': 'line', 'source': sourceId,
					'paint': { 'line-color': zone.color || '#3b82f6', 'line-width': 2, 'line-dasharray': [2, 2] }
				}, 'clusters');
			}
		});
	}

    function setupMapEvents(m) {
        // Clic Cluster
        m.on('click', 'clusters', (e) => {
            const features = m.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            m.getSource('pns-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                m.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });

        // Clic Point
        m.on('click', 'unclustered-point', (e) => {
            const props = e.features[0].properties;
            const coordinates = e.features[0].geometry.coordinates.slice();
            const googleMapsUrl = `http://googleusercontent.com/maps.google.com/maps?daddr=${coordinates[1]},${coordinates[0]}`;

            const html = `
                <div class="p-3 min-w-[200px] text-gray-100">
                    <div class="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
                        <span class="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded">Ligne ${props.ligne}</span>
                        <span class="font-bold">PN ${props.pn}</span>
                    </div>
                    <div class="text-xs text-gray-300 space-y-1 mb-3">
                        <div>BK: <span class="font-mono text-white">${props.bk || '?'}</span></div>
                        <div class="italic text-gray-500">${props.adresse || '-'}</div>
                    </div>
                    <a href="${googleMapsUrl}" target="_blank" 
                       class="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 rounded transition-colors">
                        Y aller (GPS)
                    </a>
                </div>
            `;
            showPopup(coordinates, html);
        });

        // Curseurs
        const layers = ['clusters', 'unclustered-point'];
        layers.forEach(layer => {
            m.on('mouseenter', layer, () => m.getCanvas().style.cursor = 'pointer');
            m.on('mouseleave', layer, () => m.getCanvas().style.cursor = '');
        });
    }

    function showPopup(lngLat, htmlContent) {
        if (activePopup) activePopup.remove();
        activePopup = new maplibregl.Popup({ offset: 15, closeButton: false, maxWidth: '300px' })
            .setLngLat(lngLat).setHTML(htmlContent).addTo(map);
    }
</script>

<div class="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl {className}">
	<div bind:this={mapContainer} class="w-full h-full bg-[#16181d]" />
	<slot />
</div>

<style>
	:global(.maplibregl-popup-content) {
		background-color: #1a1d24 !important;
		border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
		padding: 0;
	}
    :global(.maplibregl-popup-tip) { border-top-color: #1a1d24 !important; }
</style>