/// <reference path="../pb_data/types.d.ts" />
// Durcissement Référentiels après audit sécurité (8 oct. 2026) : la mise à jour d'un document était ouverte au rôle
// `user` sans figer le propriétaire (F1). Aujourd'hui aucune Server Action ne met à jour un document, mais on
// verrouille par défense en profondeur : update réservé aux coordinateurs, `uploaded_by` et `legacy_id` figés.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';

function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && @request.auth.denies !~ '"${perm}"') || ${granted})`;
}

migrate(
	(app) => {
		const documents = app.findCollectionByNameOrId('documents');
		documents.updateRule =
			`(${can('documents:write', ['moderator'])}) && @request.body.uploaded_by:changed = false && @request.body.legacy_id:isset = false`;
		app.save(documents);
	},
	(app) => {
		const WRITERS = ['moderator', 'user'];
		const documents = app.findCollectionByNameOrId('documents');
		documents.updateRule =
			`(${can('documents:write', WRITERS)}) && @request.body.legacy_id:isset = false`;
		app.save(documents);
	}
);
