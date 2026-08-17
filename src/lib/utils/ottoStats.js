// Fonctions pures d'agrégation pour le dashboard Statistiques (module Otto/C3)
// Toutes opèrent sur un tableau de commandes déjà chargées (OttoService.loadCommandes())
// et un objet de filtres, et retournent des structures prêtes à afficher / à passer à Chart.js.

import { normalizeDistrict, getDistrictStyle, DISTRICT_ORDER } from '$lib/utils/districtColors.js';

const C3_TYPE_LABELS = { 1: 'Évacuation', 2: 'Remplacement', 3: 'Modification Service planifié' };
const C3_TYPE_COLORS = { 1: '#f97316', 2: '#3b82f6', 3: '#a855f7' }; // orange / bleu / violet
const DISTRICT_HEX = { 'Sud-Ouest': '#38bdf8', 'Sud-Est': '#fbbf24', 'Centre': '#34d399' };

const MONTHS_FR = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTHS_FR_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

// --- FILTRAGE ---
export function filterCommandes(all, filters = {}) {
    const { dateFrom, dateTo, district, societe, redacteur, c3Type, status } = filters;
    return all.filter(cmd => {
        if (dateFrom && cmd.date_commande < dateFrom) return false;
        if (dateTo && cmd.date_commande > dateTo) return false;
        if (district && district !== 'all' && normalizeDistrict(cmd.creator?.district) !== district) return false;
        if (societe && societe !== 'all' && cmd.societes_bus?.nom !== societe) return false;
        if (redacteur && redacteur !== 'all' && cmd.creator?.full_name !== redacteur) return false;
        if (c3Type && c3Type !== 'all' && (cmd.c3_type ?? 2) !== Number(c3Type)) return false;
        if (status && status !== 'all' && cmd.status !== status) return false;
        return true;
    });
}

// --- KPIs GLOBAUX ---
export function computeKpis(filtered) {
    const total = filtered.length;
    const totalBus = filtered.reduce((sum, c) => sum + (c.bus_data?.length || 1), 0);
    const cloturees = filtered.filter(c => c.status === 'envoye').length;
    const tauxCloture = total > 0 ? Math.round((cloturees / total) * 100) : 0;
    const societes = new Set(filtered.map(c => c.societes_bus?.nom).filter(Boolean));
    const redacteurs = new Set(filtered.map(c => c.creator?.full_name).filter(Boolean));
    const avgBus = total > 0 ? (totalBus / total).toFixed(1) : '0';

    return {
        total,
        totalBus,
        cloturees,
        tauxCloture,
        nbSocietes: societes.size,
        nbRedacteurs: redacteurs.size,
        avgBusPerCommande: avgBus
    };
}

// --- TIMELINE (granularité adaptative) ---
function toISODate(d) { return d.toISOString().split('T')[0]; }

export function pickGranularity(dateFrom, dateTo) {
    if (!dateFrom || !dateTo) return 'month';
    const days = (new Date(dateTo) - new Date(dateFrom)) / 86400000;
    if (days <= 45) return 'day';
    if (days <= 220) return 'week';
    return 'month';
}

