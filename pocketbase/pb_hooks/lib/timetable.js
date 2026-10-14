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

// --- Référentiel des gares --------------------------------------------------------------------------------------------

const DISTRICTS = ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'];

function upsertStations(app, items) {
	const col = app.findCollectionByNameOrId('stations');
	let saved = 0;
	let same = 0;
	app.runInTransaction((tx) => {
		for (const it of items) {
			const key = str(it.key, 120);
			if (!key || !it.name) continue;
			let rec;
			try {
				rec = tx.findFirstRecordByData('stations', 'key', key);
				if (it.sig && rec.getString('sig_import') === str(it.sig, 20)) {
					same++;
					continue;
				}
			} catch (_) {
				rec = new Record(col);
				rec.set('key', key);
			}
			rec.set('name', str(it.name, 120));
			rec.set('name_nl', str(it.nameNl, 120));
			rec.set('abbr', str(it.abbr, 12));
			rec.set('uic', str(it.uic, 12));
			rec.set('country', str(it.country, 2));
			rec.set('aliases', Array.isArray(it.aliases) ? it.aliases.slice(0, 30).map((a) => str(a, 120)) : []);
			if (!rec.getBool('lines_manual'))
				rec.set('lines', Array.isArray(it.lines) ? it.lines.slice(0, 40).map((a) => str(a, 12)) : []);
			if (!rec.getString('kind') && ['gare', 'pang', 'etranger'].indexOf(it.kind) >= 0) rec.set('kind', it.kind);
			const lat = Number(it.lat);
			const lon = Number(it.lon);
			if (Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0) {
				rec.set('lat', lat);
				rec.set('lon', lon);
			}
			rec.set('search_key', str(it.searchKey, 2000));
			rec.set('served', !!it.served);
			rec.set('sig_import', str(it.sig, 20));
			if (!rec.getBool('district_manual')) rec.set('district', DISTRICTS.indexOf(it.district) >= 0 ? it.district : '');
			tx.save(rec);
			saved++;
		}
	});
	return { saved, same, total: app.countRecords('stations') };
}

function stationDistricts(app) {
	const out = [];
	for (const r of app.findAllRecords('stations')) {
		let aliases = [];
		try {
			aliases = JSON.parse(r.getString('aliases') || '[]');
		} catch (_) {}
		out.push({
			names: [r.getString('name'), r.getString('name_nl')].concat(aliases).filter(Boolean),
			abbr: r.getString('abbr'),
			district: r.getString('district'),
			manual: r.getBool('district_manual')
		});
	}
	return out;
}

module.exports.upsertStations = upsertStations;
module.exports.stationDistricts = stationDistricts;

// Proposition de district pour chaque gare sans district : les 6 gares connues les plus proches (30 km au plus), pondérées
// par la distance et doublées si elles partagent une ligne ; retenue si une majorité de 60 % se dégage (au moins deux
// voisines, ou une seule à moins de 5 km sur la même ligne). Sans coordonnées : district majoritaire des gares connues de
// ses lignes (80 %). Rien n'est appliqué : un coordinateur valide.
function suggestDistricts(app) {
	const recs = app.findAllRecords('stations');
	const rows = recs.map((r) => {
		let lines = [];
		try {
			lines = JSON.parse(r.getString('lines') || '[]');
		} catch (_) {}
		return { r, name: r.getString('name'), d: r.getString('district'), lat: r.getFloat('lat'), lon: r.getFloat('lon'), lines };
	});
	const known = rows.filter((x) => x.d);
	const km = (a, b) => {
		const rad = Math.PI / 180;
		const dLat = (b.lat - a.lat) * rad;
		const dLon = (b.lon - a.lon) * rad;
		const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
		return 12742 * Math.asin(Math.sqrt(h));
	};
	const byLine = {};
	for (const k of known) for (const l of k.lines) (byLine[l] = byLine[l] || {})[k.d] = ((byLine[l] || {})[k.d] || 0) + 1;
	let suggested = 0;
	app.runInTransaction((tx) => {
		for (const x of rows) {
			let sug = '';
			let why = '';
			if (!x.d) {
				if (x.lat) {
					const near = known
						.filter((k) => k.lat)
						.map((k) => ({ k, dist: km(x, k) }))
						.filter((n) => n.dist <= 30)
						.sort((a, b) => a.dist - b.dist)
						.slice(0, 6);
					const score = {};
					let total = 0;
					for (const n of near) {
						const shared = n.k.lines.some((l) => x.lines.indexOf(l) >= 0);
						const w = (1 / (n.dist + 1)) * (shared ? 2 : 1);
						score[n.k.d] = (score[n.k.d] || 0) + w;
						total += w;
					}
					const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
					const sameLineClose = near.length === 1 && near[0].dist < 5 && near[0].k.lines.some((l) => x.lines.indexOf(l) >= 0);
					if (best && total > 0 && score[best] / total >= 0.6 && (near.length >= 2 || sameLineClose)) {
						sug = best;
						why = 'Proche de ' + near.filter((n) => n.k.d === best).slice(0, 3).map((n) => n.k.name + ' (' + Math.round(n.dist) + ' km)').join(', ');
					}
				} else if (x.lines.length) {
					const tally = {};
					let total = 0;
					for (const l of x.lines) for (const d in byLine[l] || {}) {
						tally[d] = (tally[d] || 0) + byLine[l][d];
						total += byLine[l][d];
					}
					const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
					if (best && tally[best] / total >= 0.8) {
						sug = best;
						why = 'Lignes ' + x.lines.join(', ') + ' : ' + tally[best] + ' gares en ' + best;
					}
				}
			}
			if (x.r.getString('district_suggested') === sug && x.r.getString('suggestion') === why) continue;
			x.r.set('district_suggested', sug);
			x.r.set('suggestion', why.slice(0, 300));
			tx.save(x.r);
			if (sug) suggested++;
		}
	});
	const missing = rows.filter((x) => !x.d);
	return { saved: suggested, suggested: missing.filter((x) => x.r.getString('district_suggested')).length, withoutDistrict: missing.length };
}

