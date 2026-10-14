/// <reference path="../pb_data/types.d.ts" />
// Gares de chaque ligne d'infrastructure, dans l'ordre (Ressources › Lignes, 14 oct. 2026). Construit chaque matin par
// l'import du référentiel des trains (chemins Infrabel + points kilométriques « lijnsecties », voir
// `web/src/lib/timetable/lines.ts`) et écrit par la route interne `/api/csm/timetable/lines` : aucune écriture par l'API.
// Remplace, pour l'onglet Lignes, la table BACO `line_stations` (36 lignes du sud), gardée pour les bons bus.
// Données d'exploitation publiques, rien de nominatif. Lecture : comme `train_services` (agents connectés hors invité,
// compte Écran et désactivé). Le district d'une ligne n'est pas stocké : il est calculé à la lecture depuis `stations`
// (district modifiable dans Ressources › Gares).

const READ =
	'@request.auth.id != "" && @request.auth.role != "disabled" && @request.auth.role != "screen" && @request.auth.role != "guest"';

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'rail_lines',
				listRule: READ,
				viewRule: READ,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					// N° de ligne normalisé (« 96 », « 124A », « 36N »).
					{ name: 'line', type: 'text', required: true, max: 12 },
					// Extrémités du tronc : « Bruxelles-Midi – Quévy ».
					{ name: 'name', type: 'text', max: 300 },
					// [{ n, a?, km?, b?, g? }] dans l'ordre : tronc (b absent) puis embranchements.
					{ name: 'stations', type: 'json', maxSize: 30000 },
					// [{ b, from, to }]
					{ name: 'branches', type: 'json', maxSize: 5000 },
					{ name: 'count', type: 'number', onlyInt: true, min: 0 },
					{ name: 'oriented', type: 'bool' },
					{ name: 'sig', type: 'text', max: 20 },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_rail_lines_line ON rail_lines (line)']
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('rail_lines'));
		} catch (_) {}
	}
);
