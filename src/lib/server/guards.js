import { ACTIONS, hasPermission } from '$lib/permissions';

/**
 * Permission de lecture requise par préfixe de route.
 * L'ordre compte : le premier préfixe qui correspond s'applique.
 * Toute route absente de cette liste est accessible à tout utilisateur connecté.
 */
const ROUTE_PERMISSIONS = [
	['/admin/lignes', ACTIONS.LIGNES_READ],
	['/admin', ACTIONS.ADMIN_ACCESS],
	['/audit', ACTIONS.AUDIT_READ],
	['/bus', ACTIONS.BUS_READ],
	['/carte-pn', ACTIONS.CARTE_PN_READ],
	['/clients-pmr', ACTIONS.PMR_READ],
	['/deplacements', ACTIONS.DEPLACEMENTS_READ],
	['/documents', ACTIONS.DOCUMENTS_READ],
	['/generateTaxi', ACTIONS.GENERATE_TAXI_READ],
	['/journal', ACTIONS.JOURNAL_READ],
	['/live', ACTIONS.LIVE_READ],
	['/operationnel', ACTIONS.OPERATIONNEL_READ],
	['/otto', ACTIONS.OTTO_READ],
	['/planning', ACTIONS.PLANNING_READ],
	['/pmr', ACTIONS.PMR_READ],
	['/repertoire', ACTIONS.REPERTOIRE_READ],
	['/stats', ACTIONS.STATS_READ],
	['/taxi', ACTIONS.TAXI_READ]
	// /b201, /ebp, /ptcar, /lignes : aucun contrôle historiquement (le rôle `user`
	// n'a pas `lignes:read`) — à revoir avec la refonte des rôles, pas de régression ici.
];

/** Routes accessibles sans session. */
const PUBLIC_PREFIXES = ['/login', '/maintenance', '/healthz', '/auth/'];

/** @param {string} path */
export function isPublicRoute(path) {
	return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));
}

/** @param {string} path @param {string} prefix */
function matches(path, prefix) {
	return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * @param {string} path
 * @returns {string | null} action requise, ou null
 */
export function requiredPermission(path) {
	const entry = ROUTE_PERMISSIONS.find(([prefix]) => matches(path, prefix));
	return entry ? entry[1] : null;
}

/**
 * @param {string} path
 * @param {{ role?: string, permissions?: Record<string, boolean> } | null} profile
 */
export function canAccessRoute(path, profile) {
	const action = requiredPermission(path);
	if (!action) return true;
	if (!profile) return false;
	// /admin/sante : historiquement ouvert aux sysop même sans admin:access
	if (matches(path, '/admin/sante') && profile.role === 'sysop') return true;
	return hasPermission(profile, action);
}

/** @param {{ role?: string } | null} profile */
export function isAdminLike(profile) {
	return profile?.role === 'admin' || profile?.role === 'sysop';
}
