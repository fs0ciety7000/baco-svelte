/// <reference path="../pb_data/types.d.ts" />
// Supervision (Admin › Santé, 11 oct. 2026) : routes internes réservées à Next (secret CSM_INTERNAL_SECRET, en-tête
// x-csm-internal, comparaison à temps constant ; coupées sans secret de 32 caractères au moins). Le serveur Next ne les
// appelle que pour un administrateur (admin / sysop). Aucune donnée personnelle dans les réponses.
// NB : les gestionnaires s'exécutent hors de la portée du fichier : contrôle du secret répété, logique dans `lib/`.

// État : dernière sauvegarde PocketBase, battements des tâches planifiées, SMTP, archives en attente de copie R2,
// versions de l'extension DICOS en circulation, conservation du Journal.
routerAdd('GET', '/api/csm/health', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	const hb = require(`${__hooks}/lib/heartbeat.js`);
	const out = { at: new Date().toISOString() };

	// Sauvegardes (stockage réglé : volume ou S3/R2). Noms `@auto_pb_backup_*` et sauvegardes manuelles.
	try {
		const fsys = $app.newBackupsFilesystem();
		try {
			const files = fsys.list('') || [];
			const list = files
				.map((f) => {
					let modified = String(f.modTime);
					try {
						modified = new Date(f.modTime.unixMilli()).toISOString();
					} catch (_) {
						// Format Go par défaut gardé.
					}
					return { key: String(f.key), size: Number(f.size) || 0, modified: modified };
				})
				.filter((f) => /\.zip$/i.test(f.key));
			list.sort((a, b) => (a.modified < b.modified ? 1 : -1));
			out.backups = { count: list.length, last: list[0] || null, s3: !!$app.settings().backups.s3.enabled };
		} finally {
			fsys.close();
		}
	} catch (err) {
		out.backups = { error: String(err).slice(0, 200) };
	}

	// Tâches planifiées : battements + périodicité attendue.
	try {
		const rows = $app.findRecordsByFilter('cron_runs', '', 'name', 100, 0);
		const seen = {};
		out.crons = rows.map((r) => {
			seen[r.getString('name')] = true;
			return {
				name: r.getString('name'),
				lastStart: r.getString('last_start'),
				lastEnd: r.getString('last_end'),
				ok: r.getBool('ok'),
				error: r.getString('error'),
				lastErrorAt: r.getString('last_error_at'),
				durationMs: r.getInt('duration_ms'),
				runs: r.getInt('runs'),
				expectedMin: hb.EXPECTED[r.getString('name')] || 0
			};
		});
		for (const name of Object.keys(hb.EXPECTED)) {
			if (!seen[name]) out.crons.push({ name: name, lastStart: '', lastEnd: '', ok: false, error: '', lastErrorAt: '', durationMs: 0, runs: 0, expectedMin: hb.EXPECTED[name] });
		}
	} catch (err) {
		out.crons = [];
		out.cronsError = String(err).slice(0, 200);
	}

	// SMTP (mot de passe oublié, campagnes).
	try {
		out.smtp = !!$app.settings().smtp.enabled;
	} catch (_) {
		out.smtp = false;
	}

	const count = (sql) => {
		const row = new DynamicModel({ n: 0 });
		$app.db().newQuery(sql).one(row);
		return row.n;
	};

	// Archives des bons : copies R2 en attente / en erreur.
	try {
		const a = require(`${__hooks}/lib/archives.js`);
		out.archives = {
			r2: !!a.r2Config(),
			total: count('SELECT COUNT(*) AS n FROM order_pdfs'),
			pending: count("SELECT COUNT(*) AS n FROM order_pdfs WHERE COALESCE(r2_at, '') = ''"),
			errors: count("SELECT COUNT(*) AS n FROM order_pdfs WHERE COALESCE(r2_at, '') = '' AND COALESCE(r2_error, '') != ''")
		};
	} catch (err) {
		out.archives = { error: String(err).slice(0, 200) };
	}

	// Extension DICOS : versions annoncées par les jetons personnels.
	try {
		const rows = arrayOf(new DynamicModel({ version: '', tokens: 0, last: '' }));
		$app.db()
			.newQuery("SELECT COALESCE(last_version, '') AS version, COUNT(*) AS tokens, COALESCE(MAX(last_used), '') AS last FROM connector_tokens GROUP BY COALESCE(last_version, '') ORDER BY tokens DESC")
			.all(rows);
		out.extension = rows.map((r) => ({ version: r.version, tokens: r.tokens, last: r.last }));
	} catch (err) {
		out.extension = [];
	}

	// Journal : durée de conservation appliquée et plus ancien message gardé.
	try {
		const ops = require(`${__hooks}/lib/operations.js`);
		const row = new DynamicModel({ oldest: '' });
		$app.db().newQuery("SELECT COALESCE(MIN(created), '') AS oldest FROM ops_log").one(row);
		out.journal = { months: ops.journalRetentionMonths(), oldest: row.oldest };
	} catch (err) {
		out.journal = { months: 0, oldest: '' };
	}

	return e.json(200, out);
});

// Conservation du Journal à la demande (même traitement que le cron `journal-retention`, battement compris).
routerAdd('POST', '/api/csm/journal/retention', (e) => {
	const secret = String($os.getenv('CSM_INTERNAL_SECRET') || '');
	const given = String(e.request.header.get('x-csm-internal') || '');
	if (secret.length < 32 || !$security.equal(given, secret)) return e.json(404, { message: 'Not found.' });
	let result = null;
	require(`${__hooks}/lib/heartbeat.js`).run($app, 'journal-retention', () => {
		result = require(`${__hooks}/lib/operations.js`).journalRetention($app);
	});
	return e.json(200, result || { error: 'échec' });
});
