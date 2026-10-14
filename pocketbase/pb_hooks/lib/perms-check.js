// Commande `perms-check` (rôles v3, lots L2-L3, docs/design/CADRAGE-ROLES-V3.md §3.4) : pour chaque compte et chaque clé du
// catalogue, compare l'ANCIEN calcul (rôles v2 en dur : rôle + grants / denies, tests de rôle remplacés par les clés
// nouvelles) au champ `users.perms` stocké. LECTURE SEULE : rien n'est écrit. N'affiche que des nombres, des identifiants
// et des rôles (jamais d'e-mail ni de nom). Miroir de scripts/perms-equivalence.mjs (même référence v2).
//
// Seul écart voulu (compté à part) : une action dont la lecture est retirée disparaît aussi (dépendance du catalogue).
// Les comptes d'un rôle créé après la v2 (lot L4) n'ont pas d'ancien calcul : comptés à part, jamais en écart.

const cat = require(`${__hooks}/lib/catalog.js`);

const LEGACY_READ = ['planning:read', 'bus:read', 'taxi:read', 'ops:read', 'lignes:read'];
const V2_ROLES = ['admin', 'sysop', 'moderator', 'paco', 'guest', 'screen', 'disabled', 'connector'];

function parse(raw) {
	try {
		const v = JSON.parse(raw || 'null');
		return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
	} catch (_) {
		return null;
	}
}

function run(app) {
	const V2 = cat.CATALOG.filter((e) => e.v2).map((e) => e.key);
	const BY_KEY = {};
	for (const e of cat.CATALOG) BY_KEY[e.key] = e;
	const MODULE_KEYS = V2.filter((k) => LEGACY_READ.indexOf(k) === -1);
	// Rôles par défaut v2, tels qu'écrits dans web/src/lib/permissions.ts avant le lot L0.
	const V2_DEFAULTS = {
		moderator: MODULE_KEYS.concat(LEGACY_READ),
		paco: MODULE_KEYS.filter((k) => !/:delete$/.test(k)).concat(LEGACY_READ),
		guest: ['otto:read', 'generate_taxi:read']
	};
	const active = (r) => r !== 'screen' && r !== 'disabled' && r !== 'connector';
	const admin = (r) => r === 'admin' || r === 'sysop';
	const canV2 = (u, p) => {
		if (!active(u.role)) return false;
		if (admin(u.role)) return true;
		if (u.grants.indexOf(p) !== -1) return true;
		if (u.denies.indexOf(p) !== -1) return false;
		return (V2_DEFAULTS[u.role] || []).indexOf(p) !== -1;
	};
	// Tests de rôle en dur remplacés par les clés nouvelles (inventaire : annexe du cadrage).
	const coord = (r) => admin(r) || r === 'moderator' || r === 'paco';
	const HARD = {
		'journal:moderate': (r) => admin(r) || r === 'moderator',
		'changelog:write': (r) => admin(r) || r === 'moderator',
		'bus:reopen': coord,
		'taxi:reopen': coord,
		'pmr_equipment:manage': coord,
		'suppliers:read': (r) => r !== 'guest',
		'pmr_zones:read': (r) => r !== 'guest',
		'spi:read': (r) => r !== 'guest',
		'changelog:read': (r) => r !== 'guest',
		'presence:read': (r) => r !== 'guest',
		'team:read': (r) => r !== 'guest',
		'quinyx:read': (r) => r !== 'guest',
		'timetable:read': (r) => r !== 'guest'
	};

	const lines = [];
	const byRole = {};
	let gaps = 0;
	let wanted = 0;
	let nulls = 0;
	let custom = 0;
	const users = app.findAllRecords('users');
	for (const r of users) {
		const u = { id: r.id, role: r.getString('role'), grants: parse(r.getString('grants')) || [], denies: parse(r.getString('denies')) || [] };
		byRole[u.role] = (byRole[u.role] || 0) + 1;
		const perms = parse(r.getString('perms'));
		if (!perms) {
			nulls++;
			lines.push(`KO ${u.id} (${u.role}) : perms absent ou non tableau`);
			continue;
		}
		for (const k of perms) {
			if (!BY_KEY[k]) {
				gaps++;
				lines.push(`KO ${u.id} (${u.role}) : clé inconnue dans perms ${k}`);
			}
		}
		if (V2_ROLES.indexOf(u.role) === -1) {
			custom++;
			continue;
		}
		const old = (k) => {
			const e = BY_KEY[k];
			if (e.v2) return canV2(u, k);
			if (!HARD[k]) return null;
			let v = active(u.role) && HARD[k](u.role);
			// Accordé / retiré à la carte sur une clé nouvelle (impossible avant la v3, mais compté).
			if (active(u.role) && !admin(u.role)) {
				if (u.grants.indexOf(k) !== -1) v = true;
				else if (u.denies.indexOf(k) !== -1) v = false;
			}
			return v;
		};
		for (const e of cat.CATALOG) {
			const was = old(e.key);
			if (was === null) {
				gaps++;
				lines.push(`KO clé nouvelle sans référence v2 : ${e.key}`);
				continue;
			}
			const got = perms.indexOf(e.key) !== -1;
			if (got === was) continue;
			const depRemoved = was && !got && e.requires.some((q) => !old(q));
			if (depRemoved) {
				wanted++;
				lines.push(`dépendance ${u.id} (${u.role}) : ${e.key} retirée (prérequis retiré)`);
			} else {
				gaps++;
				lines.push(`KO ${u.id} (${u.role}) : ${e.key} ancien=${was} perms=${got}`);
			}
		}
	}
	const roles = Object.keys(byRole)
		.sort()
		.map((k) => `${k} ${byRole[k]}`)
		.join(', ');
	const summary =
		`${users.length} comptes (${roles}), ${cat.CATALOG.length} clés : ${gaps} écart(s), ${wanted} retrait(s) voulu(s) par ` +
		`dépendance, ${nulls} perms absent(s), ${custom} compte(s) d'un rôle créé après la v2 (non comparés)`;
	return { lines, summary, gaps, wanted, nulls, custom };
}

module.exports = { run };
