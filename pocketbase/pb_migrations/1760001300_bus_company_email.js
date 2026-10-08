/// <reference path="../pb_data/types.d.ts" />
// Bon bus : adresse e-mail saisie à la main quand la société n'en a pas (retour utilisateur du 9 oct. 2026).
// Facultative : sans adresse, le bon est généré en PDF et transmis autrement (pas de brouillon .eml).
// L'heure réelle de chaque bus vit dans le JSON `buses` (champ `actual`) : pas de champ à ajouter.

migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('bus_orders');
		if (!c.fields.getByName('company_email')) c.fields.add(new TextField({ name: 'company_email', max: 500 }));
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('bus_orders');
		c.fields.removeByName('company_email');
		app.save(c);
	}
);
