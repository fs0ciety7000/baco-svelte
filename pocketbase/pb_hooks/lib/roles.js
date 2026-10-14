// Rôles v3, lot L3 (docs/design/CADRAGE-ROLES-V3.md §2.4 et §3.3) : garde-fous de la collection `roles` et des rôles des
// comptes, chargés par require() depuis roles.pb.js et users.pb.js (les fonctions en tête d'un *.pb.js ne sont pas
// visibles dans un gestionnaire). Les garde-fous sont dans les hooks, pas seulement dans Next.

const cat = require(`${__hooks}/lib/catalog.js`);
const perms = require(`${__hooks}/lib/perms.js`);

const KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

function isAdminAuth(auth) {
	if (!auth) return false;
	if (auth.isSuperuser()) return true;
	const role = auth.getString('role');
	return role === 'admin' || role === 'sysop';
}

// Gestion des rôles : admin / sysop (et superuser) seulement.
function requireRoleManager(auth) {
	if (!isAdminAuth(auth)) throw new ForbiddenError('Seuls les administrateurs gèrent les rôles.');
}

// Clés inconnues refusées (le catalogue est fermé : seul le code ajoute une permission).
function unknownKeys(list) {
	const known = {};
	for (const e of cat.CATALOG) known[e.key] = true;
	return list.filter((k) => !known[k]);
}

// Permissions d'un rôle normalisées : clés du catalogue seulement, dépendances (`requires`) ajoutées, ordre du catalogue.
// admin / sysop : tout ; écran / connecteur / désactivé : rien (calcul en dur de lib/perms.js).
function normalizePerms(key, list) {
	const keys = cat.CATALOG.map((e) => e.key);
	if (cat.FULL_ROLES.indexOf(key) !== -1) return keys;
	if (cat.NO_MODULE_ROLES.indexOf(key) !== -1) return [];
	const set = {};
	for (const k of list) set[k] = true;
	const byKey = {};
	for (const e of cat.CATALOG) byKey[e.key] = e;
	let changed = true;
	while (changed) {
		changed = false;
		for (const k of Object.keys(set)) {
			const e = byKey[k];
			if (!e) {
				delete set[k];
				continue;
			}
			for (const r of e.requires) {
				if (!set[r]) {
					set[r] = true;
					changed = true;
				}
			}
		}
	}
	return keys.filter((k) => set[k]);
}

// Agents portant ce rôle (ou qui le retrouveront à la réactivation).
function usersOfRole(app, key) {
	const active = app.countRecords('users', $dbx.hashExp({ role: key }));
	const parked = app.countRecords('users', $dbx.exp("role = 'disabled' AND disabled_role = {:k}", { k: key }));
	return { active: active, parked: parked, total: active + parked };
}

// Recalcule `perms` des agents d'un rôle par `app.save()` (pas en SQL : les souscriptions temps réel ouvertes relisent
// ainsi la fiche) ; seulement ceux dont le calcul change. `app` = la transaction de l'écriture du rôle.
function recomputeRole(app, key) {
	let n = 0;
	for (const u of app.findRecordsByFilter('users', 'role = {:k}', '', 0, 0, { k: key })) {
		const next = JSON.stringify(perms.permsOf(u, app));
		const cur = JSON.stringify(perms.parseList(u.getString('perms')));
		if (next === cur) continue;
		app.save(u);
		n++;
	}
	return n;
}

// Rôle d'un compte : doit exister dans `roles` (si la collection existe et n'est pas vide : migrations antérieures).
function assertRoleExists(app, key, field) {
	if (!key) return;
	let total = 0;
	try {
		total = app.countRecords('roles');
	} catch (_) {
		return;
	}
	if (!total) return;
	try {
		app.findFirstRecordByData('roles', 'key', key);
	} catch (_) {
		throw new BadRequestError(`${field === 'disabled_role' ? 'Rôle à la réactivation' : 'Rôle'} inconnu : ${key}.`);
	}
}

function countActiveAdmins(app, exceptId) {
	return app.countRecords('users', $dbx.exp("role = 'admin' AND id != {:id}", { id: exceptId || '' }));
}

