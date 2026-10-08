import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Image Docker autonome (Coolify). Variables lues au démarrage via $env/dynamic/*.
		adapter: adapter({ precompress: true }),

		// Content-Security-Policy : nonces générés par SvelteKit pour ses scripts inline.
		// Les scripts externes sont interdits ; les connexions sortantes HTTPS restent
		// permises (iRail, météo, tuiles de carte…) en attendant leur passage côté serveur.
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:', 'https:'],
				'font-src': ['self', 'data:'],
				'connect-src': ['self', 'https:'],
				'worker-src': ['self', 'blob:'],
				'child-src': ['self', 'blob:'],
				'frame-src': ['self', 'https://www.google.com', 'https://maps.google.com'],
				'frame-ancestors': ['none'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
