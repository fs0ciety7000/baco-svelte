/// <reference path="../pb_data/types.d.ts" />
// Journal (ex-main courante), demande du 9 oct. 2026 :
// - les perturbations et travaux iRail entrent dans le Journal (cron `irail-journal`) : `source = "irail"`, sans auteur,
//   dédupliqués par `external_id` ; jamais posés par une requête (règles) ;
// - chaque agent coche chaque jour le ou les districts où il travaille (`duty_day` + `duty_districts`, modifiables par
//   l'agent lui-même) : les notifications d'urgence et iRail suivent ces districts ;
// - nouveau type de notification « perturbation ».

const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];

migrate(
	(app) => {
		const log = app.findCollectionByNameOrId('ops_log');
		log.fields.getByName('author').required = false;
		if (!log.fields.getByName('source')) log.fields.add(new SelectField({ name: 'source', maxSelect: 1, values: ['agent', 'irail'] }));
		if (!log.fields.getByName('external_id')) log.fields.add(new TextField({ name: 'external_id', max: 100 }));
		log.addIndex('idx_ops_log_external', true, 'external_id', "external_id != ''");
		const noSystem = '@request.body.source:isset = false && @request.body.external_id:isset = false';
		log.createRule = `${log.createRule} && ${noSystem}`;
		log.updateRule = `${log.updateRule} && ${noSystem}`;
		app.save(log);

		const users = app.findCollectionByNameOrId('users');
		if (!users.fields.getByName('duty_day'))
			users.fields.add(new TextField({ name: 'duty_day', max: 10, pattern: '^$|^\\d{4}-\\d{2}-\\d{2}$' }));
		if (!users.fields.getByName('duty_districts'))
			users.fields.add(new SelectField({ name: 'duty_districts', maxSelect: 3, values: DISTRICTS }));
		app.save(users);

		const notifications = app.findCollectionByNameOrId('notifications');
		const kind = notifications.fields.getByName('kind');
		if (kind.values.indexOf('perturbation') === -1) kind.values = kind.values.concat(['perturbation']);
		app.save(notifications);
	},
	(app) => {
		app.db().newQuery("DELETE FROM ops_log WHERE source = 'irail'").execute();
		const log = app.findCollectionByNameOrId('ops_log');
		const noSystem = ' && @request.body.source:isset = false && @request.body.external_id:isset = false';
		log.createRule = log.createRule.replace(noSystem, '');
		log.updateRule = log.updateRule.replace(noSystem, '');
		log.removeIndex('idx_ops_log_external');
		log.fields.removeByName('external_id');
		log.fields.removeByName('source');
		log.fields.getByName('author').required = true;
		app.save(log);

		const users = app.findCollectionByNameOrId('users');
		users.fields.removeByName('duty_day');
		users.fields.removeByName('duty_districts');
		app.save(users);

		const notifications = app.findCollectionByNameOrId('notifications');
		const kind = notifications.fields.getByName('kind');
		kind.values = kind.values.filter((v) => v !== 'perturbation');
		app.save(notifications);
	}
);
