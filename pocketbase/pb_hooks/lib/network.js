// Réseau (1760004800) : écritures des routes internes de `network.pb.js` — zones SPI des gares, passages à niveau
// Infrabel. Le calcul (rapprochement des PN, zone de chaque gare, BK estimée) est fait par le serveur Next
// (`web/src/lib/network/`) ; ici, seulement des écritures bornées qui ne remplacent jamais une saisie de l'équipe.

const ZONE_RE = /^[A-Z]{2,6}$/;
const LINE_RE = /^L\.[0-9]{1,3}[A-Z]?$/;
const NUMBER_RE = /^[0-9]{1,4}( bis| ter|[A-Z]{1,8})?$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATION_SOURCES = ['carte', 'graphe', 'proximite'];

function str(v, max) {
	return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}
function parseJson(raw, fallback) {
	try {
		const v = JSON.parse(raw || '');
		return v == null ? fallback : v;
	} catch (_) {
		return fallback;
	}
}

/** État lu par le calcul : gares (coordonnées, lignes, zone), lignes (gares dans l'ordre), PN, zones. */
function state(app) {
	const stations = app.findAllRecords('stations').map((r) => ({
		key: r.getString('key'),
		name: r.getString('name'),
		kind: r.getString('kind'),
		lat: r.getFloat('lat'),
		lon: r.getFloat('lon'),
		lines: parseJson(r.getString('lines'), []),
		zone: r.getString('spi_zone'),
		source: r.getString('spi_zone_source')
	}));
	const lines = app.findAllRecords('rail_lines').map((r) => ({
		line: r.getString('line'),
		stations: parseJson(r.getString('stations'), [])
	}));
	const crossings = app.findAllRecords('level_crossings').map((r) => ({
		id: r.id,
		line: r.getString('line'),
		number: r.getString('number'),
		lat: r.getFloat('lat'),
		lon: r.getFloat('lon'),
		bk: r.getFloat('bk'),
		bkEstimated: r.getBool('bk_estimated'),
		bkSource: r.getString('bk_source'),
		zone: r.getString('zone'),
		zoneSource: r.getString('zone_source'),
		source: r.getString('source'),
		infrabelId: r.getString('infrabel_id'),
		active: r.getBool('active'),
		infrabelSeen: r.getString('infrabel_seen')
	}));
	const zones = app.findAllRecords('spi_zones').map((r) => ({ code: r.getString('code'), district: r.getString('district') }));
	return { stations, lines, crossings, zones };
}

/** Zones des gares : posées sauf choix manuel ; rien n'est écrit si la valeur est identique. */
function setStationZones(app, items) {
	const valid = {};
	for (const z of app.findAllRecords('spi_zones')) valid[z.getString('code')] = true;
	let saved = 0;
	let same = 0;
	let manual = 0;
	app.runInTransaction((tx) => {
		for (const it of items.slice(0, 5000)) {
			const key = str(it.key, 120);
			const zone = str(it.zone, 6);
			const source = STATION_SOURCES.indexOf(it.source) >= 0 ? it.source : '';
			if (!key || (zone && (!ZONE_RE.test(zone) || !valid[zone]))) continue;
			let rec;
			try {
				rec = tx.findFirstRecordByData('stations', 'key', key);
			} catch (_) {
				continue;
			}
			if (rec.getString('spi_zone_source') === 'manuel') {
				manual++;
				continue;
			}
			if (rec.getString('spi_zone') === zone && rec.getString('spi_zone_source') === (zone ? source : '')) {
				same++;
				continue;
			}
			rec.set('spi_zone', zone);
			rec.set('spi_zone_source', zone ? source : '');
			tx.save(rec);
			saved++;
		}
	});
	return { saved, same, manual };
}

/**
 * PN Infrabel : `id` = PN existant rapproché (on complète sans écraser : adresse jamais touchée, position et BK seulement
 * si absentes ou estimées, zone seulement si elle n'a été ni reprise de BACO ni choisie à la main), sinon recherche par
 * `infrabelId`, sinon création (source « infrabel »). Un couple ligne + numéro déjà pris n'est pas recréé (conflit).
 */
