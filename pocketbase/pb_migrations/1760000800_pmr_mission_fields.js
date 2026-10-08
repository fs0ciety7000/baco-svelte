/// <reference path="../pb_data/types.d.ts" />
// Missions PMR v2 (retour utilisateur du 8 oct. 2026) : afficher la gare de départ ET d'arrivée, et filtrer par
// district (DSE/DSO/DCE) déduit de la gare. On ajoute à `pmr_assists` :
// - `other_station` : l'autre extrémité du trajet (origine si arrivée, destination si départ) ;
// - `district` : district opérationnel déduit de la gare côté serveur (table `ligne_data` de Supabase).
// Champs non nominatifs : lisibles comme le reste de `pmr_assists`. Écrits par l'ingestion DICOS (compte `dicos:write`).

migrate(
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		if (!assists.fields.getByName('other_station'))
			assists.fields.add(new TextField({ name: 'other_station', max: 100 }));
		if (!assists.fields.getByName('district'))
			assists.fields.add(new SelectField({ name: 'district', maxSelect: 1, values: ['DCE', 'DSE', 'DSO'] }));
		app.save(assists);
	},
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		for (const name of ['other_station', 'district']) assists.fields.removeByName(name);
		app.save(assists);
	}
);
