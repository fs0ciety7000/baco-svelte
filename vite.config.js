// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit(),
        SvelteKitPWA({
            registerType: 'autoUpdate', // Force la mise à jour dès que possible
            manifest: {
                name: 'BACO',
                short_name: 'BACO',
                start_url: '/',
                display: 'standalone',
                background_color: '#0f1115',
                theme_color: '#0f1115',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
                ]
            },
            workbox: {
                // 1. Augmente la limite pour éviter l'erreur de build du logo
                maximumFileSizeToCacheInBytes: 5000000,
                
                // 2. CRUCIAL : Interdit au SW de gérer l'API et l'Admin
                // Cela force le navigateur à passer par le réseau (Vercel) directement
                navigateFallbackDenylist: [/^\/api-proxy/, /^\/admin/],

                // 3. Cache uniquement les assets statiques
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                
                // 4. Force explicite : Tout ce qui est /api-proxy = RÉSEAU SEULEMENT
                runtimeCaching: [{
                    urlPattern: ({ url }) => url.pathname.startsWith('/api-proxy'),
                    handler: 'NetworkOnly'
                }]
            }
        })
    ]
});