/// <reference path="../pb_data/types.d.ts" />
// Archives des bons (demande du 11 oct. 2026) : routes internes réservées à Next (secret CSM_INTERNAL_SECRET, en-tête
// x-csm-internal, comparaison à temps constant ; coupées sans secret de 32 caractères au moins) et sauvegarde de nuit.
// NB : les gestionnaires s'exécutent hors de la portée du fichier : contrôle répété, logique dans `lib/archives.js`.

// PDF d'un bon terminé (multipart : kind, order_id, reference, route, service_day, district, generated_by, file).
// Une fiche par bon (remplacée si le bon est rouvert puis terminé de nouveau), puis copie dans R2.
routerAdd('POST', '/api/csm/archives/store', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const a = require(`${__hooks}/lib/archives.js`);
	const body = e.requestInfo().body || {};
	const kind = String(body.kind || '');
	const orderId = String(body.order_id || '');
	if ((kind !== 'bus' && kind !== 'taxi') || !/^[a-z0-9-]{15,36}$/.test(orderId))
		return e.json(400, { message: 'Bon invalide.' });
	const files = e.findUploadedFiles('file');
	if (!files || files.length !== 1) return e.json(400, { message: 'PDF manquant.' });
	let rec;
	try {
		rec = $app.findFirstRecordByFilter('order_pdfs', 'kind = {:k} && order_id = {:o}', { k: kind, o: orderId });
	} catch (_) {
		rec = new Record($app.findCollectionByNameOrId('order_pdfs'));
		rec.set('kind', kind);
		rec.set('order_id', orderId);
	}
	const day = String(body.service_day || '');
	rec.set('reference', String(body.reference || '').slice(0, 120));
	rec.set('route', String(body.route || '').slice(0, 300));
	rec.set('service_day', /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '');
	rec.set('district', String(body.district || '').slice(0, 20));
	const by = String(body.generated_by || '');
	rec.set('generated_by', /^[a-z0-9-]{15,36}$/.test(by) ? by : '');
	rec.set('file', files[0]);
	rec.set('r2_key', '');
	rec.set('r2_at', '');
	rec.set('r2_error', '');
	$app.save(rec);
	const r2 = a.pushR2($app, rec, a.pdfKey(rec));
	return e.json(200, { id: rec.id, r2: r2 });
});

// Sauvegarde à la demande (bouton de la page Archives, admin) : les mois périmés, ou un mois donné.
routerAdd('POST', '/api/csm/archives/backup', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const a = require(`${__hooks}/lib/archives.js`);
	const body = e.requestInfo().body || {};
	const month = String(body.month || '');
	const months = /^\d{4}-\d{2}$/.test(month) ? [month] : a.staleMonths($app, 24);
	const done = [];
	for (const m of months) done.push({ month: m, count: a.backupMonth($app, m) });
	return e.json(200, { months: done, r2: !!a.r2Config() });
});

// Chaque nuit (1 h UTC, 2-3 h à Bruxelles) : zip des mois dont un PDF a changé (6 au plus par passage).
cronAdd('order-pdf-backup', '0 1 * * *', () => {
	const a = require(`${__hooks}/lib/archives.js`);
	try {
		for (const m of a.staleMonths($app, 6)) {
			const n = a.backupMonth($app, m);
			console.log(`archives : sauvegarde ${m} (${n} PDF)`);
		}
		// Rattrapage R2 : PDF archivés pendant une panne d'R2 (50 par nuit).
		if (a.r2Config()) {
			for (const r of $app.findRecordsByFilter('order_pdfs', 'r2_at = ""', 'created', 50, 0)) a.pushR2($app, r, a.pdfKey(r));
		}
	} catch (err) {
		console.log('archives : sauvegarde de nuit en échec :', String(err));
	}
});