function upsertCrossings(app, items, day) {
	if (!DAY_RE.test(day || '')) throw new BadRequestError('Jour invalide.');
	const col = app.findCollectionByNameOrId('level_crossings');
	const out = { created: 0, updated: 0, same: 0, conflicts: 0, invalid: 0 };
	app.runInTransaction((tx) => {
		for (const it of items.slice(0, 3000)) {
			const infrabelId = str(it.infrabelId, 40);
			const line = str(it.line, 20);
			const number = str(it.number, 20);
			const lat = num(it.lat);
			const lon = num(it.lon);
			if (!infrabelId || !LINE_RE.test(line) || !NUMBER_RE.test(number) || lat < 49 || lat > 52 || lon < 2 || lon > 7) {
				out.invalid++;
				continue;
			}
			let rec = null;
			if (it.id) {
				try {
					rec = tx.findRecordById('level_crossings', str(it.id, 20));
				} catch (_) {}
			}
			if (!rec) {
				try {
					rec = tx.findFirstRecordByData('level_crossings', 'infrabel_id', infrabelId);
				} catch (_) {}
			}
			const isNew = !rec;
			if (isNew) {
				const taken = tx.findRecordsByFilter('level_crossings', 'line = {:l} && number = {:n}', '', 1, 0, { l: line, n: number });
				if (taken.length) {
					out.conflicts++;
					continue;
				}
				rec = new Record(col);
				rec.set('line', line);
				rec.set('number', number);
				rec.set('source', 'infrabel');
				rec.set('active', true);
			} else {
				const other = tx.findRecordsByFilter('level_crossings', 'infrabel_id = {:i} && id != {:id}', '', 1, 0, { i: infrabelId, id: rec.id });
				if (other.length) {
					out.conflicts++;
					continue;
				}
			}
			const before = JSON.stringify([
				rec.getString('infrabel_id'), rec.getFloat('lat'), rec.getFloat('lon'), rec.getString('commune'), rec.getString('signal'),
				rec.getFloat('bk'), rec.getBool('bk_estimated'), rec.getString('bk_source'), rec.getString('zone'), rec.getString('zone_source'), rec.getBool('active')
			]);
			rec.set('infrabel_id', infrabelId);
			if (isNew || !rec.getFloat('lat') || rec.getString('source') === 'infrabel') {
				rec.set('lat', Math.round(lat * 1e6) / 1e6);
				rec.set('lon', Math.round(lon * 1e6) / 1e6);
			}
			rec.set('commune', str(it.commune, 120));
			rec.set('signal', str(it.signal, 80));
			// BK calculée (bornes kilométriques, sinon estimée) : jamais à la place d'une BK relevée (BACO, équipe).
			const bk = num(it.bk);
			const bkSource = it.bkSource === 'bornes' ? 'bornes' : it.bkSource === 'estimee' ? 'estimee' : '';
			const computed = !rec.getFloat('bk') || rec.getBool('bk_estimated') || rec.getString('bk_source') !== '';
			if (bk > 0 && bk < 1000 && bkSource && computed) {
				rec.set('bk', Math.round(bk * 1000) / 1000);
				rec.set('bk_source', bkSource);
				rec.set('bk_estimated', bkSource === 'estimee');
			}
			const zone = str(it.zone, 6);
			const zs = rec.getString('zone_source');
			if (zs !== 'baco' && zs !== 'manuel' && (zone === '' || ZONE_RE.test(zone))) {
				rec.set('zone', zone);
				rec.set('zone_source', zone ? 'auto' : '');
			}
			// PN Infrabel, ou PN BACO désactivé parce qu'absent du fichier et de nouveau rapproché : actif.
			if (rec.getString('source') === 'infrabel' || rec.getString('infrabel_seen') === 'absent') rec.set('active', true);
			const after = JSON.stringify([
				rec.getString('infrabel_id'), rec.getFloat('lat'), rec.getFloat('lon'), rec.getString('commune'), rec.getString('signal'),
				rec.getFloat('bk'), rec.getBool('bk_estimated'), rec.getString('bk_source'), rec.getString('zone'), rec.getString('zone_source'), rec.getBool('active')
			]);
			const seenChanged = rec.getString('infrabel_seen') !== day;
			rec.set('infrabel_seen', day);
			if (!isNew && before === after && !seenChanged) {
				out.same++;
				continue;
			}
			tx.save(rec);
			if (isNew) out.created++;
			else if (before === after) out.same++;
			else out.updated++;
		}
	});
	return out;
}

/** Zones des PN sans Infrabel (PN repris de BACO sans zone, PN saisis dans CSM) : même règle de non-écrasement. */
function setCrossingZones(app, items) {
	let saved = 0;
	app.runInTransaction((tx) => {
		for (const it of items.slice(0, 3000)) {
			const zone = str(it.zone, 6);
			if (zone && !ZONE_RE.test(zone)) continue;
			let rec;
			try {
				rec = tx.findRecordById('level_crossings', str(it.id, 20));
			} catch (_) {
				continue;
			}
			const zs = rec.getString('zone_source');
			if (zs === 'baco' || zs === 'manuel') continue;
			if (rec.getString('zone') === zone && zs === (zone ? 'auto' : '')) continue;
			rec.set('zone', zone);
			rec.set('zone_source', zone ? 'auto' : '');
			tx.save(rec);
			saved++;
		}
	});
	return { saved };
}

/**
 * Fin de l'import des PN : les PN créés depuis Infrabel absents du fichier du jour sont désactivés (supprimés ou
 * fermés : jamais effacés, le Journal peut les citer) ; seulement si le fichier en comptait assez.
 */
function finishCrossings(app, day, seen, retire) {
	if (!DAY_RE.test(day || '')) throw new BadRequestError('Jour invalide.');
	if (num(seen) < 1000) return { deactivated: 0, retired: 0, skipped: true };
	const stale = app.findRecordsByFilter('level_crossings', "source = 'infrabel' && active = true && infrabel_seen != {:d}", '', 0, 0, { d: day });
	for (const r of stale) {
		r.set('active', false);
		app.save(r);
	}
	// PN repris de BACO sans pendant Infrabel (décision du 15 oct. 2026) : désactivés, jamais supprimés ; un PN réactivé à
	// la main (`garde`) ou déjà rapproché n'est pas touché.
	let retired = 0;
	for (const id of (Array.isArray(retire) ? retire : []).slice(0, 500)) {
		let r;
		try {
			r = app.findRecordById('level_crossings', str(id, 20));
		} catch (_) {
			continue;
		}
		if (r.getString('source') !== 'baco' || !r.getBool('active') || r.getString('infrabel_id') || r.getString('infrabel_seen') === 'garde') continue;
		r.set('active', false);
		r.set('infrabel_seen', 'absent');
		app.save(r);
		retired++;
	}
	return { deactivated: stale.length, retired };
}

module.exports = { state, setStationZones, upsertCrossings, setCrossingZones, finishCrossings };
