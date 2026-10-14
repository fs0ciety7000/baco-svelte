/// <reference path="../pb_data/types.d.ts" />
// Référentiel des relations de trains (demande du 14 oct. 2026) : ligne, type, relation, série, arrêts.
// Construit chaque matin par le serveur Next (GTFS SNCB + données ouvertes Infrabel) et écrit par les routes internes de
// `timetable.pb.js` (secret CSM_INTERNAL_SECRET) : aucune écriture par l'API. Données d'exploitation publiques, rien de
// nominatif. Lecture : tout agent connecté, sauf invité et compte Écran (comme l'onglet Ressources › Lignes).
//   - train_paths     : chemin Infrabel par n° de train (relation, lignes, gares), accumulé jour après jour (60 j) ;
//   - train_services  : un train (n° + suite d'arrêts) de la semaine de référence ;
//   - train_relations : résumé par relation (IC14, S1-1, L31… ; relations génériques P / IC / INT par terminus).

const READ =
	'@request.auth.id != "" && @request.auth.role != "disabled" && @request.auth.role != "screen" && @request.auth.role != "guest"';

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'train_paths',
				listRule: null,
				viewRule: null,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'number', type: 'number', required: true, onlyInt: true, min: 1 },
					{ name: 'day', type: 'text', max: 10 },
					{ name: 'relation', type: 'text', max: 40 },
					{ name: 'direction', type: 'text', max: 200 },
					{ name: 'lines', type: 'json', maxSize: 5000 },
					{ name: 'points', type: 'json', maxSize: 50000 }
				],
				indexes: ['CREATE UNIQUE INDEX idx_train_paths_number ON train_paths (number)']
			})
		);
		app.save(
			new Collection({
				type: 'base',
				name: 'train_services',
				listRule: READ,
				viewRule: READ,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'key', type: 'text', required: true, max: 40 },
					{ name: 'number', type: 'number', required: true, onlyInt: true, min: 1 },
					{ name: 'type', type: 'text', max: 10 },
					{ name: 'relation', type: 'text', max: 40 },
					{ name: 'relation_source', type: 'text', max: 10 },
					{ name: 'series', type: 'text', max: 20 },
					{ name: 'origin', type: 'text', max: 120 },
					{ name: 'terminus', type: 'text', max: 120 },
					{ name: 'days', type: 'number', onlyInt: true, min: 0, max: 127 },
					{ name: 'stops', type: 'json', maxSize: 60000 },
					{ name: 'lines', type: 'json', maxSize: 2000 },
					{ name: 'lines_source', type: 'text', max: 10 },
					{ name: 'first_dep', type: 'text', max: 5 },
					{ name: 'last_arr', type: 'text', max: 5 },
					{ name: 'stations_key', type: 'text', max: 10000 },
					{ name: 'pass_key', type: 'text', max: 10000 },
					{ name: 'lines_key', type: 'text', max: 2000 },
					{ name: 'sig', type: 'text', max: 20 }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_train_services_key ON train_services (key)',
					'CREATE INDEX idx_train_services_number ON train_services (number)',
					'CREATE INDEX idx_train_services_relation ON train_services (relation)'
				]
			})
		);
		app.save(
			new Collection({
				type: 'base',
				name: 'train_relations',
				listRule: READ,
				viewRule: READ,
				createRule: null,
				updateRule: null,
				deleteRule: null,
				fields: [
					{ name: 'key', type: 'text', required: true, max: 300 },
					{ name: 'relation', type: 'text', max: 40 },
					{ name: 'type', type: 'text', max: 10 },
					{ name: 'label', type: 'text', max: 300 },
					{ name: 'variants', type: 'json', maxSize: 20000 },
					{ name: 'series', type: 'json', maxSize: 2000 },
					{ name: 'lines', type: 'json', maxSize: 2000 },
					{ name: 'numbers', type: 'json', maxSize: 20000 },
					{ name: 'pattern', type: 'json', maxSize: 60000 },
					{ name: 'trains', type: 'number', onlyInt: true, min: 0 },
					{ name: 'days', type: 'number', onlyInt: true, min: 0, max: 127 },
					{ name: 'stations_key', type: 'text', max: 20000 },
					{ name: 'lines_key', type: 'text', max: 2000 },
					{ name: 'sig', type: 'text', max: 20 }
				],
				indexes: ['CREATE UNIQUE INDEX idx_train_relations_key ON train_relations (key)']
			})
		);
	},
	(app) => {
		for (const name of ['train_relations', 'train_services', 'train_paths']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
	}
);
