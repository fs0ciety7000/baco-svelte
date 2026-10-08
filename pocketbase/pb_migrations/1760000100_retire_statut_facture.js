/// <reference path="../pb_data/types.d.ts" />
// Décision utilisateur du 8 octobre 2026 : une commande dont l'envoi est confirmé est facturée d'office.
// Le statut « facture » disparaît du cycle : brouillon → envoyé → confirmé → en cours → terminé / annulé.

const STATUS = ['brouillon', 'envoye', 'confirme', 'en_cours', 'termine', 'annule'];

migrate(
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			// Par sécurité, une commande déjà « facture » redevient « terminé » avant le changement de liste.
			app.db().newQuery(`UPDATE ${name} SET status = 'termine' WHERE status = 'facture'`).execute();
			const col = app.findCollectionByNameOrId(name);
			col.fields.getByName('status').values = STATUS;
			app.save(col);
		}
	},
	(app) => {
		for (const name of ['bus_orders', 'taxi_orders']) {
			const col = app.findCollectionByNameOrId(name);
			col.fields.getByName('status').values = [...STATUS.slice(0, 5), 'facture', 'annule'];
			app.save(col);
		}
	}
);
