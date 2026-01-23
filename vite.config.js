import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate', // Mise à jour auto quand une nouvelle version est déployée
			manifest: {
				name: 'BACO - Gestion',
				short_name: 'BACO',
				description: 'Application de gestion opérationnelle',
				theme_color: '#0f1115', // Couleur du fond (Dark mode)
				background_color: '#0f1115',
				display: 'standalone', // Mode "App" sans barre d'URL
				orientation: 'portrait',
				scope: '/',
				start_url: '/',
				icons: [
					{
						src: 'pwa-192x192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png'
					},
                    {
						src: 'pwa-512x512.png',
						sizes: '512x512',
						type: 'image/png',
                        purpose: 'any maskable'
					}
				]
			},
			workbox: {
                // Fichiers à mettre en cache pour le hors-ligne
				globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}']
			},
            devOptions: {
                enabled: true // Pour tester en dev (optionnel)
            }
		})
	]
});