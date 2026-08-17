// Mapping couleur partagé pour les districts utilisateurs (Sud-Ouest / Sud-Est / Centre)
// et les districts de lignes (ligne_data.district : DSO / DSE / DCE) — même palette, même logique
// pour que "zone d'un user" et "district d'une ligne" restent visuellement cohérents dans l'app.

const DISTRICT_ALIASES = {
    'sud-ouest': 'Sud-Ouest', 'sudouest': 'Sud-Ouest', 'dso': 'Sud-Ouest',
    'sud-est': 'Sud-Est', 'sudest': 'Sud-Est', 'dse': 'Sud-Est',
    'centre': 'Centre', 'dce': 'Centre'
};

export const DISTRICT_ORDER = ['Sud-Ouest', 'Sud-Est', 'Centre'];

export function normalizeDistrict(raw) {
    if (!raw) return null;
    const key = String(raw).trim().toLowerCase().replace(/\s+/g, '-');
    return DISTRICT_ALIASES[key] || raw;
}

export const DISTRICT_STYLES = {
    'Sud-Ouest': {
        label: 'Sud-Ouest',
        border: 'border-sky-500/60',
        badge: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
        dot: 'bg-sky-400'
    },
    'Sud-Est': {
        label: 'Sud-Est',
        border: 'border-amber-500/60',
        badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        dot: 'bg-amber-400'
    },
    'Centre': {
        label: 'Centre',
        border: 'border-emerald-500/60',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        dot: 'bg-emerald-400'
    }
};

const FALLBACK_STYLE = {
    label: 'Inconnu',
    border: 'border-white/10',
    badge: 'bg-white/5 text-gray-400 border-white/10',
    dot: 'bg-gray-500'
};

export function getDistrictStyle(raw) {
    const norm = normalizeDistrict(raw);
    return DISTRICT_STYLES[norm] || FALLBACK_STYLE;
}

export function districtSortIndex(raw) {
    const norm = normalizeDistrict(raw);
    const idx = DISTRICT_ORDER.indexOf(norm);
    return idx === -1 ? DISTRICT_ORDER.length : idx;
}
