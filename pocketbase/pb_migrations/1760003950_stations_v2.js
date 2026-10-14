/// <reference path="../pb_data/types.d.ts" />
// Référentiel des gares v2 (14 oct. 2026, demande de l'utilisateur) :
//   - 5 districts SNCB : DSO, DSE, DCE + DNO (Nord-Ouest), DNE (Nord-Est) ; les filtres et alertes de l'équipe restent sur
//     DSO / DSE / DCE (users.districts inchangé) ;
//   - toutes les gares et PANG (points d'arrêt non gardés) d'Infrabel, même sans train dans la semaine : `kind`
//     (gare / pang / etranger), coordonnées ;
//   - proposition de district (`district_suggested`, `suggestion`) calculée par proximité et lignes communes, validée par
//     un coordinateur ;
//   - lignes modifiables (`lines_manual` : jamais écrasées par l'import).

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId('stations');
		col.fields.getByName('district').values = ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'];
		col.fields.add(new SelectField({ name: 'kind', values: ['gare', 'pang', 'etranger'], maxSelect: 1 }));
		col.fields.add(new NumberField({ name: 'lat' }));
		col.fields.add(new NumberField({ name: 'lon' }));
		col.fields.add(new SelectField({ name: 'district_suggested', values: ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'], maxSelect: 1 }));
		col.fields.add(new TextField({ name: 'suggestion', max: 300 }));
		col.fields.add(new BoolField({ name: 'lines_manual' }));
		app.save(col);
	},
	(app) => {
		const col = app.findCollectionByNameOrId('stations');
		app.db().newQuery("UPDATE stations SET district = '' WHERE district IN ('DNO', 'DNE')").execute();
		col.fields.getByName('district').values = ['DSO', 'DSE', 'DCE'];
		for (const f of ['kind', 'lat', 'lon', 'district_suggested', 'suggestion', 'lines_manual']) col.fields.removeByName(f);
		app.save(col);
	}
);
