/// <reference path="../pb_data/types.d.ts" />
// Retards des trains des missions PMR et des groupes (demande du 10 oct. 2026) : le cron `mission-trains` lit dans iRail
// l'état de chaque train qui porte une mission du jour et l'enregistre ici (une fiche par jour + train) : retard
// courant, suppression, retard et suppression par arrêt. Les écrans Missions PMR / Groupes affichent le retard à la gare
// assistée, la cloche prévient les agents du district. Écrit par le hook seulement ; rien de nominatif.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	const denied = `@request.auth.denies !~ '"${perm}"'`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && ${denied}) || ${granted})`;
}
const READERS = ['moderator', 'user', 'reader'];

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'mission_trains',
				listRule: can('deplacements:read', READERS),
				viewRule: can('deplacements:read', READERS),
				createRule: null,
				updateRule: null,
				deleteRule: ADMIN,
				fields: [
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'train', type: 'text', required: true, max: 12 },
					{ name: 'delay', type: 'number', onlyInt: true, min: 0, max: 1440 },
					{ name: 'cancelled', type: 'bool' },
					// [{ st: gare (iRail, fr), t: "HH:MM" prévu, d: retard en minutes, c: supprimé, l: déjà quitté }]
					{ name: 'stops', type: 'json', maxSize: 20000 },
					{ name: 'checked_at', type: 'date' },
					{ name: 'notified_delay', type: 'number', onlyInt: true, min: 0, max: 1440 },
					{ name: 'notified_cancel', type: 'bool' },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_mission_trains_day_train ON mission_trains (day, train)']
			})
		);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('mission_trains'));
	}
);
