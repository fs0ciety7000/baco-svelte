#!/usr/bin/env node
// Contrôle d'équivalence rôles v2 → v3 (lot L1, docs/design/CADRAGE-ROLES-V3.md §3.4) : pour chaque compte d'une base
// PocketBase et chaque clé du catalogue, compare l'ANCIEN calcul (`can()` de web/src/lib/permissions.ts avant L1 et
// tests de rôle en dur pour les clés nouvelles) au champ `users.perms` écrit par le hook / la migration 1760004300.
// Zéro écart attendu (seul écart voulu : une action dont la lecture est retirée disparaît aussi, compté à part).
//
//   node scripts/perms-equivalence.mjs pb_data/data.db        (base en lecture seule ; copie locale, jamais la prod)
//
// N'affiche ni e-mail ni nom : identifiant et rôle seulement.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const db = process.argv[2];
if (!db) {
	console.error('Usage : node scripts/perms-equivalence.mjs <chemin de data.db>');
	process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const { CATALOG } = createRequire(import.meta.url)(path.join(here, '../pb_hooks/lib/catalog.js'));

const V2 = CATALOG.filter((e) => e.v2).map((e) => e.key);
const BY_KEY = Object.fromEntries(CATALOG.map((e) => [e.key, e]));
const LEGACY_READ = ['planning:read', 'bus:read', 'taxi:read', 'ops:read', 'lignes:read'];
const MODULE_KEYS = V2.filter((k) => !LEGACY_READ.includes(k));
// Rôles par défaut v2, tels qu'écrits dans permissions.ts avant le lot L0.
const V2_DEFAULTS = {
	moderator: [...MODULE_KEYS, ...LEGACY_READ],
	paco: [...MODULE_KEYS.filter((k) => !k.endsWith(':delete')), ...LEGACY_READ],
	guest: ['otto:read', 'generate_taxi:read']
};
const ACTIVE = (role) => !['screen', 'disabled', 'connector'].includes(role);
const ADMIN = (role) => role === 'admin' || role === 'sysop';

function canV2(u, p) {
	// Le connecteur n'a aucun droit de module en v3 (ses droits passent par `dicos:write`, hors catalogue).
	if (!ACTIVE(u.role)) return false;
	if (ADMIN(u.role)) return true;
	if (u.grants.includes(p)) return true;
	if (u.denies.includes(p)) return false;
	return (V2_DEFAULTS[u.role] ?? []).includes(p);
}

// Tests de rôle en dur que les clés nouvelles remplaceront au lot L2 (inventaire : CADRAGE-ROLES-V3, annexe).
const HARD = {
	'journal:moderate': (r) => ADMIN(r) || r === 'moderator', // COORD_ROLES, isJournalModerator
	'changelog:write': (r) => ADMIN(r) || r === 'moderator', // canEditChangelog, règles changelog
	'bus:reopen': (r) => ADMIN(r) || r === 'moderator' || r === 'paco', // lib/orders.js isCoordinator
	'taxi:reopen': (r) => ADMIN(r) || r === 'moderator' || r === 'paco',
	'pmr_equipment:manage': (r) => ADMIN(r) || r === 'moderator' || r === 'paco', // isCoordinator, pmr_equipment
	// Planificateur PMR (1760004900, 15 oct. 2026) : PACO/RCCA et au-dessus ; référentiels du planificateur : admin / sysop.
	'planner:read': (r) => ADMIN(r) || r === 'moderator' || r === 'paco',
	'planner:write': (r) => ADMIN(r) || r === 'moderator' || r === 'paco',
	'planner:manage': (r) => ADMIN(r),
	'suppliers:read': (r) => ACTIVE(r) && r !== 'guest', // navigation hideFor guest (onglet Fournisseurs)
	'pmr_zones:read': (r) => ACTIVE(r) && r !== 'guest',
	'spi:read': (r) => ACTIVE(r) && r !== 'guest',
	'changelog:read': (r) => ACTIVE(r) && r !== 'guest',
	'presence:read': (r) => ACTIVE(r) && r !== 'guest',
	'team:read': (r) => ACTIVE(r) && r !== 'guest',
	'quinyx:read': (r) => ACTIVE(r) && r !== 'guest',
	// Services Quinyx non pourvus (1760005000, 23 oct. 2026) : admin / sysop par défaut.
	'quinyx_open:read': (r) => ADMIN(r),
	'timetable:read': (r) => ACTIVE(r) && r !== 'guest',
	// Navigation v3 (1760004700) : référentiels du réseau modifiables par admin / sysop seulement (décision du 14 oct. 2026).
	'referentiels:manage': (r) => ADMIN(r)
};

function list(raw) {
	try {
		const v = JSON.parse(raw ?? 'null');
		return Array.isArray(v) ? v : null;
	} catch {
		return null;
	}
}

const sql = new DatabaseSync(db, { readOnly: true });
const rows = sql.prepare('SELECT id, role, grants, denies, perms FROM users ORDER BY role, id').all();
let gaps = 0;
let wanted = 0;
let nulls = 0;
const byRole = {};
const lines = [];
for (const r of rows) {
	const u = { id: r.id, role: r.role, grants: list(r.grants) ?? [], denies: list(r.denies) ?? [] };
	const perms = list(r.perms);
	byRole[u.role] = (byRole[u.role] ?? 0) + 1;
	if (!perms) {
		nulls++;
		lines.push(`KO ${u.id} (${u.role}) : perms absent ou non tableau`);
		continue;
	}
	for (const e of CATALOG) {
		const k = e.key;
		let old;
		if (e.v2) old = canV2(u, k);
		else if (HARD[k]) old = ACTIVE(u.role) && HARD[k](u.role);
		else {
			lines.push(`KO clé nouvelle sans test de rôle de référence : ${k}`);
			gaps++;
			continue;
		}
		// Droit accordé / retiré à la carte sur une clé nouvelle (impossible avant la v3, mais compté).
		if (!e.v2 && !ADMIN(u.role) && ACTIVE(u.role)) {
			if (u.grants.includes(k)) old = true;
			else if (u.denies.includes(k)) old = false;
		}
		const got = perms.includes(k);
		if (got === old) continue;
		const depRemoved = old && !got && BY_KEY[k].requires.some((q) => !(BY_KEY[q].v2 ? canV2(u, q) : perms.includes(q)));
		if (depRemoved) {
			wanted++;
			lines.push(`dépendance ${u.id} (${u.role}) : ${k} retirée (lecture retirée)`);
		} else {
			gaps++;
			lines.push(`KO ${u.id} (${u.role}) : ${k} ancien=${old} perms=${got}`);
		}
	}
	for (const k of perms) {
		if (!BY_KEY[k]) {
			gaps++;
			lines.push(`KO ${u.id} (${u.role}) : clé inconnue dans perms ${k}`);
		}
	}
}
console.log(lines.join('\n'));
console.log(
	`\n${rows.length} comptes (${Object.entries(byRole)
		.map(([k, v]) => `${k} ${v}`)
		.join(', ')}), ${CATALOG.length} clés (${V2.length} v2 + ${CATALOG.length - V2.length} nouvelles) : ` +
		`${gaps} écart(s), ${wanted} retrait(s) voulu(s) par dépendance, ${nulls} perms absent(s)`
);
process.exit(gaps || nulls ? 1 : 0);
