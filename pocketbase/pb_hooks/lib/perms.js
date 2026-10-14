// Permissions effectives d'un agent (`users.perms`, rôles v3 lot L1, 14 oct. 2026), chargé par require() depuis
// users.pb.js et la migration 1760004300 (les fonctions en tête d'un *.pb.js ne sont pas visibles dans un gestionnaire).
// Miroir EXACT de web/src/lib/permissions/compute.ts (le test web catalog.test.ts compare les deux). Le catalogue et les
// rôles par défaut viennent de lib/catalog.js, copie générée par `npm run catalog` (web/) : ne rien recopier ici.
//
// Héritage : admin / sysop = tout ; écran, désactivé, connecteur = rien, même accordé ; sinon, pour chaque clé :
// accordée → oui ; retirée → non ; sinon le rôle décide. Une clé v3 hérite des grants / denies de ses clés `legacy`.
// Une clé dont une dépendance (`requires`) manque est retirée.

const cat = require(`${__hooks}/lib/catalog.js`);

// Champ JSON lu dans un hook : `get()` renvoie du brut, on passe par le texte.
function parseList(raw) {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
	} catch (_) {
		return [];
	}
}

function computePerms(role, grants, denies) {
	const keys = cat.CATALOG.map((e) => e.key);
	if (cat.NO_MODULE_ROLES.indexOf(role) !== -1) return [];
	if (cat.FULL_ROLES.indexOf(role) !== -1) return keys;
	const g = {};
	const d = {};
	for (const k of grants || []) g[k] = true;
	for (const k of denies || []) d[k] = true;
	const out = {};
	for (const e of cat.CATALOG) {
		let v = null;
		if (g[e.key]) v = true;
		else if (d[e.key]) v = false;
		if (v === null) for (const k of e.legacy) if (g[k]) { v = true; break; }
		if (v === null) for (const k of e.legacy) if (d[k]) { v = false; break; }
		if (v === null) v = e.roles.indexOf(role) !== -1;
		if (v) out[e.key] = true;
	}
	let changed = true;
	while (changed) {
		changed = false;
		for (const e of cat.CATALOG) {
			if (out[e.key] && e.requires.some((r) => !out[r])) {
				delete out[e.key];
				changed = true;
			}
		}
	}
	return keys.filter((k) => out[k]);
}

// Permissions d'une fiche `users` (rôle, grants, denies lus sur la fiche elle-même).
function permsOf(record) {
	return computePerms(record.getString('role'), parseList(record.getString('grants')), parseList(record.getString('denies')));
}

module.exports = { computePerms, permsOf, parseList };
