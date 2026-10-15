/// <reference path="../../pb_data/types.d.ts" />
// Contrôles partagés du planificateur PMR (`planner.pb.js`) : chargés par `require()` dans chaque gestionnaire (une
// fonction de tête de fichier `*.pb.js` n'y est pas visible, CLAUDE.md §7). Les refus LÈVENT une erreur (jamais
// `return e.json(...)` hors du gestionnaire).

const ops = require(`${__hooks}/lib/operations.js`);

/** Jours permis pour une tâche encodée à la main ou tirée d'un modèle : J-2 → J+60 (Bruxelles). */
function manualDayRange() {
	const now = Date.now();
	return {
		from: ops.brusselsDay(new Date(now - 2 * 86400000)),
		to: ops.brusselsDay(new Date(now + 60 * 86400000))
	};
}

/** Refuse un jour hors J-2 → J+60 pour une tâche manuelle / de modèle. */
function checkManualDay(record) {
	const source = record.getString('source');
	if (source !== 'manuel' && source !== 'modele') return;
	const day = record.getString('day');
	const r = manualDayRange();
	if (day < r.from || day > r.to) throw new BadRequestError('Jour hors de la période permise (J-2 à J+60).');
}

/** L'agent d'une attribution « agent » doit être un agent de gare (`quinyx_agents.purpose = gares`). */
function checkStationAgent(app, record) {
	if (record.getString('assignee_kind') !== 'agent') return;
	const id = record.getString('assignee_agent');
	let agent = null;
	try {
		agent = app.findRecordById('quinyx_agents', id);
	} catch (_) {
		agent = null;
	}
	if (!agent || agent.getString('purpose') !== 'gares') throw new BadRequestError('Choisis un agent de gare.');
}

module.exports = { manualDayRange, checkManualDay, checkStationAgent };
