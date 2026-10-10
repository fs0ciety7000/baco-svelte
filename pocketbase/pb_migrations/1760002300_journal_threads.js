/// <reference path="../pb_data/types.d.ts" />
// Journal, demande du 10 oct. 2026 :
// - nouvelles catégories « service », « perturbation », « groupes » ;
// - réponses (fils) : `reply_to` = message d'origine (un seul niveau : répondre à une réponse rattache au même fil),
//   posé à la création seulement, vérifié par le hook ;
// - tri automatique des messages automatiques : réglage `journal_rules` (app_settings), règles source + mots-clés →
//   catégorie, modifiables par l'administration. Les perturbations iRail passent de « incident » à « perturbation ».

const NEW = ['service', 'perturbation', 'groupes'];

migrate(
	(app) => {
		const log = app.findCollectionByNameOrId('ops_log');
		const cat = log.fields.getByName('category');
		cat.values = cat.values.concat(NEW.filter((v) => cat.values.indexOf(v) === -1));
		if (!log.fields.getByName('reply_to')) log.fields.add(new RelationField({ name: 'reply_to', collectionId: log.id, maxSelect: 1, cascadeDelete: false }));
		log.addIndex('idx_ops_log_reply', false, 'reply_to', "reply_to != ''");
		// `reply_to` ne se change pas après la publication.
		log.updateRule = `${log.updateRule} && @request.body.reply_to:isset = false`;
		app.save(log);

		// Messages iRail déjà repris comme « incident » : ce sont des perturbations.
		app.db().newQuery("UPDATE ops_log SET category = 'perturbation' WHERE source = 'irail' AND category = 'incident'").execute();

		// Règles par défaut (modifiables dans Administration › Journal).
		let rec;
		try {
			rec = app.findFirstRecordByData('app_settings', 'key', 'journal_rules');
		} catch (_) {
			rec = new Record(app.findCollectionByNameOrId('app_settings'));
			rec.set('key', 'journal_rules');
			rec.set('value', {
				rules: [
					{ source: 'irail', match: '', category: 'perturbation' },
					{ source: 'baco', match: 'pmr, rampe, chaise, assistance', category: 'pmr' },
					{ source: 'baco', match: 'bus, taxi, bon de commande', category: 'commande' },
					{ source: 'baco', match: 'travaux', category: 'travaux' },
					{ source: 'baco', match: 'groupe, école', category: 'groupes' },
					{ source: 'baco', match: '', category: 'service' }
				]
			});
			app.save(rec);
		}
	},
	(app) => {
		const log = app.findCollectionByNameOrId('ops_log');
		app.db().newQuery("UPDATE ops_log SET category = 'info' WHERE category IN ('service', 'groupes')").execute();
		app.db().newQuery("UPDATE ops_log SET category = 'incident' WHERE category = 'perturbation'").execute();
		const cat = log.fields.getByName('category');
		cat.values = cat.values.filter((v) => NEW.indexOf(v) === -1);
		log.removeIndex('idx_ops_log_reply');
		log.fields.removeByName('reply_to');
		log.updateRule = log.updateRule.replace(' && @request.body.reply_to:isset = false', '');
		app.save(log);
	}
);
