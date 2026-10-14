/// <reference path="../pb_data/types.d.ts" />
// Réseau (1760004800, 15 oct. 2026) : routes internes du serveur Next (secret CSM_INTERNAL_SECRET, 404 sinon) pour les
// passages à niveau Infrabel et les zones SPI. Logique dans `lib/network.js` (les gestionnaires sont isolés).

routerAdd('GET', '/api/csm/network/state', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const n = require(`${__hooks}/lib/network.js`);
	return e.json(200, n.state($app));
});

routerAdd('POST', '/api/csm/network/zones', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const n = require(`${__hooks}/lib/network.js`);
	const body = e.requestInfo().body || {};
	return e.json(200, n.setStationZones($app, Array.isArray(body.items) ? body.items : []));
});

routerAdd('POST', '/api/csm/network/crossings', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const n = require(`${__hooks}/lib/network.js`);
	const body = e.requestInfo().body || {};
	return e.json(200, n.upsertCrossings($app, Array.isArray(body.items) ? body.items : [], String(body.day || '')));
});

routerAdd('POST', '/api/csm/network/crossing-zones', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const n = require(`${__hooks}/lib/network.js`);
	const body = e.requestInfo().body || {};
	return e.json(200, n.setCrossingZones($app, Array.isArray(body.items) ? body.items : []));
});

routerAdd('POST', '/api/csm/network/crossings/finish', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const n = require(`${__hooks}/lib/network.js`);
	const body = e.requestInfo().body || {};
	return e.json(200, n.finishCrossings($app, String(body.day || ''), body.seen));
});

// PN modifié par un agent (Carte PN, administration) : une zone changée devient « manuelle » (jamais recalculée) ; corps
// `zone_auto: true` = retour au calcul.
onRecordUpdateRequest((e) => {
	const before = e.record.original();
	if (e.hasSuperuserAuth()) return e.next();
	const body = e.requestInfo().body || {};
	if (body.zone_auto === true) e.record.set('zone_source', '');
	else if (e.record.getString('zone') !== before.getString('zone')) e.record.set('zone_source', e.record.getString('zone') ? 'manuel' : '');
	// BK saisie par l'équipe : n'est plus une estimation (jamais recalculée ensuite).
	if (e.record.getFloat('bk') !== before.getFloat('bk')) e.record.set('bk_estimated', false);
	e.next();
}, 'level_crossings');
onRecordCreateRequest((e) => {
	if (!e.hasSuperuserAuth() && e.record.getString('zone')) e.record.set('zone_source', 'manuel');
	e.next();
}, 'level_crossings');

// Zone SPI d'une gare choisie à la main (Administration › Référentiels › Zones SPI) : `spi_zone_source = manuel` ; corps
// `spi_zone_auto: true` = retour au calcul (la zone est recalculée au prochain passage).
onRecordUpdateRequest((e) => {
	const before = e.record.original();
	const body = e.requestInfo().body || {};
	if (body.spi_zone_auto === true) e.record.set('spi_zone_source', '');
	else if (e.record.getString('spi_zone') !== before.getString('spi_zone')) e.record.set('spi_zone_source', 'manuel');
	else e.record.set('spi_zone_source', before.getString('spi_zone_source'));
	if (e.record.getString('spi_zone')) {
		try {
			$app.findFirstRecordByData('spi_zones', 'code', e.record.getString('spi_zone'));
		} catch (_) {
			throw new BadRequestError('Zone SPI inconnue.');
		}
	}
	e.next();
}, 'stations');
