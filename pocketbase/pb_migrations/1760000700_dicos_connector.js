/// <reference path="../pb_data/types.d.ts" />
// Moindre privilège du compte de service DICOS (audit sécurité du 8 oct. 2026).
// Le compte d'ingestion portait le rôle `reader`, membre de READERS partout → il pouvait LIRE tout le nominatif PMR
// du système (pmr_mission, pmr_assist_legacy, pmr_clients, copies PMR des taxis, tous districts). Pour l'ingestion il
// n'a besoin de lire QUE `pmr_assists` et `pmr_mission` (dédup par `dicos_id`). On lui donne un rôle dédié `connector`
// (hors READERS, donc aucune lecture par défaut) et on ouvre la lecture de ces deux collections seulement, par une
// branche explicite sur le droit `dicos:write`.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const DICOS = `${ACTIVE} && @request.auth.grants ~ '"dicos:write"'`;

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	if (roles.length === 0) return `${ACTIVE} && (${ADMIN} || ${granted})`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}
const READERS = ['moderator', 'user', 'reader'];

migrate(
	(app) => {
		// 1) Rôle dédié `connector` (hors READERS).
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		if (role && Array.isArray(role.values) && role.values.indexOf('connector') === -1) {
			role.values = role.values.concat(['connector']);
			app.save(users);
		}

		// 2) Lecture de pmr_assists et pmr_mission ouverte au compte `dicos:write` (en plus des lecteurs habituels).
		const assists = app.findCollectionByNameOrId('pmr_assists');
		assists.listRule = `(${can('deplacements:read', READERS)}) || (${DICOS})`;
		assists.viewRule = `(${can('deplacements:read', READERS)}) || (${DICOS})`;
		app.save(assists);

		const mission = app.findCollectionByNameOrId('pmr_mission');
		mission.listRule = `(${can('pmr:read', READERS)}) || (${DICOS})`;
		mission.viewRule = `(${can('pmr:read', READERS)}) || (${DICOS})`;
		app.save(mission);
	},
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		assists.listRule = can('deplacements:read', READERS);
		assists.viewRule = can('deplacements:read', READERS);
		app.save(assists);
		const mission = app.findCollectionByNameOrId('pmr_mission');
		mission.listRule = can('pmr:read', READERS);
		mission.viewRule = can('pmr:read', READERS);
		app.save(mission);
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		if (role && Array.isArray(role.values)) {
			role.values = role.values.filter((v) => v !== 'connector');
			app.save(users);
		}
	}
);
