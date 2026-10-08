// Logique PMR partagée par les hooks et l'import (miroir de web/src/lib/pmr/*.ts, qui sert à l'affichage).

// Prestations : prévue → réalisée / annulée / absent ; retour à « prévue » (rétablir) depuis les trois.
const TRANSITIONS = {
	prevue: ['realisee', 'annulee', 'absent'],
	realisee: ['prevue'],
	annulee: ['prevue'],
	absent: ['prevue']
};

/** Période d'une heure « HH:MM » (mêmes bornes que la B201). */
function periodOf(time) {
	const h = parseInt(String(time || '').slice(0, 2), 10);
	if (isNaN(h)) return '';
	if (h >= 6 && h < 13) return 'matin';
	if (h >= 13 && h < 21) return 'apres_midi';
	return 'nuit';
}

function norm(s) {
	return String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toUpperCase();
}

/** Zone d'une gare d'après le référentiel `pmr_zones.stations` ; '' si inconnue. */
function zoneFor(app, station) {
	const s = norm(station);
	if (!s) return '';
	for (const z of app.findAllRecords('pmr_zones')) {
		let list = [];
		try {
			list = JSON.parse(z.getString('stations') || '[]');
		} catch (_) {
			list = [];
		}
		if (Array.isArray(list) && list.some((x) => norm(x) === s)) return z.id;
	}
	return '';
}

/**
 * Analyse d'une ligne DICOS de BACO (« 1234-56-78-9012 1 CRF OUT E2134 à 16h42 … ») : une prestation par
 * segment IN / OUT (aller-retour = deux segments). Les mots restants (souvent un nom) ne sont PAS repris.
 */
function parseDicos(text) {
	const t = String(text || '');
	const ref = (/(\d{4}-\d{2}-\d{2}-\d{4})/.exec(t) || [])[1] || '';
	const head = /(?:^|[\s,:])(\d{1,2})\s*(NV|CRF|CRE|CRP|MR|CR)\b/i.exec(t);
	const pax = head ? parseInt(head[1], 10) : 1;
	let type = head ? head[2].toUpperCase() : '';
	if (type === 'CR') type = 'AUTRE';
	const segs = [];
	const re = /\b(IN|OUT)\s*(E\s*)?(\d{2,5})\s*(?:à|a|\))\s*(\d{1,2})\s*h\s*(\d{2})/gi;
	let m;
	while ((m = re.exec(t))) {
		if (parseInt(m[4], 10) > 23 || parseInt(m[5], 10) > 59) continue;
		segs.push({
			direction: m[1].toUpperCase() === 'IN' ? 'arrivee' : 'depart',
			train: (m[2] ? 'E' : '') + m[3],
			time: m[4].padStart(2, '0') + ':' + m[5]
		});
	}
	// Repli (train avant le sens, ou sans IN / OUT) : premier train, premier sens, première heure.
	if (segs.length === 0) {
		const time = /(\d{1,2})\s*h\s*(\d{2})/.exec(t);
		if (time && parseInt(time[1], 10) < 24 && parseInt(time[2], 10) < 60) {
			const dir = /\b(IN|OUT)\b/i.exec(t);
			const train = /\bE\s*(\d{2,5})\b/.exec(t);
			segs.push({
				direction: dir ? (dir[1].toUpperCase() === 'IN' ? 'arrivee' : 'depart') : '',
				train: train ? 'E' + train[1] : '',
				time: time[1].padStart(2, '0') + ':' + time[2]
			});
		}
	}
	return { ref: ref, pax: pax > 0 && pax < 50 ? pax : 1, type: type, segments: segs };
}

/** Ligne d'historique `pmr_events` (écrite par les hooks seulement). */
function event(app, kind, record, field, from, to, auth, note) {
	const ev = new Record(app.findCollectionByNameOrId('pmr_events'));
	ev.set('kind', kind);
	ev.set('record', record);
	ev.set('field', field);
	ev.set('from', String(from || '').slice(0, 200));
	ev.set('to', String(to || '').slice(0, 200));
	if (auth && !auth.isSuperuser()) ev.set('by', auth.id);
	ev.set('note', String(note || '').slice(0, 500));
	ev.set('at', new Date().toISOString().replace('T', ' '));
	app.save(ev);
}

module.exports = { TRANSITIONS, periodOf, zoneFor, parseDicos, norm, event };
