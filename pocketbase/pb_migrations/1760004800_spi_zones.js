/// <reference path="../pb_data/types.d.ts" />
// Réseau : passages à niveau Infrabel et zones SPI (lot A du plan du 15 oct. 2026, demande de l'utilisateur).
//
//  - `spi_zones` (ex-zones COI, « COI devient SPI ») : une fiche par zone (code = abréviation PtCar de la gare de
//    référence, district SNCB, couleur de la carte, polygone GeoJSON facultatif posé à la main ; sans lui, la zone est
//    dessinée par CSM à partir des gares qui lui sont rattachées). Lecture : qui lit la Carte PN, les points SPI ou les
//    horaires ; écriture : `referentiels:manage`. Les 19 zones de la carte du 28/06/2023 sont créées ici.
//  - `stations.spi_zone` + `spi_zone_source` (carte / graphe / proximite / manuel) : zone de chaque gare et PANG, posée par
//    le calcul (serveur Next, route interne `POST /api/csm/network/zones`) sauf si elle a été choisie à la main.
//  - `level_crossings` : PN des données ouvertes Infrabel (« geoow », CC0) : `infrabel_id` (« L-36-14 », unique quand il
//    est posé), `commune`, `signal` (type de signalisation), `bk_estimated` (BK calculée le long de la ligne),
//    `zone_source` (baco / auto / manuel), `infrabel_seen` (jour du dernier import qui l'a vu) ; source `infrabel` ; numéro
//    élargi aux suffixes Infrabel (« 12A », « 3 bis »). Les champs Infrabel ne se forgent pas par l'API.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const NS = '@request.auth.role != "screen"';
const can = (p) => `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"${p}"'))`;

