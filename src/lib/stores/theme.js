import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const themesConfig = {
    // --- CLASSIQUES ---
    default: {
        name: 'Deep Space',
        type: 'default',
        preview: 'linear-gradient(135deg, #3b82f6 0%, #93c5fd 100%)',
        colors: {
            '--color-primary': '59, 130, 246',   // Blue-500
            '--color-glow': '147, 197, 253',     // Blue-300
            '--bg-gradient-from': 'rgba(56, 189, 248, 0.15)',
            '--bg-gradient-to': 'rgba(236, 72, 153, 0.15)',
            '--glass-border': 'rgba(255, 255, 255, 0.1)',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)'
        }
    },
    
    ocean: {
        name: 'Lagon Bleu',
        type: 'ocean',
        preview: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
        colors: {
            '--color-primary': '6, 182, 212',
            '--color-glow': '103, 232, 249',
            '--bg-gradient-from': 'rgba(6, 182, 212, 0.15)',
            '--bg-gradient-to': 'rgba(59, 130, 246, 0.2)',
            '--glass-border': 'rgba(6, 182, 212, 0.3)',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)'
        }
    },

    sunset: {
        name: 'Sunset California',
        type: 'sunset',
        preview: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)',
        colors: {
            '--color-primary': '249, 115, 22',
            '--color-glow': '253, 186, 116',
            '--bg-gradient-from': 'rgba(249, 115, 22, 0.15)',
            '--bg-gradient-to': 'rgba(219, 39, 119, 0.2)',
            '--glass-border': 'rgba(253, 186, 116, 0.3)',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)'
        }
    },

    forest: {
        name: 'Forêt Boréale',
        type: 'forest',
        preview: 'linear-gradient(135deg, #10b981 0%, #064e3b 100%)',
        colors: {
            '--color-primary': '16, 185, 129',
            '--color-glow': '110, 231, 183',
            '--bg-gradient-from': 'rgba(16, 185, 129, 0.15)',
            '--bg-gradient-to': 'rgba(13, 148, 136, 0.2)',
            '--glass-border': 'rgba(110, 231, 183, 0.2)',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)'
        }
    },

    monochrome: {
        name: 'Onyx & Argent',
        type: 'monochrome',
        preview: 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)',
        colors: {
            '--color-primary': '226, 232, 240',
            '--color-glow': '148, 163, 184',
            '--bg-gradient-from': 'rgba(148, 163, 184, 0.1)',
            '--bg-gradient-to': 'rgba(71, 85, 105, 0.2)',
            '--glass-border': 'rgba(255, 255, 255, 0.15)',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)'
        }
    },

    // --- SPÉCIAUX ---

    cyberpunk: {
        name: 'Cyberpunk Yellow',
        type: 'cyberpunk',
        preview: 'linear-gradient(135deg, #eab308 0%, #10b981 100%)',
        colors: {
            '--color-primary': '234, 179, 8',
            '--color-glow': '253, 224, 71',
            '--bg-gradient-from': 'rgba(234, 179, 8, 0.15)',
            '--bg-gradient-to': 'rgba(16, 185, 129, 0.15)',
            '--glass-border': 'rgba(234, 179, 8, 0.3)',
            '--glass-bg': 'rgba(0, 0, 0, 0.75)'
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
            '--glass-border': 'rgba(168, 85, 247, 0.3)',
            '--glass-bg': 'rgba(0, 0, 0, 0.75)'
        }
    },

    retrowave: {
        name: 'Retro Wave',
        type: 'retrowave',
        preview: 'linear-gradient(135deg, #240b36 0%, #c31432 100%)',
        colors: {
            '--color-primary': '255, 0, 255',
            '--color-glow': '0, 255, 255',
            '--bg-gradient-from': 'rgba(36, 11, 54, 0.9)', 
            '--bg-gradient-to': 'rgba(195, 20, 50, 0.8)',
            '--glass-border': 'rgba(255, 0, 255, 0.5)',
            '--glass-bg': 'rgba(20, 5, 30, 0.7)'
        }
    },

    hacker: {
        name: 'Terminal 1337',
        type: 'hacker',
        preview: 'linear-gradient(135deg, #000000 0%, #0f0 100%)',
        colors: {
            '--color-primary': '0, 255, 0',
            '--color-glow': '150, 255, 150',
            '--bg-gradient-from': 'rgba(0, 0, 0, 0.95)',
            '--bg-gradient-to': 'rgba(0, 50, 0, 0.9)',
            '--glass-border': 'rgba(0, 255, 0, 0.4)',
            '--glass-bg': 'rgba(0, 10, 0, 0.85)'
        }
    },

    aurora: {
        name: 'Aurora Borealis',
        type: 'aurora',
        preview: 'linear-gradient(135deg, #1c1c1c 0%, #0f766e 100%)',
        colors: {
            '--color-primary': '45, 212, 191',
            '--color-glow': '167, 139, 250',
            '--bg-gradient-from': 'rgba(15, 23, 42, 0.8)',
            '--bg-gradient-to': 'rgba(13, 148, 136, 0.3)',
            '--glass-border': 'rgba(255, 255, 255, 0.15)',
            '--glass-bg': 'rgba(15, 23, 42, 0.4)'
        }
    },

    magma: {
        name: 'Magma Flux',
        type: 'magma',
        preview: 'linear-gradient(135deg, #450a0a 0%, #7f1d1d 100%)',
        colors: {
            '--color-primary': '251, 146, 60',
            '--color-glow': '239, 68, 68',
            '--bg-gradient-from': 'rgba(69, 10, 10, 0.9)',
            '--bg-gradient-to': 'rgba(20, 10, 10, 0.95)',
            '--glass-border': 'rgba(251, 146, 60, 0.3)',
            '--glass-bg': 'rgba(50, 10, 10, 0.4)'
        }
    },

    quantum: {
        name: 'Quantum Dots',
        type: 'quantum',
        preview: 'linear-gradient(135deg, #020617 0%, #3b82f6 100%)',
        colors: {
            '--color-primary': '56, 189, 248',
            '--color-glow': '99, 102, 241',
            '--bg-gradient-from': 'rgba(2, 6, 23, 0.95)',
            '--bg-gradient-to': 'rgba(15, 23, 42, 0.95)',
            '--glass-border': 'rgba(56, 189, 248, 0.2)',
            '--glass-bg': 'rgba(15, 23, 42, 0.6)'
        }
    },

    // --- SAISONNIER (AVEC COLORS MAINTENANT DÉFINIES) ---

    christmas: {
        name: 'Esprit de Noël',
        type: 'christmas',
        preview: 'linear-gradient(135deg, #166534 0%, #b91c1c 100%)',
        colors: {
            '--color-primary': '239, 68, 68',    // Rouge Vif
            '--color-glow': '252, 165, 165',     // Rouge Clair
            '--bg-gradient-from': 'rgba(22, 101, 52, 0.3)',  // Vert sapin
            '--bg-gradient-to': 'rgba(185, 28, 28, 0.2)',    // Rouge
            '--glass-border': 'rgba(255, 255, 255, 0.2)',
            '--glass-bg': 'rgba(255, 255, 255, 0.05)'
        }
    },

    halloween: {
        name: 'Halloween',
        type: 'halloween',
        preview: 'linear-gradient(135deg, #3E2723 0%, #ff6b6b 100%)',
        colors: {
            '--color-primary': '255, 107, 107',  // Orange/Rouge
            '--color-glow': '255, 165, 0',       // Orange
            '--bg-gradient-from': 'rgba(62, 39, 35, 0.8)',   // Marron foncé
            '--bg-gradient-to': 'rgba(74, 20, 140, 0.4)',    // Violet sombre
            '--glass-border': 'rgba(255, 107, 107, 0.3)',
            '--glass-bg': 'rgba(30, 10, 10, 0.7)'
        }
    },

    easter: {
        name: 'Joyeuses Pâques',
        type: 'easter',
        preview: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        colors: {
            '--color-primary': '244, 114, 182',  // Rose bonbon
            '--color-glow': '167, 243, 208',     // Vert menthe
            '--bg-gradient-from': 'rgba(168, 237, 234, 0.2)', // Pastel Cyan
            '--bg-gradient-to': 'rgba(254, 214, 227, 0.2)',   // Pastel Rose
            '--glass-border': 'rgba(255, 255, 255, 0.4)',
            '--glass-bg': 'rgba(255, 255, 255, 0.1)'
        }
    },
    
    summer: {
        name: 'Été Radiant',
        type: 'summer',
        preview: 'linear-gradient(135deg, #2980b9 0%, #6dd5fa 100%)',
        colors: {
            '--color-primary': '253, 224, 71',   // Jaune soleil
            '--color-glow': '56, 189, 248',      // Ciel bleu
            '--bg-gradient-from': 'rgba(41, 128, 185, 0.3)',
            '--bg-gradient-to': 'rgba(255, 255, 255, 0.1)',
            '--glass-border': 'rgba(255, 255, 255, 0.3)',
            '--glass-bg': 'rgba(255, 255, 255, 0.1)'
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

    // 2. Gestion des classes
    Object.values(themesConfig).forEach(t => root.classList.remove(`theme-${t.type}`));
    root.classList.add(`theme-${theme.type}`);

    localStorage.setItem('theme_id', themeId);
};

if (browser) {
    currentThemeId.subscribe(applyTheme);
}