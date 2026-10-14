/// <reference path="../pb_data/types.d.ts" />
// « Voir en tant que » (Administration, 14 oct. 2026) : le début et la fin du mode sont tracés dans le journal d'audit
// (`impersonate_start` / `impersonate_stop`, écrits par la route interne `/api/csm/impersonate`, impersonate.pb.js).

const ADDED = ['impersonate_start', 'impersonate_stop'];

migrate(
	(app) => {
		const audit = app.findCollectionByNameOrId('audit_log');
		const action = audit.fields.getByName('action');
		action.values = action.values.concat(ADDED.filter((v) => action.values.indexOf(v) === -1));
		app.save(audit);
	},
	(app) => {
		const audit = app.findCollectionByNameOrId('audit_log');
		const action = audit.fields.getByName('action');
		action.values = action.values.filter((v) => ADDED.indexOf(v) === -1);
		app.save(audit);
	}
);
