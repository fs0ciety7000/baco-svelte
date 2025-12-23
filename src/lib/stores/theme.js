import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const themesConfig = {
    default: {
        name: 'Deep Space',
        type: 'default',
        // On ajoute un aperçu pour l'UI (gradient CSS)
        preview: 'linear-gradient(135deg, #3b82f6 0%, #93c5fd 100%)',
        colors: {
            '--color-primary': '59, 130, 246',
            '--color-glow': '147, 197, 253',
            '--bg-gradient-from': 'rgba(56, 189, 248, 0.15)',
            '--bg-gradient-to': 'rgba(236, 72, 153, 0.15)',
            '--glass-border': 'rgba(255, 255, 255, 0.1)'
        }
    },
    cyberpunk: {
        name: 'Cyberpunk',
        type: 'cyberpunk',
        preview: 'linear-gradient(135deg, #eab308 0%, #10b981 100%)',
        colors: {
            '--color-primary': '234, 179, 8',
            '--color-glow': '253, 224, 71',
            '--bg-gradient-from': 'rgba(234, 179, 8, 0.15)',
            '--bg-gradient-to': 'rgba(16, 185, 129, 0.15)',
            '--glass-border': 'rgba(234, 179, 8, 0.3)'
        }
    },
    neon: {
        name: 'Neon Purple',
        type: 'neon',
        preview: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        colors: {
            '--color-primary': '168, 85, 247',
            '--color-glow': '216, 180, 254',
            '--bg-gradient-from': 'rgba(168, 85, 247, 0.2)',
            '--bg-gradient-to': 'rgba(236, 72, 153, 0.2)',
            '--glass-border': 'rgba(168, 85, 247, 0.3)'
        }
    },
    christmas: {
        name: 'Noël',
        type: 'christmas',
        preview: 'linear-gradient(135deg, #166534 0%, #b91c1c 100%)',
        colors: {
            '--color-primary': '239, 68, 68',
            '--color-glow': '252, 165, 165',
            '--bg-gradient-from': 'rgba(22, 101, 52, 0.3)',
            '--bg-gradient-to': 'rgba(185, 28, 28, 0.2)',
            '--glass-border': 'rgba(255, 255, 255, 0.2)'
        }
    }
};

const storedThemeId = browser ? localStorage.getItem('theme_id') : 'default';
export const currentThemeId = writable(storedThemeId || 'default');

export const applyTheme = (themeId) => {
    if (!browser) return;
    
    const theme = themesConfig[themeId] || themesConfig['default'];
    const root = document.documentElement;

    // 1. Appliquer les variables CSS
    Object.entries(theme.colors).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });

    // 2. Gestion des classes pour les effets spécifiques (ex: .theme-christmas)
    // On nettoie les anciennes classes de thème
    Object.values(themesConfig).forEach(t => root.classList.remove(`theme-${t.type}`));
    // On ajoute la nouvelle
    root.classList.add(`theme-${theme.type}`);

    localStorage.setItem('theme_id', themeId);
};

if (browser) {
    currentThemeId.subscribe(applyTheme);
}