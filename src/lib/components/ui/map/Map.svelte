<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	let { 
        route = null, 
        markers = [], 
        zones = [], 
        className = '', 
        clustering = false,
        showTraffic = false,
        map = $bindable() 
    } = $props();

	let activePopup = null;
    let mapLoaded = false;

	onMount(() => {
		const m = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
			center: [4.47, 50.63], // Centre Belgique
			zoom: 8,
			attributionControl: false
		});

		m.addControl(new maplibregl.NavigationControl(), 'bottom-right');
		m.addControl(new maplibregl.FullscreenControl(), 'top-right');

		m.on('load', () => {
			map = m; 
            mapLoaded = true;
			updateMapElements();
		});

        // Gestion des clusters
        m.on('click', 'clusters', (e) => {
            const features = m.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            m.getSource('pns-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                m.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });

        // Gestion des clics sur PN individuel
        m.on('click', 'unclustered-point', (e) => {
            const props = e.features[0].properties;
            const coordinates = e.features[0].geometry.coordinates.slice();
            
          // CORRECTION DE L'URL ICI
            // Google Maps attend "Lat,Lon", donc coordinates[1],coordinates[0]
            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${coordinates[1]},${coordinates[0]}`;

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
                    <a href="${googleMapsUrl}" 
                       target="_blank" 
                       class="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 rounded transition-colors">
                        Y aller (GPS)
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                    </a>
                </div>
            `;
            showPopup(coordinates, html);
        });

        m.on('mouseenter', 'clusters', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'clusters', () => m.getCanvas().style.cursor = '');
        m.on('mouseenter', 'unclustered-point', () => m.getCanvas().style.cursor = 'pointer');
        m.on('mouseleave', 'unclustered-point', () => m.getCanvas().style.cursor = '');
	});

	onDestroy(() => {
		map?.remove();
	});

	$effect(() => {
		if (mapLoaded) {
			updateMapElements();
            toggleTraffic(showTraffic);
		}
	});

	function updateMapElements() {
		if (zones) drawZones(zones);
        if (clustering) drawClusteredMarkers(markers);
        else drawSimpleMarkers(markers);
	}

    function toggleTraffic(show) {
        const sourceId = 'traffic-source';
        if (show) {
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: 'raster',
                    tiles: ['https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png'],
                    tileSize: 256
                });
                map.addLayer({ id: 'traffic-layer', type: 'raster', source: sourceId, minzoom: 10, paint: { 'raster-opacity': 0.6 } });
            }
        } else {
             if (map.getLayer('traffic-layer')) map.removeLayer('traffic-layer');
             if (map.getSource(sourceId)) map.removeSource(sourceId);
        }
    }

    function drawClusteredMarkers(markersData) {
        const features = markersData
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
            });

        const sourceData = { type: 'FeatureCollection', features };

        if (!map.getSource('pns-source')) {
            map.addSource('pns-source', {
                type: 'geojson',
                data: sourceData,
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 50
            });

            // 1. Cercle des Clusters
            map.addLayer({
                id: 'clusters',
                type: 'circle',
                source: 'pns-source',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': [
                        'step', ['get', 'point_count'],
                        '#3b82f6', 10,
                        '#eab308', 30,
                        '#ef4444'
                    ],
                    'circle-radius': [
                        'step', ['get', 'point_count'],
                        15, 10,
                        20, 30,
                        25
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

            // 2. Compteur (CORRECTION FONT ICI)
            map.addLayer({
                id: 'cluster-count',
                type: 'symbol',
                source: 'pns-source',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], // <--- ICI
                    'text-size': 12
                },
                paint: { 'text-color': '#ffffff' }
            });

            // 3. Points individuels
            map.addLayer({
                id: 'unclustered-point',
                type: 'circle',
                source: 'pns-source',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': '#f97316',
                    'circle-radius': 6,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff'
                }
            });

        } else {
            map.getSource('pns-source').setData(sourceData);
        }
    }

    function drawSimpleMarkers(markersData) {
        // ... (Ton code legacy si utilisé)
    }

	function drawZones(zonesData) {
		zonesData.forEach((zone, index) => {
			const sourceId = `zone-source-${index}`;
			if (!map.getSource(sourceId)) {
				map.addSource(sourceId, { 'type': 'geojson', 'data': zone.geojson });
				map.addLayer({
					'id': `zone-fill-${index}`, 'type': 'fill', 'source': sourceId,
					'paint': { 'fill-color': zone.color || '#3b82f6', 'fill-opacity': 0.1 }
				});
				map.addLayer({
					'id': `zone-line-${index}`, 'type': 'line', 'source': sourceId,
					'paint': { 'line-color': zone.color || '#3b82f6', 'line-width': 2, 'line-dasharray': [2, 2] }
				});
			}
		});
	}

    function showPopup(lngLat, htmlContent) {
        if (activePopup) activePopup.remove();
        activePopup = new maplibregl.Popup({ 
            offset: 15, 
            closeButton: false, 
            maxWidth: '300px',
            className: 'custom-popup-class'
        })
        .setLngLat(lngLat)
        .setHTML(htmlContent)
        .addTo(map);
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