/// <reference path="../pb_data/types.d.ts" />
// Décision du 8 octobre 2026 : la remise B201 est écrite par tous les agents rattachés à un district
// (Sud-Ouest, Sud-Est, Centre), plus seulement par les moderators. Un agent (user) sans district ne l'écrit pas ;
// admin / sysop et une permission `b201:write` accordée explicitement restent valables.
// Le district donne désormais un droit : l'agent ne peut plus le modifier lui-même (admin seulement).

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';

// Les moderators gardent le droit même sans district (comme avant) ; un agent (user ou otto_agent, agents bus :
// 14 comptes sur 29) doit être rattaché à un district.
const byRole =
	'(@request.auth.role = "moderator" || ((@request.auth.role = "user" || @request.auth.role = "otto_agent") && @request.auth.district != ""))';
const WRITE =
	`${ACTIVE} && (${ADMIN} || @request.auth.grants ~ '"b201:write"' || ` +
	`(${byRole} && @request.auth.denies !~ '"b201:write"'))`;
const OLD = `${ACTIVE} && (${ADMIN} || ((@request.auth.role = "moderator") && @request.auth.denies !~ '"b201:write"') || @request.auth.grants ~ '"b201:write"')`;

const SELF =
	'id = @request.auth.id && @request.body.role:isset = false && @request.body.grants:isset = false' +
	' && @request.body.denies:isset = false && @request.body.banned_until:isset = false && @request.body.email:isset = false';

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.updateRule = `${ADMIN} || (${SELF} && @request.body.district:isset = false)`;
		app.save(users);
		const col = app.findCollectionByNameOrId('b201_reports');
		col.createRule = `(${WRITE}) && @request.body.updated_by = @request.auth.id`;
		col.updateRule = `(${WRITE}) && @request.body.day:changed = false && @request.body.updated_by = @request.auth.id`;
		app.save(col);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		users.updateRule = `${ADMIN} || (${SELF})`;
		app.save(users);
		const col = app.findCollectionByNameOrId('b201_reports');
		col.createRule = `(${OLD}) && @request.body.updated_by = @request.auth.id`;
		col.updateRule = `(${OLD}) && @request.body.day:changed = false && @request.body.updated_by = @request.auth.id`;
		app.save(col);
	}
);
