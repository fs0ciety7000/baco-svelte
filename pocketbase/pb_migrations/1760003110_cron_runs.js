/// <reference path="../pb_data/types.d.ts" />
// Supervision (Admin › Santé, 11 oct. 2026) : « battement » de chaque tâche planifiée. Une fiche par tâche (`name`
// unique), écrite par les hooks seulement (`lib/heartbeat.js`) : début, fin, durée, succès ou erreur, nombre de passages.
// Lecture : administrateurs (admin, sysop). Aucune donnée personnelle.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = `${ACTIVE} && (@request.auth.role = "admin" || @request.auth.role = "sysop")`;

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'cron_runs',
				listRule: ADMIN,
				viewRule: ADMIN,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'name', type: 'text', required: true, max: 60 },
					{ name: 'last_start', type: 'date' },
					{ name: 'last_end', type: 'date' },
					{ name: 'ok', type: 'bool' },
					{ name: 'error', type: 'text', max: 500 },
					{ name: 'duration_ms', type: 'number', onlyInt: true, min: 0 },
					{ name: 'runs', type: 'number', onlyInt: true, min: 0 },
					{ name: 'last_error_at', type: 'date' }
				],
				indexes: ['CREATE UNIQUE INDEX idx_cron_runs_name ON cron_runs (name)']
			})
		);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('cron_runs'));
	}
);
