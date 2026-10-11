/// <reference path="../pb_data/types.d.ts" />
// Archives des bons (demande du 11 oct. 2026) : routes internes réservées à Next (secret CSM_INTERNAL_SECRET, en-tête
// x-csm-internal, comparaison à temps constant ; coupées sans secret de 32 caractères au moins), envoi R2 et sauvegarde.
// NB : les gestionnaires s'exécutent hors de la portée du fichier : contrôle répété, logique dans `lib/archives.js`.

// PDF d'un bon terminé (multipart : kind, order_id, reference, route, service_day, district, generated_by, file).
// Une fiche par bon (remplacée si le bon est rouvert puis terminé de nouveau). Rend la main tout de suite : la copie R2
// est faite par le cron `order-pdf-r2` (la clôture d'un bon n'attend jamais R2).
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
	let oldKey = '';
	try {
		rec = $app.findFirstRecordByFilter('order_pdfs', 'kind = {:k} && order_id = {:o}', { k: kind, o: orderId });
		oldKey = rec.getString('r2_key');
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
	rec.set('content_at', a.now());
	rec.set('r2_key', '');
	rec.set('r2_at', '');
	rec.set('r2_error', '');
	rec.set('r2_tried_at', '');
	$app.save(rec);
	// Bon re-terminé avec une autre référence ou date : l'ancienne copie R2 est retirée (la nouvelle part au cron).
	if (oldKey && oldKey !== a.pdfKey(rec)) a.deleteR2(oldKey);
	return e.json(200, { id: rec.id });
});

// Sauvegarde à la demande (bouton « Sauvegarder maintenant », admin) : UN mois par appel (mémoire bornée) — le mois
// demandé, sinon le plus récent des mois à refaire. Renvoie le nombre de mois encore à refaire.
routerAdd('POST', '/api/csm/archives/backup', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const a = require(`${__hooks}/lib/archives.js`);
	const body = e.requestInfo().body || {};
	const month = String(body.month || '');
	const stale = a.staleMonths($app, 1000);
	const target = /^\d{4}-\d{2}$/.test(month) ? month : stale[0];
	if (!target) return e.json(200, { months: [], remaining: 0, r2: !!a.r2Config() });
	try {
		const count = a.backupMonth($app, target);
		return e.json(200, {
			months: [{ month: target, count: count }],
			remaining: stale.filter((m) => m !== target).length,
			r2: !!a.r2Config()
		});
	} catch (err) {
		return e.json(400, { message: String(err).slice(0, 200) });
	}
});

// Archive supprimée (droit archives:delete) : sa copie R2 est retirée ; le zip du mois est refait la nuit suivante.
onRecordAfterDeleteSuccess((e) => {
	const a = require(`${__hooks}/lib/archives.js`);
	a.deleteR2(e.record.getString('r2_key'));
	e.next();
}, 'order_pdfs');

// Toutes les 5 minutes : copies R2 en attente (20 PDF et 2 zips au plus par passage, par ancienneté d'essai).
cronAdd('order-pdf-r2', '*/5 * * * *', () => {
	const a = require(`${__hooks}/lib/archives.js`);
	try {
		a.syncR2($app, 20, 2);
	} catch (err) {
		console.log('archives : rattrapage R2 en échec :', String(err));
	}
});

// Chaque nuit (1 h UTC, 2-3 h à Bruxelles) : zip des mois à refaire, 6 au plus, chacun isolé (un mois en échec ne
// bloque pas les autres).
cronAdd('order-pdf-backup', '0 1 * * *', () => {
	const a = require(`${__hooks}/lib/archives.js`);
	let months = [];
	try {
		months = a.staleMonths($app, 6);
	} catch (err) {
		console.log('archives : liste des mois en échec :', String(err));
	}
	for (const m of months) {
		try {
			console.log(`archives : sauvegarde ${m} (${a.backupMonth($app, m)} PDF)`);
		} catch (err) {
			console.log(`archives : sauvegarde ${m} en échec :`, String(err));
		}
	}
});
