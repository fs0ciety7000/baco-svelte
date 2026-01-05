<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	let map = $state(null);
    let markerInstances = [];

    // Ajout de la prop 'markers'
	let { route = null, markers = [], className = '' } = $props();

	onMount(() => {
		map = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
			center: [4.3517, 50.8503],
			zoom: 8,
			attributionControl: false
		});

		map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

		map.on('load', () => {
			if (route) drawRoute(route);
            if (markers) drawMarkers(markers);
		});
	});

	onDestroy(() => {
		map?.remove();
	});

    // Réactivité : on redessine si les données changent
    $effect(() => {
        if (map && map.loaded()) {
            if (route) drawRoute(route);
            if (markers) drawMarkers(markers);
        }
    });

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

        // Zoom automatique pour tout voir
        const coordinates = routeData.geometry.coordinates;
        if (coordinates && coordinates.length > 0) {
            const bounds = coordinates.reduce((bounds, coord) => {
                return bounds.extend(coord);
            }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
            map.fitBounds(bounds, { padding: 50 });
        }
	}

    function drawMarkers(markersData) {
        // Nettoyage des anciens marqueurs
        markerInstances.forEach(m => m.remove());
        markerInstances = [];

        markersData.forEach(m => {
            // Création de l'élément HTML du marqueur
            const el = document.createElement('div');
            // Styles par défaut (Arrêt intermédiaire)
            el.className = 'w-3 h-3 bg-orange-500 rounded-full border-2 border-white shadow-lg cursor-pointer hover:scale-125 transition-transform';
            
            // Styles spécifiques
            if (m.type === 'start') el.className = 'w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-lg z-10';
            if (m.type === 'end') el.className = 'w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg z-10';

            // Popup au survol
            const popup = new maplibregl.Popup({ offset: 15, closeButton: false, closeOnClick: false }).setText(m.label);

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat(m.lngLat)
                .setPopup(popup)
                .addTo(map);
            
            el.addEventListener('mouseenter', () => marker.togglePopup());
            el.addEventListener('mouseleave', () => marker.togglePopup());

            markerInstances.push(marker);
        });
    }
</script>

<div class="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl {className}">
	<div bind:this={mapContainer} class="w-full h-full" />
    <slot />
</div>