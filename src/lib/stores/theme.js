import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// Définition des thèmes
export const themesConfig = {
    default: {
        name: 'Deep Space (Défaut)',
        type: 'default',
        colors: {
            '--color-primary': '59, 130, 246',   // Blue-500
            '--color-glow': '147, 197, 253',     // Blue-300
            '--bg-gradient-from': 'rgba(56, 189, 248, 0.15)',
            '--bg-gradient-to': 'rgba(236, 72, 153, 0.15)',
            '--glass-border': 'rgba(255, 255, 255, 0.1)'
        }
    },
    cyberpunk: {
        name: 'Cyberpunk Yellow',
        type: 'cyberpunk',
        colors: {
            '--color-primary': '234, 179, 8',    // Yellow-500
            '--color-glow': '253, 224, 71',      // Yellow-300
            '--bg-gradient-from': 'rgba(234, 179, 8, 0.15)', // Jaune
            '--bg-gradient-to': 'rgba(16, 185, 129, 0.15)',  // Vert
            '--glass-border': 'rgba(234, 179, 8, 0.3)'
        }
    },
    neon: {
        name: 'Neon Purple',
        type: 'neon',
        colors: {
            '--color-primary': '168, 85, 247',   // Purple-500
            '--color-glow': '216, 180, 254',     // Purple-300
            '--bg-gradient-from': 'rgba(168, 85, 247, 0.2)',
            '--bg-gradient-to': 'rgba(236, 72, 153, 0.2)',
            '--glass-border': 'rgba(168, 85, 247, 0.3)'
        }
    },
    christmas: {
        name: 'Esprit de Noël',
        type: 'christmas',
        colors: {
            '--color-primary': '239, 68, 68',    // Red-500
            '--color-glow': '252, 165, 165',     // Red-300
            '--bg-gradient-from': 'rgba(22, 101, 52, 0.3)',  // Vert sapin
            '--bg-gradient-to': 'rgba(185, 28, 28, 0.2)',    // Rouge
            '--glass-border': 'rgba(255, 255, 255, 0.2)'
        }
    }
};

// Store qui contient l'ID du thème actuel (ex: 'default')
const storedThemeId = browser ? localStorage.getItem('theme_id') : 'default';
export const currentThemeId = writable(storedThemeId || 'default');

// Fonction pour appliquer les variables CSS au document
export const applyTheme = (themeId) => {
    if (!browser) return;
    
    const theme = themesConfig[themeId] || themesConfig['default'];
    const root = document.documentElement;

    // Appliquer chaque variable CSS
    Object.entries(theme.colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });

    // Sauvegarder en local pour persistance rapide
    localStorage.setItem('theme_id', themeId);
    
    // Gérer la classe dark si nécessaire (indépendant ou lié)
    if (localStorage.getItem('theme') === 'dark') {
        root.classList.add('dark');
    }
};

// S'abonner aux changements pour appliquer le thème automatiquement
if (browser) {
    currentThemeId.subscribe((value) => {
        applyTheme(value);
    });
}