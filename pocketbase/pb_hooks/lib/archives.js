// Archives des bons (11 oct. 2026) : copie R2 des PDF et sauvegarde zip mensuelle. Chargé par `archives.pb.js`.
//
// R2 : mêmes variables que les sauvegardes PocketBase (`CSM_BACKUP_S3_*`, `backups.pb.js`), dossier `bons/` du bucket.
// Sans ces variables (préversion, copie locale) : volume seulement. `CSM_ARCHIVE_R2=off` coupe l'envoi en gardant les
// sauvegardes PocketBase. La rotation des sauvegardes PocketBase ne supprime que les fichiers `@auto_pb_backup_*`.
// L'envoi R2 n'est jamais fait pendant une requête d'agent (clôture d'un bon) : cron `order-pdf-r2` toutes les 5 min.

// Zip d'un mois au-delà de ce total : refusé et signalé (la mémoire de PocketBase doit rester bornée).
const MAX_ZIP_BYTES = 200 * 1024 * 1024;

function env(k) {
	return String($os.getenv(k) || '').trim();
}

function r2Config() {
	if (env('CSM_ARCHIVE_R2') === 'off') return null;
	const c = {
		endpoint: env('CSM_BACKUP_S3_ENDPOINT'),
		bucket: env('CSM_BACKUP_S3_BUCKET'),
		accessKey: env('CSM_BACKUP_S3_ACCESS_KEY'),
		secret: env('CSM_BACKUP_S3_SECRET'),
		region: env('CSM_BACKUP_S3_REGION') || 'auto'
	};
	if (!c.endpoint || !c.bucket || !c.accessKey || !c.secret || !/^https:\/\//.test(c.endpoint)) return null;
	return c;
}

function now() {
	return new Date().toISOString().replace('T', ' ');
}

/** Contenu d'un fichier d'une fiche (stockage de PocketBase : le volume), en Uint8Array. */
function readFile(app, record, field) {
	const fsys = app.newFilesystem();
	try {
		const r = fsys.getReader(record.baseFilesPath() + '/' + record.getString(field));
		try {
			return new Uint8Array(toBytes(r));
		} finally {
			r.close();
		}
	} finally {
		fsys.close();
	}
}

function withS3(fn) {
	const c = r2Config();
	if (!c) return false;
	const s3 = $filesystem.s3(c.bucket, c.region, c.endpoint, c.accessKey, c.secret, true);
	try {
		fn(s3);
	} finally {
		s3.close();
	}
	return true;
}

/** Copie dans R2 ; l'issue est notée sur la fiche (`r2_key`, `r2_at` ou `r2_error`, `r2_tried_at`). Ne lève jamais. */
function pushR2(app, record, key) {
	if (!r2Config()) return false;
	record.set('r2_tried_at', now());
	try {
		const bytes = readFile(app, record, 'file');
		withS3((s3) => s3.upload(bytes, key));
		record.set('r2_key', key);
		record.set('r2_at', now());
		record.set('r2_error', '');
		app.saveNoValidate(record);
		return true;
	} catch (err) {
		record.set('r2_error', String(err).slice(0, 290));
		try {
			app.saveNoValidate(record);
		} catch (_) {}
		console.log('archives : envoi R2 impossible :', String(err));
		return false;
	}
}

/** Supprime un objet R2 (ancienne copie d'un bon re-terminé, archive supprimée). Ne lève jamais. */
function deleteR2(key) {
	if (!key || !r2Config()) return;
	try {
		withS3((s3) => {
			if (s3.exists(key)) s3.delete(key);
		});
	} catch (err) {
		console.log('archives : suppression R2 impossible :', key, String(err));
	}
}

function safeName(s) {
	return (
		String(s || '')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^A-Za-z0-9._-]+/g, '_')
			.replace(/\.{2,}/g, '.')
			.replace(/^[_.]+|[_.]+$/g, '')
			.slice(0, 80) || 'bon'
	);
}

/** Clé R2 d'un PDF : bons/<bus|taxi>/<AAAA>/<MM>/<référence>-<id>.pdf (date de service, sinon dossier « sans-date »). */
function pdfKey(record) {
	const day = record.getString('service_day');
	const folder = day ? `${day.slice(0, 4)}/${day.slice(5, 7)}` : 'sans-date';
	const ref = safeName(record.getString('reference') || record.getString('order_id'));
	return `bons/${record.getString('kind')}/${folder}/${ref}-${record.getString('order_id').slice(0, 8)}.pdf`;
}

// --- ZIP (stockage sans compression : les PDF sont déjà compressés), écrit d'un bloc dans un Uint8Array ---

let CRC_TABLE = null;
function crc32(bytes) {
	if (!CRC_TABLE) {
		CRC_TABLE = new Int32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			CRC_TABLE[n] = c;
		}
	}
	let crc = -1;
	for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return (crc ^ -1) >>> 0;
}

function utf8(s) {
	const str = unescape(encodeURIComponent(s));
	const out = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
	return out;
}

