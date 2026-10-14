/// <reference path="../pb_data/types.d.ts" />
// Référentiel des relations de trains (14 oct. 2026) : routes internes réservées au serveur Next, qui construit le
// référentiel (GTFS SNCB + Infrabel) et l'écrit ici par lots. Secret CSM_INTERNAL_SECRET (en-tête x-csm-internal,
// comparaison à temps constant, 404 sinon). Logique dans `lib/timetable.js` (les gestionnaires sont isolés).

// État de l'import (app_settings clé « timetable ») : GET le lit, POST y fusionne un correctif.
routerAdd('GET', '/api/csm/timetable/status', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	return e.json(200, t.readStatus($app));
});
routerAdd('POST', '/api/csm/timetable/status', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	return e.json(200, t.writeStatus($app, body.patch || {}));
});

// Chemins Infrabel : upsert par n° de train (le jour observé le plus récent l'emporte), purge au-delà de 60 jours.
routerAdd('POST', '/api/csm/timetable/paths', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	return e.json(200, t.upsertPaths($app, Array.isArray(body.items) ? body.items : []));
});
routerAdd('GET', '/api/csm/timetable/paths', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	return e.json(200, { items: t.listPaths($app) });
});

// Trains et relations : upsert par clé (rien n'est écrit si l'empreinte `sig` n'a pas changé).
routerAdd('POST', '/api/csm/timetable/services', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	return e.json(200, t.upsert($app, 'train_services', Array.isArray(body.items) ? body.items : []));
});
routerAdd('POST', '/api/csm/timetable/relations', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	return e.json(200, t.upsert($app, 'train_relations', Array.isArray(body.items) ? body.items : []));
});

// Fin d'import : supprime les trains et relations absents de la construction du jour (clés reçues).
routerAdd('POST', '/api/csm/timetable/finish', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	const services = Array.isArray(body.services) ? body.services : [];
	const relations = Array.isArray(body.relations) ? body.relations : [];
	if (services.length < 500 || relations.length < 20)
		return e.json(400, { message: 'Construction incomplète : rien supprimé.' });
	return e.json(200, {
		services: t.prune($app, 'train_services', services),
		relations: t.prune($app, 'train_relations', relations)
	});
});

// Référentiel des gares (1760003700) : upsert par l'import (le district d'une fiche modifiée à la main est gardé).
routerAdd('POST', '/api/csm/timetable/stations', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	const body = e.requestInfo().body || {};
	return e.json(200, t.upsertStations($app, Array.isArray(body.items) ? body.items : []));
});

// Districts des gares (nom, nom NL, alias → district), pour l'ingestion DICOS côté Next.
routerAdd('GET', '/api/csm/stations/districts', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	return e.json(200, { items: t.stationDistricts($app) });
});

// Modification par un agent (admin, coordinateur, modérateur : `ptcar:update`) : district, lignes et type. Les autres
// champs sont tenus par l'import. Un district ou des lignes choisis à la main ne sont plus écrasés par l'import
// (`district_manual: false` / `lines_manual: false` dans le corps = retour à l'automatique).
onRecordUpdateRequest((e) => {
	const before = e.record.original();
	const fixed = ['key', 'name', 'name_nl', 'abbr', 'uic', 'country', 'aliases', 'search_key', 'served', 'sig_import', 'lat', 'lon', 'district_suggested', 'suggestion'];
	for (const f of fixed) {
		if (e.record.getString(f) !== before.getString(f)) throw new BadRequestError('Champ tenu par l\'import : ' + f + '.');
	}
	const body = e.requestInfo().body || {};
	if (body.district_manual === false) e.record.set('district_manual', false);
	else if (e.record.getString('district') !== before.getString('district')) {
		e.record.set('district_manual', true);
		e.record.set('district_suggested', '');
		e.record.set('suggestion', '');
	}
	if (body.lines_manual === false) e.record.set('lines_manual', false);
	else if (e.record.getString('lines') !== before.getString('lines')) e.record.set('lines_manual', true);
	e.next();
}, 'stations');

// Propositions de district (gares sans district) : recalculées par l'import et après une attribution.
routerAdd('POST', '/api/csm/stations/suggest', (e) => {
	const t = require(`${__hooks}/lib/timetable.js`);
	if (!t.allowed(e)) return e.json(404, { message: 'Not found.' });
	return e.json(200, t.suggestDistricts($app));
});
