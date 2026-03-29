const BASE_URL = 'https://api.irail.be';

let stationsCache = null;

function buildUrl(endpoint, params = {}) {
    const url = new URL(`${BASE_URL}/${endpoint}/`);
    const allParams = { format: 'json', lang: 'fr', ...params };
    Object.entries(allParams).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
}

export function formatDelay(seconds) {
    const s = parseInt(seconds || 0);
    if (s <= 0) return null;
    const min = Math.floor(s / 60);
    return `+${min} min`;
}

export function formatUnixTime(timestamp) {
    const d = new Date(parseInt(timestamp) * 1000);
    return d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dateStr) {
    // "2026-03-29" → "290326"
    const [y, m, d] = dateStr.split('-');
    return `${d}${m}${y.slice(2)}`;
}

export function formatTime(timeStr) {
    // "14:30" → "1430"
    return timeStr.replace(':', '');
}

export function formatVehicleId(input) {
    const clean = input.trim().toUpperCase().replace(/\s+/g, '');
    if (clean.startsWith('BE.NMBS.')) return clean;
    return `BE.NMBS.${clean}`;
}

export function getDelayClass(seconds) {
    const s = parseInt(seconds || 0);
    if (s <= 0) return 'text-emerald-400';
    if (s < 300) return 'text-yellow-400';
    if (s < 600) return 'text-orange-400';
    return 'text-red-400';
}

export function getDelayBadgeClass(seconds) {
    const s = parseInt(seconds || 0);
    if (s <= 0) return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
    if (s < 300) return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400';
    if (s < 600) return 'bg-orange-500/10 border-orange-500/20 text-orange-400';
    return 'bg-red-500/10 border-red-500/20 text-red-400';
}

export const iRailService = {
    async getStations() {
        if (stationsCache) return stationsCache;
        const res = await fetch(buildUrl('stations'));
        if (!res.ok) throw new Error('Erreur chargement gares');
        const data = await res.json();
        stationsCache = data.station || [];
        return stationsCache;
    },

    async getVehicle(vehicleId, date = null) {
        const params = { id: vehicleId };
        if (date) params.date = date;
        const res = await fetch(buildUrl('vehicle', params));
        if (!res.ok) throw new Error(`Train introuvable : ${vehicleId}`);
        const data = await res.json();
        if (data.error) throw new Error(data.message || `Train introuvable : ${vehicleId}`);
        return data;
    },

    async getComposition(vehicleId, date = null) {
        try {
            const params = { id: vehicleId };
            if (date) params.date = date;
            const res = await fetch(buildUrl('composition', params));
            if (!res.ok) return null;
            const data = await res.json();
            if (data.error) return null;
            return data;
        } catch {
            return null;
        }
    },

    async getLiveboard(station, { date = null, time = null, arrdep = 'departure' } = {}) {
        const params = { station, arrdep };
        if (date) params.date = date;
        if (time) params.time = time;
        const res = await fetch(buildUrl('liveboard', params));
        if (!res.ok) throw new Error(`Gare introuvable : "${station}"`);
        const data = await res.json();
        if (data.error) throw new Error(data.message || `Gare introuvable : "${station}"`);
        return data;
    }
};
