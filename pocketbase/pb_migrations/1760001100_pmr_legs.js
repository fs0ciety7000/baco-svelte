/// <reference path="../pb_data/types.d.ts" />
// Missions PMR v3 (retours utilisateur du 8 oct. 2026) : une ligne = un TRAJET (leg) du dossier DICOS, avec gare +
// heure de DÉPART et d'ARRIVÉE, l'assistance à l'embarquement (IN) et/ou au débarquement (OUT), le district des deux
// bouts (filtre + mise en évidence), et le type de transport (train / taxi). Source = l'endpoint trip-details
// (dossier complet). Champs ajoutés à `pmr_assists` (non nominatifs) ; le nominatif reste dans `pmr_mission`.

migrate(
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		const add = (f) => { if (!assists.fields.getByName(f.name)) assists.fields.add(f); };
		add(new TextField({ name: 'arr_time', max: 5, pattern: '^$|^\\d{2}:\\d{2}$' }));
		add(new SelectField({ name: 'arr_district', maxSelect: 1, values: ['DCE', 'DSE', 'DSO'] }));
		add(new BoolField({ name: 'in_assist' }));
		add(new BoolField({ name: 'out_assist' }));
		add(new SelectField({ name: 'transport', maxSelect: 1, values: ['train', 'taxi'] }));
		app.save(assists);
	},
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		for (const name of ['arr_time', 'arr_district', 'in_assist', 'out_assist', 'transport'])
			assists.fields.removeByName(name);
		app.save(assists);
	}
);
