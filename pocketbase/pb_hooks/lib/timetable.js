// Référentiel des relations de trains : écritures des routes internes de `timetable.pb.js` (voir la migration
// 1760003600). Les valeurs reçues viennent du serveur Next (secret interne) : bornées quand même.

const PATH_DAYS = 60;

function allowed(e) {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	return secret.length >= 32 && $security.equal(given, secret);
}

function settingsRecord(app) {
	try {
		return app.findFirstRecordByData('app_settings', 'key', 'timetable');
	} catch (_) {
		const rec = new Record(app.findCollectionByNameOrId('app_settings'));
		rec.set('key', 'timetable');
		rec.set('value', {});
		return rec;
	}
}

function readStatus(app) {
	const rec = settingsRecord(app);
	const raw = rec.getString('value');
	try {
		return raw ? JSON.parse(raw) : {};
	} catch (_) {
		return {};
	}
}

// Verrou : un import « en cours » depuis moins de 30 min en interdit un second (deux copies du serveur, ou planification
// et bouton admin en même temps). Au-delà, l'import est tenu pour interrompu (redéploiement).
const STALE_MS = 30 * 60 * 1000;

function writeStatus(app, patch) {
	const rec = settingsRecord(app);
	const current = readStatus(app);
	if (patch.state === 'running' && current.state === 'running') {
		const started = Date.parse(current.startedAt || '');
		if (started && Date.now() - started < STALE_MS) throw new BadRequestError('Import déjà en cours.');
	}
	const value = Object.assign(current, patch);
	const text = JSON.stringify(value);
	if (text.length > 15000) throw new BadRequestError('État trop volumineux.');
	rec.set('value', value);
	app.save(rec);
	return value;
}

const str = (v, max) => String(v == null ? '' : v).slice(0, max);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

function upsertPaths(app, items) {
	const col = app.findCollectionByNameOrId('train_paths');
	let saved = 0;
	app.runInTransaction((tx) => {
		for (const it of items) {
			const number = Math.floor(Number(it.number));
			const d = day(it.day);
			if (!(number > 0) || !d) continue;
			let rec;
			try {
				rec = tx.findFirstRecordByData('train_paths', 'number', number);
				if (rec.getString('day') > d) continue;
			} catch (_) {
				rec = new Record(col);
				rec.set('number', number);
			}
			rec.set('day', d);
			rec.set('relation', str(it.relation, 40));
			rec.set('direction', str(it.direction, 200));
			rec.set('lines', Array.isArray(it.lines) ? it.lines.slice(0, 80).map((l) => str(l, 12)) : []);
			rec.set(
				'points',
				Array.isArray(it.points)
					? it.points.slice(0, 300).map((p) => {
							const o = { n: str(p && p.n, 120), l: str(p && p.l, 12) };
							if (p && p.k) o.k = str(p.k, 120);
							if (p && Number.isInteger(p.i) && p.i >= 0) o.i = p.i;
							return o;
						})
					: []
			);
			tx.save(rec);
			saved++;
		}
	});
	// Purge : trains plus vus depuis 60 jours (supprimés de l'horaire, ou changement de numérotation en décembre).
	const limit = new Date(Date.now() - PATH_DAYS * 86400000).toISOString().slice(0, 10);
	app.db().newQuery('DELETE FROM train_paths WHERE day < {:d}').bind({ d: limit }).execute();
	const total = app.countRecords('train_paths');
	return { saved, total };
}

function listPaths(app) {
	const out = [];
	const recs = app.findAllRecords('train_paths');
	for (const r of recs) {
		let lines = [];
		let points = [];
		try {
			lines = JSON.parse(r.getString('lines') || '[]');
			points = JSON.parse(r.getString('points') || '[]');
		} catch (_) {}
		out.push({
			number: r.getInt('number'),
			day: r.getString('day'),
			relation: r.getString('relation'),
			direction: r.getString('direction'),
			lines,
			points
		});
	}
	return out;
}

// Champs écrits par collection (nom du champ PocketBase → clé reçue, et borne des textes).
const FIELDS = {
	train_services: {
		number: ['number', 'int'],
		type: ['type', 10],
		relation: ['relation', 40],
		relation_source: ['relationSource', 10],
		series: ['series', 20],
		origin: ['origin', 120],
		terminus: ['terminus', 120],
		days: ['days', 'int'],
		stops: ['stops', 'json'],
		lines: ['lines', 'json'],
		lines_source: ['linesSource', 10],
		first_dep: ['firstDep', 5],
		last_arr: ['lastArr', 5],
		stations_key: ['stationsKey', 10000],
		pass_key: ['passKey', 10000],
		lines_key: ['linesKey', 2000]
	},
	train_relations: {
		relation: ['relation', 40],
		type: ['type', 10],
		label: ['label', 300],
		variants: ['variants', 'json'],
		series: ['series', 'json'],
		lines: ['lines', 'json'],
		numbers: ['numbers', 'json'],
		pattern: ['pattern', 'json'],
		trains: ['trains', 'int'],
		days: ['days', 'int'],
		stations_key: ['stationsKey', 20000],
		lines_key: ['linesKey', 2000]
	}
};

function upsert(app, name, items) {
	const col = app.findCollectionByNameOrId(name);
	const fields = FIELDS[name];
	let saved = 0;
	let same = 0;
	app.runInTransaction((tx) => {
		for (const it of items) {
			const key = str(it.key, name === 'train_relations' ? 300 : 40);
			const sig = str(it.sig, 20);
			if (!key) continue;
			let rec;
			try {
				rec = tx.findFirstRecordByData(name, 'key', key);
				if (sig && rec.getString('sig') === sig) {
					same++;
					continue;
				}
			} catch (_) {
				rec = new Record(col);
				rec.set('key', key);
			}
			for (const f in fields) {
				const [src, kind] = fields[f];
				const v = it[src];
				if (kind === 'int') rec.set(f, Math.max(0, Math.floor(Number(v) || 0)));
				else if (kind === 'json') rec.set(f, v == null ? [] : v);
				else rec.set(f, str(v, kind));
			}
			rec.set('sig', sig);
			tx.save(rec);
			saved++;
		}
	});
	return { saved, same };
}

function prune(app, name, keys) {
	const keep = {};
	for (const k of keys) keep[String(k)] = true;
	let deleted = 0;
	app.runInTransaction((tx) => {
		for (const r of tx.findAllRecords(name)) {
			if (keep[r.getString('key')]) continue;
			tx.delete(r);
			deleted++;
		}
	});
	return { deleted, total: app.countRecords(name) };
}

module.exports = { allowed, readStatus, writeStatus, upsertPaths, listPaths, upsert, prune };
