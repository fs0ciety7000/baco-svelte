/// <reference path="../pb_data/types.d.ts" />
// Statut par bout de trajet (12 oct. 2026) : `in_status` (embarquement, mission de départ DICOS) et `out_status`
// (débarquement, mission d'arrivée). L'ingestion les fusionne d'un lot à l'autre : un agent dont la vue DICOS ne couvre
// que la gare de départ ne fait plus passer le trajet « réalisé » tant que le débarquement à l'autre gare ne l'est pas.

const PMR = ['prevue', 'realisee', 'annulee', 'absent'];
const GROUP = ['prevue', 'realisee', 'annulee'];

migrate(
	(app) => {
		for (const [name, values] of [
			['pmr_assists', PMR],
			['group_missions', GROUP]
		]) {
			const c = app.findCollectionByNameOrId(name);
			for (const field of ['in_status', 'out_status']) {
				if (c.fields.getByName(field)) continue;
				c.fields.add(new SelectField({ name: field, maxSelect: 1, values }));
			}
			app.save(c);
		}
	},
	(app) => {
		for (const name of ['pmr_assists', 'group_missions']) {
			const c = app.findCollectionByNameOrId(name);
			for (const field of ['in_status', 'out_status']) c.fields.removeByName(field);
			app.save(c);
		}
	}
);
