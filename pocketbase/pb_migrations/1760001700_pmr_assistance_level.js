/// <reference path="../pb_data/types.d.ts" />
// Export ALEA « Obligatoire » (demande du 9 oct. 2026, logigramme d'encodage) : il faut savoir si une PMR est en
// assistance COMPLÈTE (toujours encodée si l'arrêt prévu est < 5 min) ou LÉGÈRE (encodée seulement à 4 ou plus et si
// nombre × 30 s dépasse l'arrêt). Compteurs DICOS `traveler.fullAssistances` / `lightAssistances`, posés par
// l'ingestion (0 = inconnu, ex. lignes synchronisées avant cette migration).

migrate(
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		for (const name of ['full_pax', 'light_pax'])
			if (!assists.fields.getByName(name)) assists.fields.add(new NumberField({ name: name, onlyInt: true, min: 0, max: 99 }));
		app.save(assists);
	},
	(app) => {
		const assists = app.findCollectionByNameOrId('pmr_assists');
		assists.fields.removeByName('full_pax');
		assists.fields.removeByName('light_pax');
		app.save(assists);
	}
);
