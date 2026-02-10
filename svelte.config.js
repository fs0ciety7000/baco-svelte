import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// On vérifie si on est sur Coolify via une variable d'env personnalisée
const isCoolify = process.env.IS_COOLIFY === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// On choisit l'adaptateur selon l'environnement
		adapter: isCoolify ? adapterNode() : adapterAuto()
	}
};

export default config;