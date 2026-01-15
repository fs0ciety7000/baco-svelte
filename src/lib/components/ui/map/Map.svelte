<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	let { 
        markers = [], 
        zones = [], 
        route = null, // ADDED: Support for route
        className = '', 
        clustering = false,
        showTraffic = false,
		style = 'dark',
        map = $bindable() 
    } = $props();

	let activePopup = null;
    let mapLoaded = $state(false);

    const STYLES = {
        dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
    };

    // 1. Reactive Data Preparation (Hybrid: PN or Otto)
    let pnsSourceData = $derived({
        type: 'FeatureCollection',
        features: markers
            .map(m => {
                // CASE 1: PN Format (geo string)
                if (m.geo) {
                    const [lat, lon] = m.geo.split(',').map(parseFloat);
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: [lon, lat] },
                        properties: { 
                            type: 'pn', // Marker type
                            pn: m.pn, 
                            ligne: m.ligne_nom, 
                            bk: m.bk, 
                            adresse: m.adresse 
                        }
                    };
                }
                // CASE 2: Otto Format (lngLat array)
                else if (m.lngLat) {
                    return {
                        type: 'Feature',
                        geometry: { type: 'Point', coordinates: m.lngLat },
                        properties: { 
                            type: 'otto', // Marker type
                            label: m.label || 'Point',
                            markerType: m.type // start, end, stop
                        }
                    };
                }
                return null;
            }).filter(Boolean)
    });

    onMount(() => {
		const m = new maplibregl.Map({
			container: mapContainer,
			style: STYLES[style],
			center: [4.47, 50.63],
			zoom: 9,
			attributionControl: false
		});

		m.addControl(new maplibregl.NavigationControl(), 'bottom-right');
		m.addControl(new maplibregl.FullscreenControl(), 'top-right');

		m.on('load', () => {
			map = m; 
            initLayers();
            if (zones) drawZones(zones);
            mapLoaded = true;
		});

        m.on('styledata', () => {
             if (mapLoaded) {
                if (!m.getSource('pns-source')) {
                    initLayers();
                    if (zones) drawZones(zones);
                    m.getSource('pns-source').setData(pnsSourceData);
                    if (route && m.getSource('route-source')) m.getSource('route-source').setData(route);
                    toggleTraffic(showTraffic);
                }
            }
        });

        setupMapEvents(m);
	});

    function initLayers() {
        if (!map) return;

        // --- SOURCE: POINTS (Markers) ---
        map.addSource('pns-source', {
            type: 'geojson',
            data: pnsSourceData,
            cluster: clustering,
            clusterMaxZoom: 14,
            clusterRadius: 50
        });

        // --- SOURCE: ROUTE (New) ---
        // Only add if route data might exist or we want the capability
        map.addSource('route-source', {
            type: 'geojson',
            data: route || { type: 'FeatureCollection', features: [] }
        });

        // LAYER: Route Line
        map.addLayer({
            id: 'route-line',
            type: 'line',
            source: 'route-source',
            layout: {
                'line-join': 'round',
                'line-cap': 'round'
            },
            paint: {
                'line-color': '#3b82f6', // Blue
                'line-width': 4,
                'line-opacity': 0.8
            }
        });

        // LAYER: Clusters
        map.addLayer({
            id: 'clusters', type: 'circle', source: 'pns-source',
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': ['step', ['get', 'point_count'], '#3b82f6', 10, '#eab308', 30, '#ef4444'],
                'circle-radius': ['step', ['get', 'point_count'], 15, 10, 20, 30, 25],
                'circle-stroke-width': 2, 'circle-stroke-color': '#fff'
            }
        });

        map.addLayer({
            id: 'cluster-count', type: 'symbol', source: 'pns-source',
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12
            },
            paint: { 'text-color': '#ffffff' }
        });

        // LAYER: Unclustered Points (Modified to support colors based on type)
        map.addLayer({
            id: 'unclustered-point', type: 'circle', source: 'pns-source',
            filter: ['!', ['has', 'point_count']],
            paint: {
                'circle-color': [
                    'match', ['get', 'markerType'],
                    'start', '#22c55e', // Green for start
                    'end', '#ef4444',   // Red for end
                    'stop', '#eab308',  // Yellow for stops
                    '#f97316'           // Orange default (PNs)
                ],
                'circle-radius': 6,
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff'
            }
        });
    }

    // Effect: Update Style
    $effect(() => {
        if (mapLoaded && map) {
            // Check if style actually changed to avoid loop could be good, but setStyle is okay
            // map.setStyle(STYLES[style]); // Careful with loops, handled by caller mostly
        }
    });

    // Effect: Update Markers
    $effect(() => {
        if (mapLoaded && map.getSource('pns-source')) {
            map.getSource('pns-source').setData(pnsSourceData);
        }
    });

    // Effect: Update Route
    $effect(() => {
        if (mapLoaded && map.getSource('route-source')) {
             map.getSource('route-source').setData(route || { type: 'FeatureCollection', features: [] });
        }
    });

    // Effect: Traffic
    $effect(() => {
        if (mapLoaded) toggleTraffic(showTraffic);
    });

	onDestroy(() => {
		map?.remove();
	});

    function toggleTraffic(show) {
        if (!mapLoaded || !map) return;
        const sourceId = 'traffic-source';
        if (show && !map.getSource(sourceId)) {
            map.addSource(sourceId, {
                type: 'raster',
                tiles: ['https://tile.memomaps.de/tilegen/{z}/{x}/{y}.png'],
                tileSize: 256
            });
            const beforeLayer = map.getLayer('clusters') ? 'clusters' : undefined;
            map.addLayer({ 
                id: 'traffic-layer', type: 'raster', source: sourceId, 
                minzoom: 10, paint: { 'raster-opacity': 0.6 } 
            }, beforeLayer);
        } else if (!show && map.getLayer('traffic-layer')) {
            map.removeLayer('traffic-layer');
            map.removeSource(sourceId);
        }
    }

	function drawZones(zonesData) {
        if (!map) return;
        zonesData.forEach((zone, index) => {
			const sourceId = `zone-source-${index}`;
			if (!map.getSource(sourceId)) {
				map.addSource(sourceId, { 'type': 'geojson', 'data': zone.geojson });
                const beforeLayer = map.getLayer('route-line') ? 'route-line' : (map.getLayer('clusters') ? 'clusters' : undefined);
				map.addLayer({
					'id': `zone-fill-${index}`, 'type': 'fill', 'source': sourceId,
					'paint': { 'fill-color': zone.color || '#3b82f6', 'fill-opacity': 0.1 }
				}, beforeLayer);
				map.addLayer({
					'id': `zone-line-${index}`, 'type': 'line', 'source': sourceId,
					'paint': { 'line-color': zone.color || '#3b82f6', 'line-width': 2, 'line-dasharray': [2, 2] }
				}, beforeLayer);
			}
		});
    }

    function setupMapEvents(m) {
        m.on('click', 'clusters', (e) => {
            const features = m.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            m.getSource('pns-source').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                m.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });

        m.on('click', 'unclustered-point', (e) => {
            const props = e.features[0].properties;
            const coordinates = e.features[0].geometry.coordinates.slice();
            
            let html = '';

            // POPUP CONTENT: Switch based on type
            if (props.type === 'pn') {
                 const googleMapsUrl = `https://www.google.com/maps?q=${coordinates[1]},${coordinates[0]}`;
                 html = `
                    <div class="p-3 min-w-[200px] text-gray-100">
                        <div class="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
                            <span class="bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded">Ligne ${props.ligne}</span>
                            <span class="font-bold"> ${props.pn}</span>
                        </div>
                        <div class="text-xs text-gray-300 space-y-1 mb-3">
                            <div> <span class="font-mono text-white">${props.bk || '?'}</span></div>
                            <div class="italic text-gray-500">${props.adresse || '-'}</div>
                        </div>
                        <a href="${googleMapsUrl}" target="_blank" class="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-1.5 rounded transition-colors">Google Maps</a>
                    </div>`;
            } else {
                // OTTO CONTENT
                html = `
                    <div class="p-2 text-gray-100 text-sm font-bold">
                        ${props.label}
                    </div>
                `;
            }

            showPopup(coordinates, html);
        });

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