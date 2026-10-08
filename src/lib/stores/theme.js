import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Thèmes CSM. Les jetons de couleur sont dans src/app.css (`:root[data-theme=…]`).
 * Le script inline de src/app.html applique le thème avant le premier rendu (pas de flash).
 */
export const THEMES = [
	{
		id: 'nocturne',
		name: 'Nocturne',
		description: 'Sombre, sobre — par défaut',
		scheme: 'dark',
		swatch: ['#0b0e14', '#1a1f2b', '#7c9cff']
	},
	{
		id: 'ivoire',
		name: 'Ivoire',
		description: 'Clair, papier chaud',
		scheme: 'light',
		swatch: ['#f7f5f0', '#ffffff', '#1f5fd1']
	},
	{
		id: 'rail',
		name: 'Rail',
		description: 'Marine et jaune signal',
		scheme: 'dark',
		swatch: ['#0a1a33', '#153056', '#ffc72c']
	},
	{
		id: 'contraste',
		name: 'Contraste élevé',
		description: 'Lisibilité maximale',
		scheme: 'dark',
		swatch: ['#000000', '#141414', '#ffe500']
	},
	{
		id: 'tactique',
		name: 'Tactique',
		description: 'Console d’opérations, accents cyan',
		scheme: 'dark',
		swatch: ['#05070f', '#10162b', '#4be8ff']
	}
];

/** Valeur spéciale : suit la préférence clair/sombre du système. */
export const AUTO_THEME = 'auto';

const STORAGE_KEY = 'csm-theme';
const DENSITY_KEY = 'csm-density';
const THEME_IDS = new Set(THEMES.map((t) => t.id));

/** @param {string | null | undefined} id */
export function normalizeThemeId(id) {
	if (id === AUTO_THEME) return AUTO_THEME;
	return id && THEME_IDS.has(id) ? id : AUTO_THEME; // anciens thèmes BACO -> auto
}

/** Vrai pour un identifiant de thème CSM (les anciens thèmes BACO sont ignorés). @param {unknown} id */
export function isKnownTheme(id) {
	return id === AUTO_THEME || (typeof id === 'string' && THEME_IDS.has(id));
}

/** @param {string} id */
function resolve(id) {
	if (id !== AUTO_THEME) return id;
	return browser && window.matchMedia('(prefers-color-scheme: light)').matches
		? 'ivoire'
		: 'nocturne';
}

function readStorage(key) {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* navigation privée */
	}
}

export const currentThemeId = writable(
	browser ? normalizeThemeId(readStorage(STORAGE_KEY)) : AUTO_THEME
);
export const density = writable(
	browser ? (readStorage(DENSITY_KEY) ?? 'comfortable') : 'comfortable'
);

/** @param {string} themeId */
export function applyTheme(themeId) {
	const id = normalizeThemeId(themeId);
	currentThemeId.set(id);
	if (!browser) return;
	writeStorage(STORAGE_KEY, id);
	const resolved = resolve(id);
	const theme = THEMES.find((t) => t.id === resolved) ?? THEMES[0];
	const root = document.documentElement;
	const swap = () => {
		root.dataset.theme = theme.id;
		root.dataset.scheme = theme.scheme;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.swatch[0]);
	};
	// Fondu enchaîné si le navigateur le permet
	if (
		document.startViewTransition &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		document.startViewTransition(swap);
	} else {
		swap();
	}
}

/** @param {'comfortable' | 'compact'} value */
export function applyDensity(value) {
	density.set(value);
	if (!browser) return;
	writeStorage(DENSITY_KEY, value);
	document.documentElement.dataset.density = value;
}

if (browser) {
	// Suit le système en mode auto
	window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
		if (normalizeThemeId(readStorage(STORAGE_KEY)) === AUTO_THEME) applyTheme(AUTO_THEME);
	});
}

// --- Compatibilité avec l'ancien code (accueil, profil) ---
export const themesConfig = Object.fromEntries(
	[
		{ id: AUTO_THEME, name: 'Automatique', swatch: ['#0b0e14', '#f7f5f0', '#7c9cff'] },
		...THEMES
	].map((t) => [
		t.id,
		{
			name: t.name,
			type: t.id,
			preview: `linear-gradient(135deg, ${t.swatch[0]} 0%, ${t.swatch[1]} 55%, ${t.swatch[2]} 100%)`
		}
	])
);
