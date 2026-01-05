<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	// On lie 'map' pour le contrôler depuis le parent (zoom, centrage)
	let { route = null, markers = [], zones = [], className = '', map = $bindable() } = $props();
	
	let markerInstances = [];
	let activePopup = null; // Variable unique pour éviter les doublons de popups

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
			map = m; // On remonte l'instance au parent
			updateMapElements();
		});
	});

	onDestroy(() => {
		map?.remove();
	});

	// Réactivité Svelte 5 : Met à jour la carte dès qu'une prop change
	$effect(() => {
		if (map && map.loaded()) {
			updateMapElements();
		}
	});

	function updateMapElements() {
		// Ordre de dessin : Zones (fond) -> Route -> Marqueurs (premier plan)
		if (zones) drawZones(zones);
		if (route) drawRoute(route);
		// On passe markers (ou tableau vide) pour forcer le nettoyage si nécessaire
		drawMarkers(markers || []);
	}

	function drawRoute(routeData) {
		if (!map.getSource('route')) {
			map.addSource('route', { 'type': 'geojson', 'data': routeData });
			map.addLayer({
				'id': 'route',
				'type': 'line',
				'source': 'route',
				'layout': { 'line-join': 'round', 'line-cap': 'round' },
				'paint': { 'line-color': '#3b82f6', 'line-width': 4, 'line-opacity': 0.8 }
			});
		} else {
			map.getSource('route').setData(routeData);
		}
	}

	function drawMarkers(markersData) {
		// 1. NETTOYAGE : On supprime d'abord tous les marqueurs existants
		if (markerInstances.length > 0) {
			markerInstances.forEach(m => m.remove());
			markerInstances = [];
		}

		// 2. Si la liste est vide (filtres décochés), on s'arrête là -> La carte est propre
		if (!markersData || markersData.length === 0) return;

		// 3. Dessin des nouveaux marqueurs
		markersData.forEach(m => {
			const el = document.createElement('div');
			
			// Styles CSS
			let baseClass = 'w-3 h-3 rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-125 transition-transform';
			let colorClass = 'bg-orange-500'; 

			if (m.type === 'start') { baseClass = 'w-4 h-4 z-20'; colorClass = 'bg-green-500'; }
			else if (m.type === 'end') { baseClass = 'w-4 h-4 z-20'; colorClass = 'bg-red-500'; }
			else if (m.type === 'pn') { colorClass = 'bg-orange-500'; }

			el.className = `${baseClass} ${colorClass}`;

			const marker = new maplibregl.Marker({ element: el })
				.setLngLat(m.lngLat)
				.addTo(map);
			
			// Événements pour le Popup (Gestion Singleton)
			el.addEventListener('mouseenter', () => {
				showPopup(m.lngLat, m.popupContent || m.label, 'custom-popup');
			});

			markerInstances.push(marker);
		});
	}

	function drawZones(zonesData) {
		zonesData.forEach((zone, index) => {
			const sourceId = `zone-source-${index}`;
			const fillId = `zone-fill-${index}`;
			const lineId = `zone-line-${index}`;

			// On n'ajoute la source que si elle n'existe pas déjà
			if (!map.getSource(sourceId)) {
				map.addSource(sourceId, { 'type': 'geojson', 'data': zone.geojson });

				// Remplissage
				map.addLayer({
					'id': fillId, 'type': 'fill', 'source': sourceId, 'layout': {},
					'paint': { 'fill-color': zone.color || '#3b82f6', 'fill-opacity': 0.15 }
				});

				// Contour
				map.addLayer({
					'id': lineId, 'type': 'line', 'source': sourceId, 'layout': {},
					'paint': { 'line-color': zone.color || '#3b82f6', 'line-width': 2, 'line-opacity': 0.8 }
				});

				// Interaction Zone
				map.on('mouseenter', fillId, (e) => {
					map.getCanvas().style.cursor = 'pointer';
					showPopup(e.lngLat, `<div class="text-black font-bold px-2">${zone.name}</div>`, 'zone-popup');
				});

				map.on('mouseleave', fillId, () => {
					map.getCanvas().style.cursor = '';
                    // Optionnel : fermer le popup en sortant de la zone
                    // if (activePopup) { activePopup.remove(); activePopup = null; }
				});
			}
		});
	}

    // Helper centralisé pour afficher les popups sans doublons
    function showPopup(lngLat, htmlContent, className = '') {
        if (activePopup) activePopup.remove(); // Ferme l'ancien

        activePopup = new maplibregl.Popup({ 
            offset: 15, 
            closeButton: false, 
            maxWidth: '300px',
            className: className
        })
        .setLngLat(lngLat)
        .setHTML(htmlContent || '')
        .addTo(map);
    }
</script>

<div class="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl {className}">
	<div bind:this={mapContainer} class="w-full h-full bg-[#16181d]" />
	<slot />
</div>

<style>
	:global(.maplibregl-ctrl-group) { background-color: #0f1115 !important; border: 1px solid rgba(255,255,255,0.1) !important; }
	:global(.maplibregl-ctrl-icon) { filter: invert(1); }
	
	:global(.maplibregl-popup-content) {
		background-color: #1a1d24; color: white;
		border: 1px solid rgba(255,255,255,0.1); border-radius: 12px;
		padding: 0; overflow: hidden;
		box-shadow: 0 4px 15px rgba(0,0,0,0.5);
	}
	:global(.maplibregl-popup-tip) { border-top-color: #1a1d24; }
	
	/* Style blanc pour les labels de zones */
	:global(.zone-popup .maplibregl-popup-content) { background: white; color: black; border: none; padding: 4px 8px; border-radius: 4px; }
	:global(.zone-popup .maplibregl-popup-tip) { border-top-color: white; }
</style>