// Système de badges — rôles spéciaux + paliers d'activité (Otto + Taxi combinés)
// Utilisé sur /profil et /classement.

// --- BADGES DE RÔLE ---
// Un rôle -> au plus un badge visuel. Pas de logique dépendant d'un id utilisateur en dur :
// on attribue le rôle en base (profiles.role) et le badge suit automatiquement.
const ROLE_BADGES = {
    sysop: {
        id: 'sysop',
        label: 'Développeur',
        icon: 'Code2',
        badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        glow: 'shadow-[0_0_15px_rgba(6,182,212,0.35)]'
    },
    admin: {
        id: 'admin',
        label: 'Administrateur',
        icon: 'ShieldCheck',
        badgeClass: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
        glow: 'shadow-[0_0_15px_rgba(234,179,8,0.35)]'
    },
    moderator: {
        id: 'moderator',
        label: 'Modérateur',
        icon: 'Shield',
        badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
        glow: 'shadow-[0_0_15px_rgba(168,85,247,0.3)]'
    },
    otto_agent: {
        id: 'otto_agent',
        label: 'Agent Otto',
        icon: 'Bus',
        badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
        glow: ''
    }
};

// --- PALIERS D'ACTIVITÉ (Otto + Taxi confondus) ---
// Trié du plus haut au plus bas — on retient le premier atteint.
const ACTIVITY_TIERS = [
    { id: 'legende',  min: 250, label: 'Légende',   icon: 'Crown',   badgeClass: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30', glow: 'shadow-[0_0_15px_rgba(217,70,239,0.35)]' },
    { id: 'veteran',  min: 100, label: 'Vétéran',   icon: 'Trophy',  badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',        glow: 'shadow-[0_0_15px_rgba(245,158,11,0.3)]' },
    { id: 'expert',   min: 50,  label: 'Expert',    icon: 'Medal',   badgeClass: 'bg-slate-300/15 text-slate-200 border-slate-300/30',        glow: '' },
    { id: 'actif',    min: 10,  label: 'Actif',     icon: 'Flame',   badgeClass: 'bg-orange-600/15 text-orange-400 border-orange-600/30',     glow: '' }
];

/**
 * Construit la liste des badges à afficher pour un profil donné.
 * @param {{role: string}} profile
 * @param {{ottoCount: number, taxiCount: number, total: number}} stats
 */
export function computeBadges(profile, stats) {
    const badges = [];

    const roleBadge = ROLE_BADGES[profile?.role];
    if (roleBadge) badges.push(roleBadge);

    const tier = ACTIVITY_TIERS.find(t => (stats?.total || 0) >= t.min);
    if (tier) badges.push(tier);

    if ((stats?.ottoCount || 0) > 0) {
        badges.push({ id: 'otto_contrib', label: 'Contributeur Bus', icon: 'Bus', badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30', glow: '' });
    }
    if ((stats?.taxiCount || 0) > 0) {
        badges.push({ id: 'taxi_contrib', label: 'Contributeur Taxi', icon: 'Car', badgeClass: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20', glow: '' });
    }

    return badges;
}
