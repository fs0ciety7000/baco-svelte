<script>
	import { onMount, onDestroy } from 'svelte';
	import maplibregl from 'maplibre-gl';
	import 'maplibre-gl/dist/maplibre-gl.css';

	let mapContainer;
	let map = $state(null);
    
    // Props pour le trajet (départ/arrivée)
	let { route = null, className = '' } = $props();

	onMount(() => {
		map = new maplibregl.Map({
			container: mapContainer,
			style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', // Style sombre compatible avec votre thème "Deep Space"
			center: [4.3517, 50.8503], // Bruxelles par défaut
			zoom: 11,
			attributionControl: false
		});

		map.addControl(new maplibregl.NavigationControl(), 'bottom-right');

        // Au chargement, si on a une route, on la dessine
		map.on('load', () => {
			if (route) drawRoute(route);
		});
	});

	onDestroy(() => {
		map?.remove();
	});

    // Effet réactif pour mettre à jour la route si elle change
    $effect(() => {
        if (map && map.loaded() && route) {
            drawRoute(route);
        }
    });

	function drawRoute(routeData) {
        if (!map.getSource('route')) {
             map.addSource('route', {
                'type': 'geojson',
                'data': routeData
            });
            
            map.addLayer({
                'id': 'route',
                'type': 'line',
                'source': 'route',
                'layout': {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                'paint': {
                    'line-color': '#3b82f6', // Blue-500 (votre couleur primaire)
                    'line-width': 4,
                    'line-opacity': 0.8
                }
            });
        } else {
             map.getSource('route').setData(routeData);
        }

        // Ajuster la vue pour voir tout le trajet
        const coordinates = routeData.geometry.coordinates;
        const bounds = coordinates.reduce((bounds, coord) => {
            return bounds.extend(coord);
        }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));

        map.fitBounds(bounds, { padding: 50 });
	}
</script>

<div class="relative w-full h-full rounded-xl overflow-hidden border border-white/10 shadow-2xl {className}">
	<div bind:this={mapContainer} class="w-full h-full" />
    
    <div class="absolute top-4 left-4 z-10">
        <slot />
    </div>
</div>

<style>
    /* Customisation pour s'intégrer à shadcn/tailwind */
    :global(.maplibregl-ctrl-group) {
        background-color: #0f1115 !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
    }
    :global(.maplibregl-ctrl-icon) {
        filter: invert(1); /* Icônes blanches pour le thème sombre */
    }
</style>