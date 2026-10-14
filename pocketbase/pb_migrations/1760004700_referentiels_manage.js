/// <reference path="../pb_data/types.d.ts" />
// Navigation v3 (14 oct. 2026, docs/design/AUDIT-NAVIGATION.md, décision de l'utilisateur) : les référentiels du réseau
// — gares (district, lignes, type), lignes, PtCar, EBP, points SPI — passent en LECTURE SEULE pour les PACO/RCCA et les
// modérateurs. Les modifier exige la clé du catalogue `referentiels:manage` (sensible ; admin / sysop l'ont d'office, un
// rôle personnalisé peut la recevoir). Lectures inchangées ; Carte PN (`level_crossings`, droits `carte_pn:*`) inchangée.
//
//   manage = ACTIVE && (ADMIN || @request.auth.perms ~ '"referentiels:manage"')
//
// Les suffixes de champs (auteur non forgeable, `legacy_id` figé) restent à l'identique. `stations` : création et
// suppression restent fermées (fiches tenues par l'import quotidien). `rail_lines` : création ouverte (ligne absente de
// l'horaire, ex. L.26 ; le hook la marque « manuelle », jamais écrasée ni supprimée par l'import) et suppression d'une
// ligne MANUELLE seulement (une ligne automatique reviendrait au prochain import).
// Anciennes clés devenues sans effet (cachées du catalogue) : ptcar:write/update/delete, ebp:write/update/delete,
// lignes:write/update/delete.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const NS = '@request.auth.role != "screen"';
const can = (p) => `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"${p}"'))`;

const CREATED = ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false';
const UPDATED = `${CREATED} && @request.body.legacy_id:changed = false`;

/** Règles d'écriture d'une collection selon les clés données (création, modification, suppression). */
function writeRules(name, keys) {
	switch (name) {
		case 'ptcar':
		case 'ebp_views':
		case 'spi_points':
			return {
				createRule: `(${can(keys.create)}${CREATED}) && ${NS}`,
				updateRule: `(${can(keys.update)}${UPDATED}) && ${NS}`,
				deleteRule: `${can(keys.delete)} && ${NS}`
			};
		case 'stations':
			return {
				createRule: null,
				updateRule: `${can(keys.update)} && @request.body.updated_by = @request.auth.id && ${NS}`,
				deleteRule: null
			};
		case 'rail_lines':
			return keys.create
				? {
						createRule: `${can(keys.create)} && @request.body.updated_by = @request.auth.id && ${NS}`,
						updateRule: `${can(keys.update)} && @request.body.updated_by = @request.auth.id && ${NS}`,
						deleteRule: `${can(keys.delete)} && manual = true && ${NS}`
					}
				: {
						createRule: null,
						updateRule: `${can(keys.update)} && @request.body.updated_by = @request.auth.id && ${NS}`,
						deleteRule: null
					};
	}
	throw new Error('collection inattendue : ' + name);
}

const M = 'referentiels:manage';
const MANAGE = { create: M, update: M, delete: M };

// Règles d'avant (1760004400) : clés v2 par collection.
const BEFORE = {
	ptcar: { create: 'ptcar:write', update: 'ptcar:update', delete: 'ptcar:delete' },
	ebp_views: { create: 'ebp:write', update: 'ebp:update', delete: 'ebp:delete' },
	spi_points: { create: 'lignes:write', update: 'lignes:update', delete: 'lignes:delete' },
	stations: { update: 'ptcar:update' },
	rail_lines: { update: 'ptcar:update' }
};

function apply(app, pick) {
	for (const name of Object.keys(BEFORE)) {
		const col = app.findCollectionByNameOrId(name);
		const rules = writeRules(name, pick(name));
		col.createRule = rules.createRule;
		col.updateRule = rules.updateRule;
		col.deleteRule = rules.deleteRule;
		app.save(col);
	}
}

migrate(
	(app) => apply(app, (name) => (name === 'stations' ? { update: M } : MANAGE)),
	(app) => apply(app, (name) => BEFORE[name])
);
