/// <reference path="../pb_data/types.d.ts" />
// Taxi aller-retour : heure de retour non saisie (14 oct. 2026). Comme `time_pending` pour l'aller, `return_at` porte alors
// le jour à minuit et l'heure reste vide à la relecture (avant : « 00:00 », et le bon était refusé « le retour doit suivre
// l'aller »).

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId('taxi_orders');
		col.fields.add(new BoolField({ name: 'return_time_pending' }));
		app.save(col);
		// Brouillons déjà touchés : un retour à minuit (Bruxelles = 22:00 ou 23:00 UTC) venait d'une heure vide.
		app
			.db()
			.newQuery(
				"UPDATE taxi_orders SET return_time_pending = TRUE WHERE status = 'brouillon' AND return_at != '' AND substr(return_at, 12, 5) IN ('22:00', '23:00')"
			)
			.execute();
	},
	(app) => {
		const col = app.findCollectionByNameOrId('taxi_orders');
		col.fields.removeByName('return_time_pending');
		app.save(col);
	}
);