module.exports.suggestDistricts = suggestDistricts;

// --- Lignes (gares dans l'ordre, 1760003850) --------------------------------------------------------------------------

// Gares d'une ligne `[{ n, a?, km?, b?, g? }]` (import ou correction manuelle), bornées et nettoyées.
function cleanLineStations(list) {
	return (Array.isArray(list) ? list : [])
		.filter((s) => s && typeof s.n === 'string' && s.n.trim())
		.slice(0, 200)
		.map((s) => {
			const o = { n: str(s.n, 120).trim() };
			if (s.a) o.a = str(s.a, 12);
			const km = Number(s.km);
			if (s.km != null && s.km !== '' && Number.isFinite(km)) o.km = Math.round(km * 10) / 10;
			if (Number.isInteger(s.b) && s.b > 0) o.b = Math.min(s.b, 99);
			if (s.g) o.g = 1;
			return o;
		});
}

// Embranchements `[{ b, from, to }]` : seulement ceux qui ont des gares ; `to` = dernière gare de l'embranchement.
function cleanLineBranches(list, stations) {
	const out = [];
	const given = {};
	for (const b of Array.isArray(list) ? list : []) {
		const n = Math.max(1, Math.min(99, Math.floor(Number(b && b.b) || 1)));
		given[n] = { from: str(b && b.from, 120), to: str(b && b.to, 120) };
	}
	const seen = [];
	for (const s of stations) if (s.b && seen.indexOf(s.b) === -1) seen.push(s.b);
	seen.sort((x, y) => x - y);
	for (const n of seen) {
		const own = stations.filter((s) => s.b === n);
		out.push({ b: n, from: given[n] ? given[n].from : '', to: own.length ? own[own.length - 1].n : '' });
	}
	return out;
}

function upsertLines(app, items) {
	const col = app.findCollectionByNameOrId('rail_lines');
	let saved = 0;
	let same = 0;
	app.runInTransaction((tx) => {
		for (const it of items) {
			const line = str(it.line, 12).trim().toUpperCase();
			if (!/^[0-9A-Z]{1,12}$/.test(line)) continue;
			const sig = str(it.sig, 20);
			let rec;
			try {
				rec = tx.findFirstRecordByData('rail_lines', 'line', line);
				if (sig && rec.getString('sig') === sig) {
					same++;
					continue;
				}
			} catch (_) {
				rec = new Record(col);
				rec.set('line', line);
			}
			const stations = cleanLineStations(it.stations);
			const branches = cleanLineBranches(it.branches, stations);
			// Version automatique toujours tenue à jour ; ligne corrigée à la main (`manual`) : affichage inchangé.
			rec.set('stations_auto', stations);
			rec.set('branches_auto', branches);
			rec.set('name_auto', str(it.name, 300));
			if (!rec.getBool('manual')) {
				rec.set('name', str(it.name, 300));
				rec.set('stations', stations);
				rec.set('branches', branches);
				rec.set('count', stations.length);
			}
			rec.set('oriented', !!it.oriented);
			rec.set('sig', sig);
			tx.save(rec);
			saved++;
		}
	});
	return { saved, same, total: app.countRecords('rail_lines') };
}

// Lignes absentes de la construction du jour : supprimées (le nombre minimal est contrôlé par la route).
function pruneLines(app, lines) {
	const keep = {};
	for (const l of lines) keep[String(l)] = true;
	let deleted = 0;
	app.runInTransaction((tx) => {
		for (const r of tx.findAllRecords('rail_lines')) {
			// Ligne corrigée à la main : jamais supprimée par l'import.
			if (keep[r.getString('line')] || r.getBool('manual')) continue;
			tx.delete(r);
			deleted++;
		}
	});
	return { deleted, total: app.countRecords('rail_lines') };
}

module.exports.upsertLines = upsertLines;
module.exports.cleanLineStations = cleanLineStations;
module.exports.cleanLineBranches = cleanLineBranches;
module.exports.pruneLines = pruneLines;
