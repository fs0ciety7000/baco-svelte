import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			manifest: {
				name: 'CSM — Client Solutions Management Tool',
				short_name: 'CSM',
				description: 'Outil de gestion Client Solutions',
				lang: 'fr',
				theme_color: '#0B0E14',
				background_color: '#0B0E14',
				display: 'standalone',
				scope: '/',
				start_url: '/accueil',
				icons: [
					{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
					{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
					{ src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
				]
			},
			workbox: {
				// Uniquement le shell applicatif : jamais de données authentifiées en cache.
				globPatterns: ['client/**/*.{js,css,woff2}', 'client/*.{ico,png}'],
				navigateFallback: null,
				maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
			},
			devOptions: { enabled: false }
		})
	]
});
