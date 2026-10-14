/// <reference path="../pb_data/types.d.ts" />
// N° de train d'un bon bus ou taxi (14 oct. 2026) : saisi par le rédacteur, il pré-remplit le trajet depuis le référentiel
// des trains (`train_services`). Texte de 1 à 6 chiffres, facultatif ; mêmes règles que le reste du bon (champ libre,
// non repris de BACO : l'import et l'import différentiel ne le touchent pas).

migrate(
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const col = app.findCollectionByNameOrId(name);
			col.fields.add(new TextField({ name: 'train_number', max: 6, pattern: '^[0-9]*$' }));
			app.save(col);
		}
	},
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const col = app.findCollectionByNameOrId(name);
			col.fields.removeByName('train_number');
			app.save(col);
		}
	}
);
