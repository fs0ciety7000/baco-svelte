// Archives des bons (11 oct. 2026) : copie R2 des PDF et sauvegarde zip mensuelle. Chargé par `archives.pb.js`.
//
// R2 : mêmes variables que les sauvegardes PocketBase (`CSM_BACKUP_S3_*`, `backups.pb.js`), dossier `bons/` du bucket.
// Sans ces variables (préversion, copie locale) : volume seulement. `CSM_ARCHIVE_R2=off` coupe l'envoi en gardant les
// sauvegardes PocketBase. La rotation des sauvegardes PocketBase ne supprime que les fichiers `@auto_pb_backup_*`.

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

/** Contenu d'un fichier d'une fiche (stockage de PocketBase : le volume). */
function readFile(app, record, field) {
	const fsys = app.newFilesystem();
	try {
		const r = fsys.getReader(record.baseFilesPath() + '/' + record.getString(field));
		try {
			return toBytes(r);
		} finally {
			r.close();
		}
	} finally {
		fsys.close();
	}
}

/** Copie dans R2 ; l'issue est notée sur la fiche (`r2_key`, `r2_at` ou `r2_error`). Ne lève jamais. */
function pushR2(app, record, key, bytes) {
	const c = r2Config();
	if (!c) return false;
	try {
		const s3 = $filesystem.s3(c.bucket, c.region, c.endpoint, c.accessKey, c.secret, true);
		try {
			s3.upload(bytes || readFile(app, record, 'file'), key);
		} finally {
			s3.close();
		}
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

function safeName(s) {
	return (
		String(s || '')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^A-Za-z0-9._-]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 80) || 'bon'
	);
}

/** Clé R2 d'un PDF : bons/<bus|taxi>/<AAAA>/<MM>/<référence>.pdf (date de service, sinon date d'archivage). */
function pdfKey(record) {
	const day = record.getString('service_day') || now().slice(0, 10);
	const ref = safeName(record.getString('reference') || record.getString('order_id'));
	return `bons/${record.getString('kind')}/${day.slice(0, 4)}/${day.slice(5, 7)}/${ref}-${record.getString('order_id').slice(0, 8)}.pdf`;
}

// --- ZIP (stockage sans compression : les PDF sont déjà compressés) ---

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
	const out = [];
	const str = unescape(encodeURIComponent(s));
	for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
	return out;
}

/** Zip « stocké » : entries = [{ name, bytes }] → tableau d'octets. Noms en UTF-8 (drapeau 0x0800). */
function zipStore(entries) {
	const out = [];
	const central = [];
	const u16 = (a, v) => a.push(v & 0xff, (v >>> 8) & 0xff);
	const u32 = (a, v) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
	const d = new Date();
	const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
	const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	for (const e of entries) {
		const name = utf8(e.name);
		const data = e.bytes;
		const crc = crc32(data);
		const offset = out.length;
		u32(out, 0x04034b50);
		u16(out, 20);
		u16(out, 0x0800);
		u16(out, 0);
		u16(out, dosTime);
		u16(out, dosDate);
		u32(out, crc);
		u32(out, data.length);
		u32(out, data.length);
		u16(out, name.length);
		u16(out, 0);
		for (let i = 0; i < name.length; i++) out.push(name[i]);
		for (let i = 0; i < data.length; i++) out.push(data[i]);
		const c = [];
		u32(c, 0x02014b50);
		u16(c, 20);
		u16(c, 20);
		u16(c, 0x0800);
		u16(c, 0);
		u16(c, dosTime);
		u16(c, dosDate);
		u32(c, crc);
		u32(c, data.length);
		u32(c, data.length);
		u16(c, name.length);
		u16(c, 0);
		u16(c, 0);
		u16(c, 0);
		u16(c, 0);
		u32(c, 0);
		u32(c, offset);
		for (let i = 0; i < name.length; i++) c.push(name[i]);
		central.push(c);
	}
	const start = out.length;
	let size = 0;
	for (const c of central) {
		for (let i = 0; i < c.length; i++) out.push(c[i]);
		size += c.length;
	}
	u32(out, 0x06054b50);
	u16(out, 0);
	u16(out, 0);
	u16(out, central.length);
	u16(out, central.length);
	u32(out, size);
	u32(out, start);
	u16(out, 0);
	return out;
}

/** Refait le zip d'un mois (AAAA-MM) : volume + R2. Renvoie le nombre de PDF. */
function backupMonth(app, month) {
	const rows = app.findRecordsByFilter('order_pdfs', 'service_day ~ {:m}', 'service_day,reference', 5000, 0, { m: `${month}-` });
	const entries = [];
	const used = {};
	for (const r of rows) {
		let name = `${r.getString('kind')}/${r.getString('service_day')}_${safeName(r.getString('reference') || r.getString('order_id'))}.pdf`;
		while (used[name]) name = name.replace(/\.pdf$/, '_bis.pdf');
		used[name] = true;
		try {
			entries.push({ name, bytes: readFile(app, r, 'file') });
		} catch (err) {
			console.log('archives : PDF illisible', r.id, String(err));
		}
	}
	const col = app.findCollectionByNameOrId('order_pdf_backups');
	let rec;
	try {
		rec = app.findFirstRecordByData('order_pdf_backups', 'month', month);
	} catch (_) {
		rec = new Record(col);
		rec.set('month', month);
	}
	if (!entries.length) {
		if (rec.id && !rec.isNew()) app.delete(rec);
		return 0;
	}
	const zip = zipStore(entries);
	rec.set('count', entries.length);
	rec.set('file', $filesystem.fileFromBytes(zip, `bons-${month}.zip`));
	app.save(rec);
	pushR2(app, rec, `bons/sauvegardes/bons-${month}.zip`, zip);
	return entries.length;
}

/** Mois à resauvegarder : un PDF plus récent que le zip du mois, ou pas encore de zip. Au plus `max` mois. */
function staleMonths(app, max) {
	const latest = {};
	for (const r of app.findRecordsByFilter('order_pdfs', 'service_day != ""', '', 20000, 0)) {
		const m = r.getString('service_day').slice(0, 7);
		const u = r.getString('updated');
		if (!latest[m] || u > latest[m]) latest[m] = u;
	}
	const done = {};
	for (const b of app.findRecordsByFilter('order_pdf_backups', 'month != ""', '', 2000, 0)) done[b.getString('month')] = b.getString('updated');
	return Object.keys(latest)
		.filter((m) => !done[m] || done[m] < latest[m])
		.sort()
		.reverse()
		.slice(0, max);
}

module.exports = { r2Config, readFile, pushR2, pdfKey, crc32, zipStore, backupMonth, staleMonths, safeName };
