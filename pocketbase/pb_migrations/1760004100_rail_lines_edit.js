/// <reference path="../pb_data/types.d.ts" />
// Lignes modifiables (14 oct. 2026, fin de la table BACO line_stations et d'Admin › Lignes et arrêts) : les gares d'une
// ligne du référentiel (`rail_lines`) se corrigent dans Ressources › Lignes par les administrateurs, coordinateurs PACO/RCCA
// et modérateurs (droit `ptcar:update`, comme Ressources › Gares). Une ligne corrigée est marquée `manual` : l'import
// n'écrit plus que sa version automatique (`stations_auto`, `branches_auto`, `name_auto`) et ne la supprime jamais ;
// « Rétablir l'automatique » (corps `manual: false`) reprend cette version. Le hook n'accepte que gares, embranchements
// et nom. Rien de nominatif.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const UPDATE = `${ACTIVE} && (${ADMIN} || ((@request.auth.role = "paco" || @request.auth.role = "moderator") && @request.auth.denies !~ '"ptcar:update"') || @request.auth.grants ~ '"ptcar:update"')`;

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const c = app.findCollectionByNameOrId('rail_lines');
		if (!c.fields.getByName('manual')) c.fields.add(new BoolField({ name: 'manual' }));
		if (!c.fields.getByName('stations_auto')) c.fields.add(new JSONField({ name: 'stations_auto', maxSize: 30000 }));
		if (!c.fields.getByName('branches_auto')) c.fields.add(new JSONField({ name: 'branches_auto', maxSize: 5000 }));
		if (!c.fields.getByName('name_auto')) c.fields.add(new TextField({ name: 'name_auto', max: 300 }));
		if (!c.fields.getByName('updated_by'))
			c.fields.add(new RelationField({ name: 'updated_by', collectionId: users.id, maxSelect: 1 }));
		c.updateRule = `(${UPDATE}) && @request.body.updated_by = @request.auth.id && @request.auth.role != "screen" && @request.auth.role != "guest"`;
		app.save(c);
		for (const r of app.findAllRecords('rail_lines')) {
			r.set('stations_auto', r.get('stations'));
			r.set('branches_auto', r.get('branches'));
			r.set('name_auto', r.getString('name'));
			app.save(r);
		}
	},
	(app) => {
		const c = app.findCollectionByNameOrId('rail_lines');
		for (const f of ['manual', 'stations_auto', 'branches_auto', 'name_auto', 'updated_by']) c.fields.removeByName(f);
		c.updateRule = null;
		app.save(c);
	}
);
