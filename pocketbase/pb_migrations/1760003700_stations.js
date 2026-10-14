/// <reference path="../pb_data/types.d.ts" />
// Référentiel des gares (14 oct. 2026) : une fiche par gare voyageurs (GTFS SNCB + points opérationnels Infrabel), avec
// pays, alias (gares frontière : « Maubeuge (FR) » = « Maubeuge »), lignes et DISTRICT modifiable. Construit par l'import
// quotidien du référentiel des trains (route interne `/api/csm/timetable/stations`) ; un district modifié à la main
// (`district_manual`) n'est jamais écrasé par l'import. Rien de nominatif.
//   - lecture : tout agent actif (dont invité et compte de service : district des missions DICOS), sauf Écran ;
//   - modification : district seulement (hook), droit `ptcar:update` (comme les abréviations PtCar) ;
//   - création / suppression : import seulement.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const UPDATE = `${ACTIVE} && (${ADMIN} || ((@request.auth.role = "paco" || @request.auth.role = "moderator") && @request.auth.denies !~ '"ptcar:update"') || @request.auth.grants ~ '"ptcar:update"')`;

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		app.save(
			new Collection({
				type: 'base',
				name: 'stations',
				listRule: `${ACTIVE} && @request.auth.role != "screen"`,
				viewRule: `${ACTIVE} && @request.auth.role != "screen"`,
				createRule: null,
				updateRule: `(${UPDATE}) && @request.body.updated_by = @request.auth.id && @request.auth.role != "screen"`,
				deleteRule: null,
				fields: [
					{ name: 'key', type: 'text', required: true, max: 120 },
					{ name: 'name', type: 'text', required: true, max: 120 },
					{ name: 'name_nl', type: 'text', max: 120 },
					{ name: 'abbr', type: 'text', max: 12 },
					{ name: 'uic', type: 'text', max: 12 },
					{ name: 'country', type: 'text', max: 2 },
					{ name: 'district', type: 'select', values: ['DSO', 'DSE', 'DCE'], maxSelect: 1 },
					{ name: 'district_manual', type: 'bool' },
					{ name: 'aliases', type: 'json', maxSize: 4000 },
					{ name: 'lines', type: 'json', maxSize: 2000 },
					{ name: 'search_key', type: 'text', max: 2000 },
					{ name: 'served', type: 'bool' },
					{ name: 'sig_import', type: 'text', max: 20 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE UNIQUE INDEX idx_stations_key ON stations (key)',
					'CREATE INDEX idx_stations_district ON stations (district)'
				]
			})
		);
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('stations'));
		} catch (_) {}
	}
);
