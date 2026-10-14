/// <reference path="../pb_data/types.d.ts" />
// Notifications rattachées à des districts (14 oct. 2026, « notifications selon district choisi du jour ») : les hooks
// posent les districts concernés (urgence d'un district, perturbation iRail, retard d'un train de mission, changement
// DICOS, mention @DSO…) ; la cloche n'affiche alors que celles des districts du jour de l'agent (aucun district = pour
// tous : mentions personnelles, trains suivis, alertes système). Écrit par les hooks seulement, comme le reste.
const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];

migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('notifications');
		if (!c.fields.getByName('districts'))
			c.fields.add(new SelectField({ name: 'districts', maxSelect: 3, values: DISTRICTS }));
		// Le destinataire ne marque que « lu » : les districts ne se modifient pas par l'API.
		if (c.updateRule && c.updateRule.indexOf('@request.body.districts:isset') === -1)
			c.updateRule = `${c.updateRule} && @request.body.districts:isset = false`;
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('notifications');
		c.fields.removeByName('districts');
		if (c.updateRule) c.updateRule = c.updateRule.replace(' && @request.body.districts:isset = false', '');
		app.save(c);
	}
);