function bucketKey(dateStr, granularity) {
    const d = new Date(dateStr + 'T00:00:00');
    if (granularity === 'day') return dateStr;
    if (granularity === 'week') {
        // Lundi de la semaine ISO
        const day = (d.getDay() || 7);
        const monday = new Date(d);
        monday.setDate(d.getDate() - day + 1);
        return toISODate(monday);
    }
    // month
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function bucketLabel(key, granularity) {
    const d = new Date(key + 'T00:00:00');
    if (granularity === 'day') return d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' });
    if (granularity === 'week') return `Sem. ${d.toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit' })}`;
    return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Construit une timeline continue (buckets vides à 0 inclus) entre dateFrom et dateTo.
 * Si dateFrom/dateTo absents, déduit la plage depuis les données elles-mêmes.
 */
export function buildTimeline(filtered, dateFrom, dateTo) {
    if (filtered.length === 0 && (!dateFrom || !dateTo)) {
        return { labels: [], counts: [], granularity: 'day' };
    }

    const dates = filtered.map(c => c.date_commande).filter(Boolean).sort();
    const from = dateFrom || dates[0] || toISODate(new Date());
    const to = dateTo || dates[dates.length - 1] || toISODate(new Date());
    const granularity = pickGranularity(from, to);

    // Compte par bucket
    const counts = new Map();
    filtered.forEach(c => {
        if (!c.date_commande) return;
        const key = bucketKey(c.date_commande, granularity);
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    // Génère tous les buckets de la plage (continuité, y compris les 0)
    const buckets = [];
    let cursor = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    const step = granularity === 'day' ? 1 : granularity === 'week' ? 7 : null;

    if (granularity === 'month') {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        while (cursor <= end) {
            const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-01`;
            buckets.push(key);
            cursor.setMonth(cursor.getMonth() + 1);
        }
    } else {
        if (granularity === 'week') {
            const day = (cursor.getDay() || 7);
            cursor.setDate(cursor.getDate() - day + 1);
        }
        let guard = 0;
        while (cursor <= end && guard < 2000) {
            buckets.push(toISODate(cursor));
            cursor.setDate(cursor.getDate() + step);
            guard++;
        }
    }

    return {
        labels: buckets.map(k => bucketLabel(k, granularity)),
        counts: buckets.map(k => counts.get(k) || 0),
        keys: buckets,
        granularity
    };
}

// --- MEILLEUR MOIS / PIC ---
export function peakMonth(filtered) {
    const map = new Map();
    filtered.forEach(c => {
        if (!c.date_commande) return;
        const d = new Date(c.date_commande + 'T00:00:00');
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        map.set(key, (map.get(key) || 0) + 1);
    });
    let best = null;
    for (const [key, count] of map.entries()) {
        if (!best || count > best.count) best = { key, count };
    }
    if (!best) return null;
    const [y, m] = best.key.split('-');
    return { label: `${MONTHS_FR_FULL[Number(m) - 1]} ${y}`, count: best.count };
}

// --- RÉPARTITION PAR DISTRICT ---
export function byDistrict(filtered) {
    const map = new Map(DISTRICT_ORDER.map(d => [d, 0]));
    let unknown = 0;
    filtered.forEach(c => {
        const d = normalizeDistrict(c.creator?.district);
        if (d && map.has(d)) map.set(d, map.get(d) + 1);
        else unknown++;
    });
    const total = filtered.length || 1;
    const rows = DISTRICT_ORDER.map(d => ({
        key: d,
        label: getDistrictStyle(d).label,
        color: DISTRICT_HEX[d],
        count: map.get(d),
        percent: Math.round((map.get(d) / total) * 100)
    }));
    if (unknown > 0) {
        rows.push({ key: 'unknown', label: 'Inconnu', color: '#6b7280', count: unknown, percent: Math.round((unknown / total) * 100) });
    }
    return rows.filter(r => r.count > 0);
}

// --- RÉPARTITION PAR TYPE C3 ---
export function byC3Type(filtered) {
    const map = new Map([[1, 0], [2, 0], [3, 0]]);
    filtered.forEach(c => {
        const t = c.c3_type ?? 2;
        map.set(t, (map.get(t) || 0) + 1);
    });
    const total = filtered.length || 1;
    return [1, 2, 3].map(t => ({
        key: t,
        label: C3_TYPE_LABELS[t],
        color: C3_TYPE_COLORS[t],
        count: map.get(t),
        percent: Math.round((map.get(t) / total) * 100)
    })).filter(r => r.count > 0);
}

// --- STATUT (Brouillon / Clôturé) ---
export function byStatus(filtered) {
    const total = filtered.length || 1;
    const cloture = filtered.filter(c => c.status === 'envoye').length;
    const brouillon = total - cloture;
    return [
        { key: 'envoye', label: 'Clôturé', color: '#ef4444', count: cloture, percent: Math.round((cloture / total) * 100) },
        { key: 'brouillon', label: 'Brouillon', color: '#6b7280', count: brouillon, percent: Math.round((brouillon / total) * 100) }
    ].filter(r => r.count > 0);
}

// --- TOP N GÉNÉRIQUE ---
export function topSocietes(filtered, limit = 6) {
    const map = new Map();
    filtered.forEach(c => {
        const name = c.societes_bus?.nom;
        if (!name) return;
        map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

export function topRedacteurs(filtered, limit = 6) {
    const map = new Map();
    filtered.forEach(c => {
        const name = c.creator?.full_name;
        if (!name) return;
        if (!map.has(name)) map.set(name, { name, count: 0, district: c.creator?.district });
        map.get(name).count++;
    });
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function topRoutes(filtered, limit = 8) {
    const map = new Map();
    filtered.forEach(c => {
        if (!c.origine || !c.destination) return;
        const key = `${c.origine}|${c.destination}`;
        map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()]
        .map(([key, count]) => { const [origine, destination] = key.split('|'); return { origine, destination, count }; })
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

// --- LISTES DISTINCTES POUR LES FILTRES ---
export function distinctSocietes(all) {
    return [...new Set(all.map(c => c.societes_bus?.nom).filter(Boolean))].sort();
}
export function distinctRedacteurs(all) {
    return [...new Set(all.map(c => c.creator?.full_name).filter(Boolean))].sort();
}

export { C3_TYPE_LABELS, C3_TYPE_COLORS, DISTRICT_HEX, MONTHS_FR };
