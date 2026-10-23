/// <reference path="../pb_data/types.d.ts" />
// Horaires Quinyx (14 oct. 2026, `1760004200_quinyx.js`). Conservation proposée (à valider DPO,
// docs/DPO-CONSERVATION.md) : prestations supprimées 90 jours après leur date ; agent Quinyx sans prestation et non vu
// depuis 180 jours supprimé (son rattachement à un compte CSM avec lui). Services non pourvus (`1760005000`) et postes couverts « +SE / +SO » (`1760005010`), aucune donnée
// personnelle, exportés par mois / année) : gardés 2 ans. Chaque nuit à 3 h 25 UTC.
cronAdd('quinyx-retention', '25 3 * * *', () => {
	require(`${__hooks}/lib/heartbeat.js`).run($app, 'quinyx-retention', () => {
		const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
		$app.db().newQuery('DELETE FROM quinyx_shifts WHERE day < {:d}').bind({ d: day(90) }).execute();
		$app.db().newQuery('DELETE FROM quinyx_open_shifts WHERE day < {:d}').bind({ d: day(730) }).execute();
		$app.db().newQuery('DELETE FROM quinyx_covers WHERE day < {:d}').bind({ d: day(730) }).execute();
		$app
			.db()
			.newQuery(
				"DELETE FROM quinyx_agents WHERE id NOT IN (SELECT agent FROM quinyx_shifts) AND (last_seen = '' OR last_seen < {:at})"
			)
			.bind({ at: `${day(180)} 00:00:00.000Z` })
			.execute();
	});
});
