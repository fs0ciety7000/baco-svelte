/// <reference path="../pb_data/types.d.ts" />
// Cycle des bons v3 (décision de l'utilisateur du 14 oct. 2026) :
//   1. brouillon  = « Brouillon / en cours » (bon préparé, bus engagés) ;
//   2. termine    = « Terminé » (le ou les bus sont démobilisés) ;
//   3. envoye     = « Envoyé / finalisé » (clôture du bon : e-mail semi-automatique au fournisseur, PDF archivé).
// Plus annulé. « Confirmé » et « En cours » disparaissent (plus de confirmation fournisseur suivie : alerte H-2 et
// relance retirées). Conversion des bons existants : ancien « terminé » et ancien « envoyé » → envoyé / finalisé ;
// confirmé et en cours → brouillon / en cours. L'historique (`order_events`) garde les anciens libellés.

const OLD = ['brouillon', 'envoye', 'confirme', 'en_cours', 'termine', 'annule'];
const NEW = ['brouillon', 'termine', 'envoye', 'annule'];
const SCREEN_OLD = '(status = "envoye" || status = "en_cours")';
const SCREEN_NEW = '(status = "brouillon" || status = "termine")';

migrate(
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const q = (sql) => app.db().newQuery(sql).execute();
			// Ordre important : « terminé » devient « envoyé » avant que rien ne redevienne « terminé ».
			q(`UPDATE ${name} SET status = 'envoye' WHERE status = 'termine'`);
			q(`UPDATE ${name} SET status = 'brouillon' WHERE status IN ('confirme', 'en_cours')`);
			q(`UPDATE ${name} SET status_before_cancel = 'envoye' WHERE status_before_cancel = 'termine'`);
			q(`UPDATE ${name} SET status_before_cancel = 'brouillon' WHERE status_before_cancel IN ('confirme', 'en_cours')`);
			const col = app.findCollectionByNameOrId(name);
			col.fields.getByName('status').values = NEW;
			if (name === 'bus_orders') {
				for (const k of ['listRule', 'viewRule']) {
					if (col[k]) col[k] = String(col[k]).split(SCREEN_OLD).join(SCREEN_NEW);
				}
			}
			app.save(col);
		}
		// Alerte H-2 retirée : son battement ne doit plus apparaître « en retard » dans Admin › Santé.
		app.db().newQuery("DELETE FROM cron_runs WHERE name = 'bus-h2'").execute();
	},
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const col = app.findCollectionByNameOrId(name);
			col.fields.getByName('status').values = OLD;
			if (name === 'bus_orders') {
				for (const k of ['listRule', 'viewRule']) {
					if (col[k]) col[k] = String(col[k]).split(SCREEN_NEW).join(SCREEN_OLD);
				}
			}
			app.save(col);
			// Les bons finalisés redeviennent « terminés » (sens d'avant) ; « terminé » v3 (démobilisé) → en cours.
			const q = (sql) => app.db().newQuery(sql).execute();
			q(`UPDATE ${name} SET status = 'en_cours' WHERE status = 'termine'`);
			q(`UPDATE ${name} SET status = 'termine' WHERE status = 'envoye'`);
		}
	}
);
