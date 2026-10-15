/// <reference path="../pb_data/types.d.ts" />
// Planificateur de tâches PMR (15 oct. 2026, `1760004900_planner.js`). Les règles décident QUI écrit QUOI ; ce hook :
//   - pose les auteurs (`created_by` à la création, `updated_by` à chaque écriture) d'après le compte appelant — une
//     valeur envoyée est ignorée (superuser : rien n'est posé) ;
//   - complète la fin (= début si absente) et refuse une fin avant le début ;
//   - garde l'attribution cohérente : « agent » exige un agent Quinyx, une autre destination n'en a pas ; une tâche
//     attribuée ou faite a une destination, une tâche « à attribuer » n'en a pas (une annulée garde la sienne : le trou
//     reste visible) ;
//   - (audit du 15 oct. 2026, `1760004910`) refuse un agent qui n'est pas un agent de gare (`quinyx_agents.purpose`),
//     un jour hors J-2 → J+60 pour une tâche manuelle / de modèle, efface « Modifiée par DICOS » (`dicos_changed`)
//     quand un planificateur réattribue ou marque « faite », masque `note` / `label` au compte de service.
// Rappel (CLAUDE.md §7) : une fonction déclarée en tête de fichier n'est pas visible dans un gestionnaire → code répété.

onRecordCreateRequest((e) => {
	const r = e.record;
	const user = e.auth && e.auth.collection().name === 'users' ? e.auth.id : '';
	if (user) {
		r.set('created_by', user);
		r.set('updated_by', user);
	}
	if (!r.getString('end')) r.set('end', r.getString('start'));
	if (r.getString('end') < r.getString('start')) throw new BadRequestError('La fin de la tâche précède son début.');
	const kind = r.getString('assignee_kind');
	if (kind !== 'agent') r.set('assignee_agent', '');
	if (kind === 'agent' && !r.getString('assignee_agent')) throw new BadRequestError('Agent de gare manquant.');
	if (!kind) r.set('assignee_label', '');
	const status = r.getString('status');
	if (!kind && (status === 'attribuee' || status === 'faite')) throw new BadRequestError('Tâche sans destination : elle ne peut pas être attribuée.');
	if (kind && status === 'a_attribuer') throw new BadRequestError('Tâche déjà attribuée : statut « à attribuer » impossible.');
	const lib = require(`${__hooks}/lib/planner.js`);
	lib.checkStationAgent(e.app, r);
	lib.checkManualDay(r);
	if (user && e.auth.getString('role') !== 'connector') r.set('dicos_changed', false);
	e.next();
}, 'planner_tasks');

onRecordUpdateRequest((e) => {
	const r = e.record;
	const orig = r.original();
	const user = e.auth && e.auth.collection().name === 'users' ? e.auth.id : '';
	r.set('created_by', orig.getString('created_by'));
	if (user) r.set('updated_by', user);
	else r.set('updated_by', orig.getString('updated_by'));
	if (!r.getString('end')) r.set('end', r.getString('start'));
	if (r.getString('end') < r.getString('start')) throw new BadRequestError('La fin de la tâche précède son début.');
	const kind = r.getString('assignee_kind');
	if (kind !== 'agent') r.set('assignee_agent', '');
	if (kind === 'agent' && !r.getString('assignee_agent')) throw new BadRequestError('Agent de gare manquant.');
	if (!kind) r.set('assignee_label', '');
	const status = r.getString('status');
	if (!kind && (status === 'attribuee' || status === 'faite')) throw new BadRequestError('Tâche sans destination : elle ne peut pas être attribuée.');
	if (kind && status === 'a_attribuer') throw new BadRequestError('Tâche déjà attribuée : statut « à attribuer » impossible.');
	const lib = require(`${__hooks}/lib/planner.js`);
	// Agent de gare contrôlé quand l'attribution change (un agent passé « équipe » depuis ne bloque pas une note).
	if (kind === 'agent' && (orig.getString('assignee_kind') !== 'agent' || orig.getString('assignee_agent') !== r.getString('assignee_agent')))
		lib.checkStationAgent(e.app, r);
	if (r.getString('day') !== orig.getString('day')) lib.checkManualDay(r);
	// « Modifiée par DICOS » effacé quand un planificateur réattribue (destination envoyée) ou marque « faite ».
	if (user && e.auth.getString('role') !== 'connector') {
		const body = e.requestInfo().body || {};
		const reassigned = ['assignee_kind', 'assignee_agent', 'assignee_label'].some((k) => body[k] !== undefined);
		if (reassigned || (status === 'faite' && orig.getString('status') !== 'faite')) r.set('dicos_changed', false);
	}
	e.next();
}, 'planner_tasks');

// Le compte de service (ingestion DICOS) ne lit jamais le libellé ni la note saisis par les agents.
onRecordEnrich((e) => {
	const auth = e.requestInfo && e.requestInfo.auth;
	if (auth && !auth.isSuperuser() && auth.getString('role') === 'connector') e.record.hide('note', 'label');
	e.next();
}, 'planner_tasks');

// Valeur par défaut des nouveaux champs `purpose` (une règle ou un filtre sur une valeur vide se trompe sinon).
onRecordCreateRequest((e) => {
	if (!e.record.getString('purpose')) e.record.set('purpose', 'equipe');
	e.next();
}, 'quinyx_groups', 'quinyx_agents');

// Conservation (à valider DPO, docs/DPO-CONSERVATION.md) : tâches supprimées 90 jours après leur jour (comme les
// prestations Quinyx). Chaque nuit à 3 h 35 UTC.
cronAdd('planner-retention', '35 3 * * *', () => {
	require(`${__hooks}/lib/heartbeat.js`).run($app, 'planner-retention', () => {
		const day = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
		$app.db().newQuery('DELETE FROM planner_tasks WHERE day < {:d}').bind({ d: day }).execute();
	});
});
