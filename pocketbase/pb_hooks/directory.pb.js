/// <reference path="../pb_data/types.d.ts" />
// Annuaire v2 (1760005200_directory_v2.js, 5 nov. 2026) : contrôles des requêtes d'API (les imports en ligne de
// commande n'y passent pas : ils écrivent déjà des valeurs issues de `lib/directory.js`).
//   - `directory_contacts` : service inconnu refusé (400 ; vide = « à classer »), zone en majuscules, fonction nettoyée.
//   - `directory_services` : `updated_by` = l'appelant (valeur du corps ignorée), fonctions proposées nettoyées, clé figée
//     (règle) ; suppression refusée tant qu'un contact utilise le service.
// Les hooks JSVM sont isolés : la logique partagée est chargée par require() dans chaque callback.

onRecordCreateRequest((e) => {
	const dir = require(`${__hooks}/lib/directory.js`);
	const r = e.record;
	const service = dir.clean(r.getString('service'));
	if (service) {
		const found = e.app.findRecordsByFilter('directory_services', 'key = {:k}', '', 1, 0, { k: service });
		if (!found || !found.length) throw new BadRequestError('Service inconnu : choisis un service de la liste.');
	}
	r.set('service', service);
	r.set('function', dir.clean(r.getString('function')).slice(0, dir.FUNCTION_MAX));
	r.set('zone', dir.normZone(r.getString('zone')));
	e.next();
}, 'directory_contacts');

onRecordUpdateRequest((e) => {
	const dir = require(`${__hooks}/lib/directory.js`);
	const r = e.record;
	const service = dir.clean(r.getString('service'));
	// Seul un service CHANGÉ est revérifié : une fiche dont le service a disparu reste modifiable sur ses autres champs.
	if (service && service !== e.record.original().getString('service')) {
		const found = e.app.findRecordsByFilter('directory_services', 'key = {:k}', '', 1, 0, { k: service });
		if (!found || !found.length) throw new BadRequestError('Service inconnu : choisis un service de la liste.');
	}
	r.set('service', service);
	r.set('function', dir.clean(r.getString('function')).slice(0, dir.FUNCTION_MAX));
	r.set('zone', dir.normZone(r.getString('zone')));
	e.next();
}, 'directory_contacts');

onRecordCreateRequest((e) => {
	const dir = require(`${__hooks}/lib/directory.js`);
	const r = e.record;
	const raw = r.getString('functions');
	let list = [];
	try {
		list = raw ? JSON.parse(raw) : [];
	} catch (_) {
		list = null;
	}
	const fns = dir.cleanFunctions(list);
	if (!fns) throw new BadRequestError('Fonctions proposées : une liste de libellés est attendue.');
	r.set('functions', fns);
	r.set('label', dir.clean(r.getString('label')));
	const isUser = e.auth && e.auth.collection().name === 'users';
	r.set('updated_by', isUser ? e.auth.id : '');
	e.next();
}, 'directory_services');

onRecordUpdateRequest((e) => {
	const dir = require(`${__hooks}/lib/directory.js`);
	const r = e.record;
	const raw = r.getString('functions');
	let list = [];
	try {
		list = raw ? JSON.parse(raw) : [];
	} catch (_) {
		list = null;
	}
	const fns = dir.cleanFunctions(list);
	if (!fns) throw new BadRequestError('Fonctions proposées : une liste de libellés est attendue.');
	r.set('functions', fns);
	r.set('label', dir.clean(r.getString('label')));
	const isUser = e.auth && e.auth.collection().name === 'users';
	if (isUser) r.set('updated_by', e.auth.id);
	else r.set('updated_by', e.record.original().getString('updated_by'));
	e.next();
}, 'directory_services');

// `findRecordsByFilter` ne lève pas quand il n'y a aucune ligne : une vraie erreur DB remonte (fail-closed).
onRecordDeleteRequest((e) => {
	const used = e.app.findRecordsByFilter('directory_contacts', 'service = {:k}', '', 1, 0, { k: e.record.getString('key') });
	if (used && used.length)
		throw new BadRequestError('Service utilisé par au moins un contact : change d\'abord le service de ces contacts.');
	e.next();
}, 'directory_services');