/** Zip « stocké » : entries = [{ name, bytes: Uint8Array }] → Uint8Array. Noms en UTF-8 (drapeau 0x0800). */
function zipStore(entries) {
	const items = entries.map((e) => ({ name: utf8(e.name), data: e.bytes, crc: crc32(e.bytes), offset: 0 }));
	let total = 22;
	for (const it of items) total += 30 + it.name.length + it.data.length + 46 + it.name.length;
	const out = new Uint8Array(total);
	let p = 0;
	const u16 = (v) => {
		out[p++] = v & 0xff;
		out[p++] = (v >>> 8) & 0xff;
	};
	const u32 = (v) => {
		out[p++] = v & 0xff;
		out[p++] = (v >>> 8) & 0xff;
		out[p++] = (v >>> 16) & 0xff;
		out[p++] = (v >>> 24) & 0xff;
	};
	const d = new Date();
	const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
	const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	const header = (it, central) => {
		u32(central ? 0x02014b50 : 0x04034b50);
		if (central) u16(20);
		u16(20);
		u16(0x0800);
		u16(0);
		u16(dosTime);
		u16(dosDate);
		u32(it.crc);
		u32(it.data.length);
		u32(it.data.length);
		u16(it.name.length);
		u16(0);
		if (central) {
			u16(0);
			u16(0);
			u16(0);
			u32(0);
			u32(it.offset);
		}
		out.set(it.name, p);
		p += it.name.length;
	};
	for (const it of items) {
		it.offset = p;
		header(it, false);
		out.set(it.data, p);
		p += it.data.length;
	}
	const start = p;
	for (const it of items) header(it, true);
	const size = p - start;
	u32(0x06054b50);
	u16(0);
	u16(0);
	u16(items.length);
	u16(items.length);
	u32(size);
	u32(start);
	u16(0);
	return out;
}

/** Refait le zip d'un mois (AAAA-MM) sur le volume (copie R2 par le cron). Renvoie le nombre de PDF. */
function backupMonth(app, month) {
	const rows = app.findRecordsByFilter('order_pdfs', 'service_day ~ {:m}', 'service_day,reference', 5000, 0, { m: `${month}-` });
	const col = app.findCollectionByNameOrId('order_pdf_backups');
	let rec = null;
	try {
		rec = app.findFirstRecordByData('order_pdf_backups', 'month', month);
	} catch (_) {}
	if (!rows.length) {
		// Plus aucun PDF ce mois (archives supprimées, bon re-daté) : zip retiré, et sa copie R2.
		if (rec) {
			deleteR2(rec.getString('r2_key'));
			app.delete(rec);
		}
		return 0;
	}
	const entries = [];
	const used = {};
	let total = 0;
	let asOf = '';
	for (const r of rows) {
		let name = `${r.getString('kind')}/${r.getString('service_day')}_${safeName(r.getString('reference') || r.getString('order_id'))}.pdf`;
		while (used[name]) name = name.replace(/\.pdf$/, '_bis.pdf');
		used[name] = true;
		const at = r.getString('content_at') || r.getString('created');
		if (at > asOf) asOf = at;
		try {
			const bytes = readFile(app, r, 'file');
			total += bytes.length;
			if (total > MAX_ZIP_BYTES) throw new Error(`zip du mois ${month} au-delà de ${MAX_ZIP_BYTES / 1048576} Mo`);
			entries.push({ name, bytes });
		} catch (err) {
			if (total > MAX_ZIP_BYTES) throw err;
			console.log('archives : PDF illisible', r.id, String(err));
		}
	}
	if (!rec) {
		rec = new Record(col);
		rec.set('month', month);
	}
	rec.set('count', rows.length);
	rec.set('as_of', asOf);
	rec.set('file', $filesystem.fileFromBytes(zipStore(entries), `bons-${month}.zip`));
	rec.set('r2_at', '');
	rec.set('r2_error', '');
	app.save(rec);
	return rows.length;
}

/**
 * Mois à resauvegarder : un PDF plus récent que le zip (`content_at` > `as_of`), un nombre de PDF différent de celui du
 * zip (archive supprimée, bon re-daté), ou pas encore de zip. Du plus récent au plus ancien, au plus `max` mois.
 */
function staleMonths(app, max) {
	const latest = {};
	const counts = {};
	for (const r of app.findRecordsByFilter('order_pdfs', 'service_day != ""', '', 50000, 0)) {
		const m = r.getString('service_day').slice(0, 7);
		const at = r.getString('content_at') || r.getString('created');
		if (!latest[m] || at > latest[m]) latest[m] = at;
		counts[m] = (counts[m] || 0) + 1;
	}
	const stale = {};
	const done = {};
	for (const b of app.findRecordsByFilter('order_pdf_backups', 'month != ""', '', 5000, 0)) {
		const m = b.getString('month');
		done[m] = true;
		if (!counts[m] || b.getInt('count') !== counts[m] || (b.getString('as_of') || '') < latest[m]) stale[m] = true;
	}
	for (const m of Object.keys(latest)) if (!done[m]) stale[m] = true;
	return Object.keys(stale).sort().reverse().slice(0, max);
}

/** Rattrapage R2 : PDF puis zips sans copie, par ancienneté du dernier essai. */
function syncR2(app, maxPdfs, maxZips) {
	if (!r2Config()) return 0;
	let n = 0;
	for (const r of app.findRecordsByFilter('order_pdfs', 'r2_at = ""', 'r2_tried_at,created', maxPdfs, 0)) {
		if (pushR2(app, r, pdfKey(r))) n++;
	}
	for (const b of app.findRecordsByFilter('order_pdf_backups', 'r2_at = ""', 'r2_tried_at,month', maxZips, 0)) {
		if (pushR2(app, b, `bons/sauvegardes/bons-${b.getString('month')}.zip`)) n++;
	}
	return n;
}

module.exports = { r2Config, readFile, pushR2, deleteR2, pdfKey, crc32, zipStore, backupMonth, staleMonths, syncR2, safeName, now };