// Zones de la carte « Répartition des PtCars en zones COI » (28/06/2023) et districts donnés par l'utilisateur.
const ZONES = [
	['LT', 'Ottignies', 'DSE', '#5d9fd1', 'Ottignies'],
	['LL', 'Arlon', 'DSE', '#d71285', 'Arlon'],
	['GV', 'Verviers', 'DSE', '#7a2333', 'Verviers-Central'],
	['FNR', 'Namur', 'DSE', '#e9658d', 'Namur'],
	['FL', 'Liège', 'DSE', '#688ef0', 'Liège-Guillemins'],
	['LRB', 'Libramont', 'DSE', '#13a83c', 'Libramont'],
	['FCR', 'Charleroi', 'DSO', '#4f9e2f', 'Charleroi-Central'],
	['FTY', 'Tournai', 'DSO', '#a6ba2a', 'Tournai'],
	['FMS', 'Mons', 'DSO', '#d9b92c', 'Mons'],
	['FBMZ', 'Bruxelles-Midi', 'DCE', '#c9474b', 'Bruxelles-Midi'],
	['FBN', 'Bruxelles-Nord', 'DCE', '#a8484a', 'Bruxelles-Nord'],
	['FGSP', 'Gand', 'DNO', '#3fb3c7', 'Gand-Saint-Pierre'],
	['LK', 'Courtrai', 'DNO', '#805adf', 'Courtrai'],
	['FDD', 'Denderleeuw', 'DNO', '#b0864c', 'Denderleeuw'],
	['FR', 'Bruges', 'DNO', '#d03251', 'Bruges'],
	['FN', 'Anvers', 'DNE', '#3030cd', 'Anvers-Central'],
	['FM', 'Malines', 'DNE', '#7fb043', 'Malines'],
	['FLV', 'Louvain', 'DNE', '#8e3ace', 'Louvain'],
	['FHS', 'Hasselt', 'DNE', '#d26c44', 'Hasselt']
];

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const read = `(${can('spi:read')} || ${can('carte_pn:read')} || ${can('timetable:read')}) && ${NS}`;
		const manage = can('referentiels:manage');
		const zones = new Collection({
			type: 'base',
			name: 'spi_zones',
			listRule: read,
			viewRule: read,
			createRule: `${manage} && @request.body.updated_by = @request.auth.id && ${NS}`,
			updateRule: `${manage} && @request.body.updated_by = @request.auth.id && @request.body.code:changed = false && ${NS}`,
			deleteRule: `${manage} && ${NS}`,
			fields: [
				{ name: 'code', type: 'text', required: true, max: 6, pattern: '^[A-Z]{2,6}$' },
				{ name: 'name', type: 'text', required: true, max: 80 },
				{ name: 'district', type: 'select', maxSelect: 1, values: ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'] },
				{ name: 'color', type: 'text', max: 7, pattern: '^$|^#[0-9a-f]{6}$' },
				{ name: 'ref_station', type: 'text', max: 120 },
				// GeoJSON (Polygon ou MultiPolygon) posé à la main ; vide = dessin calculé par CSM.
				{ name: 'polygon', type: 'json', maxSize: 400000 },
				{ name: 'notes', type: 'text', max: 1000 },
				{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
				{ name: 'created', type: 'autodate', onCreate: true },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_spi_zones_code ON spi_zones (code)']
		});
		app.save(zones);
		for (const [code, name, district, color, ref] of ZONES) {
			const r = new Record(zones);
			r.set('code', code);
			r.set('name', name);
			r.set('district', district);
			r.set('color', color);
			r.set('ref_station', ref);
			app.save(r);
		}

		const st = app.findCollectionByNameOrId('stations');
		st.fields.add(new TextField({ name: 'spi_zone', max: 6, pattern: '^$|^[A-Z]{2,6}$' }));
		st.fields.add(new SelectField({ name: 'spi_zone_source', maxSelect: 1, values: ['carte', 'graphe', 'proximite', 'manuel'] }));
		st.addIndex('idx_stations_spi_zone', false, 'spi_zone', '');
		app.save(st);

		const pn = app.findCollectionByNameOrId('level_crossings');
		pn.fields.getByName('number').pattern = '^[0-9]{1,4}( bis| ter|[A-Z]{1,8})?$';
		pn.fields.getByName('source').values = ['baco', 'csm', 'infrabel'];
		pn.fields.add(new TextField({ name: 'infrabel_id', max: 40 }));
		pn.fields.add(new TextField({ name: 'commune', max: 120 }));
		pn.fields.add(new TextField({ name: 'signal', max: 80 }));
		pn.fields.add(new BoolField({ name: 'bk_estimated' }));
		pn.fields.add(new SelectField({ name: 'zone_source', maxSelect: 1, values: ['baco', 'auto', 'manuel'] }));
		pn.fields.add(new TextField({ name: 'infrabel_seen', max: 10 }));
		pn.addIndex('idx_level_crossings_infrabel', true, 'infrabel_id', "infrabel_id != ''");
		// Champs tenus par l'import (route interne) : jamais dans le corps d'une requête d'agent.
		const FORGED =
			' && @request.body.infrabel_id:isset = false && @request.body.infrabel_seen:isset = false && @request.body.bk_estimated:isset = false && @request.body.zone_source:isset = false && @request.body.signal:isset = false && @request.body.commune:isset = false';
		pn.createRule = `${pn.createRule}${FORGED} && (@request.body.source:isset = false || @request.body.source = "csm")`;
		pn.updateRule = `${pn.updateRule}${FORGED} && @request.body.source:isset = false`;
		app.save(pn);
		// PN repris de BACO : leur zone a été saisie par l'équipe.
		app.db().newQuery("UPDATE level_crossings SET zone_source = 'baco' WHERE zone != '' AND (zone_source = '' OR zone_source IS NULL)").execute();
	},
	(app) => {
		try {
			app.delete(app.findCollectionByNameOrId('spi_zones'));
		} catch (_) {}
		const st = app.findCollectionByNameOrId('stations');
		st.removeIndex('idx_stations_spi_zone');
		st.fields.removeByName('spi_zone');
		st.fields.removeByName('spi_zone_source');
		app.save(st);
		const pn = app.findCollectionByNameOrId('level_crossings');
		app.db().newQuery("DELETE FROM level_crossings WHERE source = 'infrabel'").execute();
		pn.removeIndex('idx_level_crossings_infrabel');
		for (const f of ['infrabel_id', 'commune', 'signal', 'bk_estimated', 'zone_source', 'infrabel_seen']) pn.fields.removeByName(f);
		pn.fields.getByName('number').pattern = '^[0-9]{1,4}( bis| ter)?$';
		pn.fields.getByName('source').values = ['baco', 'csm'];
		const FORGED_RE = / && @request\.body\.infrabel_id:isset = false.*$/;
		pn.createRule = pn.createRule.replace(FORGED_RE, '');
		pn.updateRule = pn.updateRule.replace(FORGED_RE, '');
		app.save(pn);
	}
);
