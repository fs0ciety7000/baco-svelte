<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	// map est bindable pour permettre au parent de le contrôler
	let { route = null, markers = [], zones = [], className = '', map = $bindable() } = $props();
	
	let markerInstances = [];
	let activePopup = null; // Variable unique pour empêcher les doublons de popups

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
			updateMapElements();
		});
	});

	onDestroy(() => {
		map?.remove();
	});

	// Réactivité : Met à jour les éléments quand les props changent
	$effect(() => {
		if (map && map.loaded()) {
			updateMapElements();
		}
	});

	function updateMapElements() {
		// On dessine dans l'ordre : Zones (fond) -> Route -> Marqueurs (dessus)
		if (zones) drawZones(zones);
		if (route) drawRoute(route);
		// On appelle drawMarkers même si le tableau est vide pour nettoyer la carte
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
		// 1. Nettoyage TOTAL des anciens marqueurs
		if (markerInstances.length > 0) {
			markerInstances.forEach(m => m.remove());
			markerInstances = [];
		}

		// 2. Si pas de données (filtres tout décochés), on s'arrête là
		if (!markersData || markersData.length === 0) return;

		// 3. Création des nouveaux
		markersData.forEach(m => {
			const el = document.createElement('div');
			
			let baseClass = 'w-3 h-3 rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-125 transition-transform';
			let colorClass = 'bg-orange-500'; 

			if (m.type === 'start') { baseClass = 'w-4 h-4 z-20'; colorClass = 'bg-green-500'; }
			else if (m.type === 'end') { baseClass = 'w-4 h-4 z-20'; colorClass = 'bg-red-500'; }
			else if (m.type === 'pn') { colorClass = 'bg-orange-500'; }

			el.className = `${baseClass} ${colorClass}`;

			const marker = new maplibregl.Marker({ element: el })
				.setLngLat(m.lngLat)
				.addTo(map);
			
			// Gestion des popups "single instance" pour éviter la duplication
			el.addEventListener('mouseenter', () => {
				if (activePopup) activePopup.remove(); // Ferme l'ancien s'il existe
				
				activePopup = new maplibregl.Popup({ 
					offset: 15, 
					closeButton: false, 
					maxWidth: '300px',
					className: 'custom-popup-fade'
				})
				.setLngLat(m.lngLat)
				.setHTML(m.popupContent || m.label || '')
				.addTo(map);
			});

			// On ne ferme pas automatiquement sur mouseleave pour permettre de cliquer sur les liens dans le popup
			// Si vous préférez fermer au survol, décommentez ceci :
			/*
			el.addEventListener('mouseleave', () => {
				if (activePopup) activePopup.remove();
				activePopup = null;
			});
			*/

			markerInstances.push(marker);
		});
	}

	function drawZones(zonesData) {
		zonesData.forEach((zone, index) => {
			const sourceId = `zone-source-${index}`;
			const fillId = `zone-fill-${index}`;
			const lineId = `zone-line-${index}`;

			// Si la source n'existe pas encore, on la crée
			if (!map.getSource(sourceId)) {
				map.addSource(sourceId, { 'type': 'geojson', 'data': zone.geojson });

				map.addLayer({
					'id': fillId, 'type': 'fill', 'source': sourceId, 'layout': {},
					'paint': { 'fill-color': zone.color || '#3b82f6', 'fill-opacity': 0.15 }
				});

				map.addLayer({
					'id': lineId, 'type': 'line', 'source': sourceId, 'layout': {},
					'paint': { 'line-color': zone.color || '#3b82f6', 'line-width': 2, 'line-opacity': 0.8 }
				});

				// Interaction Zone
				map.on('mouseenter', fillId, (e) => {
					map.getCanvas().style.cursor = 'pointer';
					
					if (activePopup) activePopup.remove(); // Évite duplication
					
					activePopup = new maplibregl.Popup({ closeButton: false, className: 'zone-popup' })
						.setLngLat(e.lngLat)
						.setHTML(`<div class="text-black font-bold px-2">${zone.name}</div>`)
						.addTo(map);
				});

				map.on('mouseleave', fillId, () => {
					map.getCanvas().style.cursor = '';
					if (activePopup) {
						activePopup.remove();
						activePopup = null;
					}
				});
			}
		});
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
	
	/* Style spécifique pour les zones (blanc) */
	:global(.zone-popup .maplibregl-popup-content) { background: white; color: black; border: none; padding: 4px 8px; }
	:global(.zone-popup .maplibregl-popup-tip) { border-top-color: white; }
</style>