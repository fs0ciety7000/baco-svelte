// Battement des tâches planifiées (supervision Admin › Santé, 11 oct. 2026) : chaque cron passe par `run(app, nom, fn)`,
// qui exécute la tâche, capture son erreur éventuelle (journalisée, jamais relancée : un cron en échec ne doit pas
// arrêter les autres) et met à jour la fiche `cron_runs` du nom. Une erreur d'écriture du battement n'empêche rien.

// Périodicité attendue de chaque tâche (minutes), pour signaler un retard dans la supervision. Tenir à jour avec
// les `cronAdd` des fichiers `*.pb.js`.
const EXPECTED = {
	'train-watches': 2,
	'mission-trains': 3,
	'irail-journal': 5,
	'order-pdf-r2': 5,
	'dicos-stale': 10,
	'pmr-retention': 1440,
	'notifications-purge': 1440,
	'user-sessions-purge': 1440,
	'order-pdf-backup': 1440,
	'journal-retention': 1440,
	'quinyx-retention': 1440,
	'planner-retention': 1440
};

function stamp(ms) {
	return new Date(ms).toISOString().replace('T', ' ');
}

function beat(app, name, startedMs, error) {
	let r;
	try {
		r = app.findFirstRecordByFilter('cron_runs', 'name = {:n}', { n: name });
	} catch (_) {
		r = new Record(app.findCollectionByNameOrId('cron_runs'));
		r.set('name', name);
	}
	const end = Date.now();
	r.set('last_start', stamp(startedMs));
	r.set('last_end', stamp(end));
	r.set('duration_ms', Math.max(0, end - startedMs));
	r.set('ok', !error);
	r.set('runs', (r.getInt('runs') || 0) + 1);
	if (error) {
		r.set('error', String(error).slice(0, 500));
		r.set('last_error_at', stamp(end));
	} else {
		r.set('error', '');
	}
	app.save(r);
}

/** Exécute une tâche planifiée et note son battement. */
function run(app, name, fn) {
	const started = Date.now();
	let error = '';
	try {
		fn();
	} catch (err) {
		error = String(err);
		console.log(`${name} :`, error);
	}
	try {
		beat(app, name, started, error);
	} catch (err) {
		console.log(`battement ${name} :`, String(err));
	}
}

module.exports = { run, beat, EXPECTED };
