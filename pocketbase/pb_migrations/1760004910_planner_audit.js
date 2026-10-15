/// <reference path="../pb_data/types.d.ts" />
// Planificateur PMR : suites de l'audit sécurité et de la revue adversariale (15 oct. 2026, `1760004900_planner.js`).
//
//   - `planner_tasks.dicos_changed` (bool) : gare, heure ou jour changés par une synchro DICOS alors que la tâche était
//     déjà attribuée (« Modifiée par DICOS ») ; posé par le compte de service, effacé par le hook `planner.pb.js` quand un
//     planificateur réattribue ou marque « faite » ; un agent ne le pose pas.
//   - `planner_tasks.synced_by` (relation `users`) : propriétaire du jeton personnel qui a envoyé le lot DICOS (vide avec
//     le secret partagé) ; écrit par le compte de service seul.
//   - Le compte de service ne lit plus les tâches encodées à la main ou tirées d'un modèle (`note` / `label` saisis par les
//     agents) ; `note` et `label` lui sont aussi masqués sur les tâches DICOS (`onRecordEnrich`, `planner.pb.js`).
//
// Règles réécrites en entier (mêmes constructions que 1760004900) ; `down` rétablit celles de 1760004900.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const NS = '@request.auth.role != "screen"';
const has = (p) => `@request.auth.perms ~ '"${p}"'`;
const can = (p) => `(${ACTIVE} && (${ADMIN} || ${has(p)}))`;
const DICOS = `(${ACTIVE} && @request.auth.role = "connector" && @request.auth.grants ~ '"dicos:write"')`;
const unset = (...names) => names.map((n) => `@request.body.${n}:isset = false`).join(' && ');

const FROZEN_DICOS = ['day', 'kind', 'start', 'end', 'station', 'station_key', 'other_station', 'train', 'pmr_type', 'pax', 'light', 'dossier'];
const MANUAL = '(source = "manuel" || source = "modele")';
const BODY_MANUAL = '(@request.body.source = "manuel" || @request.body.source = "modele")';
const BODY_DICOS = '(@request.body.source = "dicos_pending" || @request.body.source = "dicos_mission")';
const ASSIGN = ['assignee_kind', 'assignee_agent', 'assignee_label', 'origin', 'note', 'label'];

function rules(v2) {
	const dicosFields = v2
		? ['source_key', 'dicos_status', 'station_ok', 'assist', 'dicos_changed', 'synced_by']
		: ['source_key', 'dicos_status', 'station_ok', 'assist'];
	const connectorRead = v2 ? `(${DICOS} && source != "manuel" && source != "modele")` : DICOS;
	return {
		listRule: `(${can('planner:read')} && ${NS}) || ${connectorRead}`,
		viewRule: `(${can('planner:read')} && ${NS}) || ${connectorRead}`,
		createRule:
			`(${can('planner:write')} && ${NS} && ${BODY_MANUAL} && ${unset(...dicosFields)}) || ` +
			`(${DICOS} && ${BODY_DICOS} && ${unset(...ASSIGN)})`,
		updateRule:
			`(${can('planner:write')} && ${NS} && ${unset('source', ...dicosFields)} && (${MANUAL} || (${unset(...FROZEN_DICOS)}))) || ` +
			`(${DICOS} && source != "manuel" && source != "modele" && ` +
			`(@request.body.source:isset = false || @request.body.source = "dicos_pending" || @request.body.source = "dicos_mission") && ` +
			`${unset(...ASSIGN)})`,
		deleteRule: `(${can('planner:write')} && ${NS} && ${MANUAL}) || (${can('planner:manage')} && ${NS})`
	};
}

function setRules(c, r) {
	c.listRule = r.listRule;
	c.viewRule = r.viewRule;
	c.createRule = r.createRule;
	c.updateRule = r.updateRule;
	c.deleteRule = r.deleteRule;
}

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const tasks = app.findCollectionByNameOrId('planner_tasks');
		tasks.fields.add(new BoolField({ name: 'dicos_changed' }));
		tasks.fields.add(new RelationField({ name: 'synced_by', collectionId: users.id, maxSelect: 1 }));
		setRules(tasks, rules(true));
		app.save(tasks);
	},
	(app) => {
		const tasks = app.findCollectionByNameOrId('planner_tasks');
		tasks.fields.removeByName('dicos_changed');
		tasks.fields.removeByName('synced_by');
		setRules(tasks, rules(false));
		app.save(tasks);
	}
);
