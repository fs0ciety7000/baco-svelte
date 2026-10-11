/// <reference path="../pb_data/types.d.ts" />
// Fiabilité DICOS et alertes (demande du 11 oct. 2026) :
// - `pmr_assists` / `group_missions` : `last_seen_sync` (instant du dernier lot DICOS qui contenait la mission) et
//   `last_seen_by` (propriétaire du jeton de ce lot, vide = secret partagé). Posés par le hook de `dicos_syncs` (SQL, sans
//   audit ni événement temps réel), jamais par une requête. Une mission « prévue » plus vue depuis le début de la
//   dernière synchro complète du même agent est affichée « Absente de DICOS » (calcul côté web).
// - `dicos_syncs` : `seen` (identifiants `j<journeyId>` du lot, consommés puis vidés par le hook) et `session_start`
//   (début de la synchro dont ce lot est le dernier, posé par le hook).
// - Notification `dicos` : mission nouvelle, annulée ou déplacée dans les 3 heures (hook `pmr.pb.js`).

const STAMP = ['last_seen_sync', 'last_seen_by'];
const NOT_FORGED = STAMP.map((f) => `@request.body.${f}:isset = false`).join(' && ');

migrate(
	(app) => {
		const notifications = app.findCollectionByNameOrId('notifications');
		const kind = notifications.fields.getByName('kind');
		if (kind.values.indexOf('dicos') === -1) kind.values = kind.values.concat(['dicos']);
		app.save(notifications);

		for (const name of ['pmr_assists', 'group_missions']) {
			const c = app.findCollectionByNameOrId(name);
			if (!c.fields.getByName('last_seen_sync')) c.fields.add(new DateField({ name: 'last_seen_sync' }));
			if (!c.fields.getByName('last_seen_by')) c.fields.add(new TextField({ name: 'last_seen_by', max: 36 }));
			c.createRule = `(${c.createRule}) && ${NOT_FORGED}`;
			c.updateRule = `(${c.updateRule}) && ${NOT_FORGED}`;
			c.addIndex(`idx_${name}_day_seen`, false, 'day, last_seen_sync', '');
			app.save(c);
		}

		const syncs = app.findCollectionByNameOrId('dicos_syncs');
		if (!syncs.fields.getByName('seen')) syncs.fields.add(new JSONField({ name: 'seen', maxSize: 200000 }));
		if (!syncs.fields.getByName('session_start')) syncs.fields.add(new DateField({ name: 'session_start' }));
		syncs.createRule = `(${syncs.createRule}) && @request.body.session_start:isset = false`;
		app.save(syncs);
	},
	(app) => {
		for (const name of ['pmr_assists', 'group_missions']) {
			const c = app.findCollectionByNameOrId(name);
			for (const f of STAMP) c.fields.removeByName(f);
			c.removeIndex(`idx_${name}_day_seen`);
			for (const k of ['createRule', 'updateRule']) {
				const s = String(c[k] || '');
				const tail = `) && ${NOT_FORGED}`;
				if (s.indexOf('(') === 0 && s.endsWith(tail)) c[k] = s.slice(1, -tail.length);
			}
			app.save(c);
		}
		const syncs = app.findCollectionByNameOrId('dicos_syncs');
		for (const f of ['seen', 'session_start']) syncs.fields.removeByName(f);
		const s = String(syncs.createRule || '');
		const tail = ') && @request.body.session_start:isset = false';
		if (s.indexOf('(') === 0 && s.endsWith(tail)) syncs.createRule = s.slice(1, -tail.length);
		app.save(syncs);
		const notifications = app.findCollectionByNameOrId('notifications');
		const kind = notifications.fields.getByName('kind');
		kind.values = kind.values.filter((v) => v !== 'dicos');
		app.save(notifications);
	}
);