// Au moins un administrateur actif (rôle `admin`) : refuse de désactiver, rétrograder ou supprimer le dernier.
function assertNotLastAdmin(app, record, nextRole) {
	if (record.getString('role') !== 'admin') return;
	if (nextRole === 'admin') return;
	if (countActiveAdmins(app, record.id) === 0) {
		throw new BadRequestError("Dernier administrateur actif : nomme d'abord un autre administrateur.");
	}
}

// Affecter `admin` / `sysop` : réservé à un administrateur (rôle `admin`) ou à un superuser.
function assertCanAssign(auth, nextRole, prevRole) {
	if (nextRole !== 'admin' && nextRole !== 'sysop') return;
	if (nextRole === prevRole) return;
	if (auth && (auth.isSuperuser() || auth.getString('role') === 'admin')) return;
	throw new ForbiddenError('Seul un administrateur peut attribuer le rôle Administrateur ou Sysop.');
}

// Compte Administrateur / Sysop (ou désactivé avec ce rôle à rendre) : modifié ou supprimé par un administrateur seulement
// (un sysop ne peut ni le rétrograder, ni changer son mot de passe ou son e-mail ; audit sécurité du 14 oct. 2026). Chacun
// garde la main sur sa propre fiche (champs limités par la règle).
function assertCanManage(auth, before) {
	const high = (r) => r === 'admin' || r === 'sysop';
	if (!high(before.getString('role')) && !high(before.getString('disabled_role'))) return;
	if (!auth || auth.isSuperuser() || auth.getString('role') === 'admin' || auth.id === before.id) return;
	throw new ForbiddenError('Seul un administrateur modifie un compte Administrateur ou Sysop.');
}

// Rôles techniques (compte de service, écran) et droit de l'ingestion DICOS : posés par un administrateur (rôles) ou par le
// superuser seul (`dicos:write`), jamais par un sysop ni un gestionnaire.
function assertSpecial(auth, record, before) {
	if (!auth || auth.isSuperuser()) return;
	const technical = (r) => r === 'connector' || r === 'screen';
	const role = record.getString('role');
	const prev = before ? before.getString('role') : '';
	if (technical(role) && role !== prev && auth.getString('role') !== 'admin')
		throw new ForbiddenError('Rôle technique attribué par un administrateur seulement.');
	const has = (r) => r && r.getString('grants').indexOf('"dicos:write"') !== -1;
	if (has(record) && !has(before)) throw new ForbiddenError('Droit réservé au compte de service.');
}

// Catalogue modifié par un déploiement : chaque clé nouvelle est ajoutée aux rôles système qui la portent par défaut
// (rôles verrouillés « tout » re-normalisés), jamais retirée ; registre `app_settings.roles_catalog`. Appelé au démarrage
// de `serve`. Renvoie le nombre de clés nouvelles.
function syncCatalog(app) {
	const keys = cat.CATALOG.map((e) => e.key);
	let reg;
	try {
		reg = app.findFirstRecordByData('app_settings', 'key', 'roles_catalog');
	} catch (_) {
		return 0;
	}
	let known = [];
	try {
		const v = JSON.parse(reg.getString('value') || '{}');
		known = Array.isArray(v.keys) ? v.keys : [];
	} catch (_) {
		known = [];
	}
	const fresh = cat.CATALOG.filter((e) => known.indexOf(e.key) === -1);
	if (!fresh.length) return 0;
	for (const r of app.findRecordsByFilter('roles', 'system = true', 'sort', 0, 0)) {
		const key = r.getString('key');
		const cur = perms.parseList(r.getString('perms'));
		const add = fresh.filter((e) => e.roles.indexOf(key) !== -1).map((e) => e.key);
		if (!add.length && cat.FULL_ROLES.indexOf(key) === -1) continue;
		r.set('perms', cur.concat(add));
		app.save(r);
	}
	reg.set('value', { keys: keys });
	app.save(reg);
	return fresh.length;
}

module.exports = {
	assertCanManage,
	assertSpecial,
	KEY_RE,
	requireRoleManager,
	unknownKeys,
	normalizePerms,
	usersOfRole,
	recomputeRole,
	assertRoleExists,
	assertNotLastAdmin,
	assertCanAssign,
	syncCatalog,
	isAdminAuth
};
