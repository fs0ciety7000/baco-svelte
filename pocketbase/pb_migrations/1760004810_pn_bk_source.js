/// <reference path="../pb_data/types.d.ts" />
// PN (suite du lot A, 15 oct. 2026, réponses de l'utilisateur) :
//  - `bk_source` : origine d'une BK calculée par l'import — « bornes » (interpolée entre les bornes kilométriques
//    Infrabel, jeu « relatie-tussen-kilometerpalen-en-lijnen », CC0, précision de l'ordre de 50 m) ou « estimee » (le long
//    des gares, « ≈ », repli). Vide = BK relevée (BACO ou équipe), jamais recalculée. Non forgeable par un agent.
//  - PN repris de BACO absents du fichier Infrabel : désactivés par l'import (`infrabel_seen = "absent"`, réversible) ;
//    réactivés à la main = `infrabel_seen = "garde"` (hook), l'import ne les désactive plus.

migrate(
	(app) => {
		const pn = app.findCollectionByNameOrId('level_crossings');
		pn.fields.add(new SelectField({ name: 'bk_source', maxSelect: 1, values: ['bornes', 'estimee'] }));
		const extra = ' && @request.body.bk_source:isset = false';
		if (pn.createRule.indexOf('bk_source') < 0) pn.createRule += extra;
		if (pn.updateRule.indexOf('bk_source') < 0) pn.updateRule += extra;
		app.save(pn);
		app.db().newQuery("UPDATE level_crossings SET bk_source = 'estimee' WHERE bk_estimated = TRUE").execute();
	},
	(app) => {
		const pn = app.findCollectionByNameOrId('level_crossings');
		pn.createRule = pn.createRule.replace(' && @request.body.bk_source:isset = false', '');
		pn.updateRule = pn.updateRule.replace(' && @request.body.bk_source:isset = false', '');
		pn.fields.removeByName('bk_source');
		app.save(pn);
	}
);
