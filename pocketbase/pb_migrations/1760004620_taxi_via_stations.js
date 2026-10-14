/// <reference path="../pb_data/types.d.ts" />
// Bon taxi : plusieurs gares « via » (demande du 14 oct. 2026). `via_stations` = liste ordonnée (JSON de textes, 10 au
// plus, écrite par le serveur Next) ; `via_station` (texte) garde la même liste jointe par « · » (recherche, anciens
// écrans, import différentiel) et passe à 2000 caractères. Bons existants : l'ancien texte devient une étape unique
// (« Frameries ghlin » reste tel quel : pas de découpage deviné), par SQL (sans toucher `updated` ni l'audit).
// Le n° de dossier DICOS d'un taxi PMR utilise la colonne existante `pmr_file` (ex-`pmr_dossier` de BACO, purgée à
// 12 mois par `pmr-retention`) : pas de champ nouveau.

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId('taxi_orders');
		col.fields.add(new JSONField({ name: 'via_stations', maxSize: 5000 }));
		const via = col.fields.getByName('via_station');
		if (via) via.max = 2000;
		app.save(col);
		app
			.db()
			.newQuery(
				// Même valeur que `fillTaxiOrder` (lib/import.js) : l'import différentiel ne voit aucun écart.
				"UPDATE taxi_orders SET via_stations = CASE WHEN trim(via_station) != '' THEN json_array(via_station) ELSE '[]' END WHERE via_stations IS NULL OR via_stations IN ('', 'null', '[]')"
			)
			.execute();
	},
	(app) => {
		const col = app.findCollectionByNameOrId('taxi_orders');
		col.fields.removeByName('via_stations');
		app.save(col);
	}
);
