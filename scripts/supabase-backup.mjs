#!/usr/bin/env node
// Sauvegarde Supabase en LECTURE SEULE via HTTPS (REST, Auth admin, Storage).
// Aucune écriture côté Supabase : uniquement des GET / list.
//
// Usage :
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… node scripts/supabase-backup.mjs [dossier]
//   BACKUP_OBJECTS_FILE=objets.json : inventaire Storage fourni (GET uniquement, pas de POST /object/list)
// Repli sans clé de service (données limitées par les policies RLS) :
//   SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… BACKUP_LOGIN_EMAIL=… BACKUP_LOGIN_PASSWORD=… node scripts/supabase-backup.mjs
//
// Le schéma (DDL, fonctions, triggers, policies, droits) n'est pas exposé par l'API REST :
// il est extrait séparément par requêtes catalogue (voir docs/SAUVEGARDE-SUPABASE.md).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const outDir = process.argv[2] ?? '/home/user/csm-backup';
const PAGE = 1000;

if (!url) throw new Error('SUPABASE_URL manquant');

const report = { started_at: new Date().toISOString(), mode: null, tables: {}, auth: null, storage: {}, errors: [] };

async function resolveAuth() {
	if (secret) {
		const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: secret } });
		if (res.ok) return { mode: 'service', apikey: secret, bearer: null };
		report.errors.push(`Clé secrète refusée (${res.status}) : repli sur connexion utilisateur`);
	}
	const email = process.env.BACKUP_LOGIN_EMAIL;
	const password = process.env.BACKUP_LOGIN_PASSWORD;
	if (!publishable || !email || !password) throw new Error('Ni clé de service valide, ni identifiants de repli');
	const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
		method: 'POST',
		headers: { apikey: publishable, 'content-type': 'application/json' },
		body: JSON.stringify({ email, password })
	});
	if (!res.ok) throw new Error(`Connexion refusée (${res.status})`);
	const { access_token } = await res.json();
	return { mode: 'user', apikey: publishable, bearer: access_token };
}

function headers(auth, extra = {}) {
	const h = { apikey: auth.apikey, ...extra };
	if (auth.bearer) h.authorization = `Bearer ${auth.bearer}`;
	return h;
}

async function listTables(auth) {
	// L'OpenAPI n'est servi qu'avec la clé de service : sinon, liste fournie par BACKUP_TABLES.
	if (process.env.BACKUP_TABLES) return process.env.BACKUP_TABLES.split(',').map((t) => t.trim());
	const res = await fetch(`${url}/rest/v1/`, { headers: headers(auth, { accept: 'application/openapi+json' }) });
	if (!res.ok) throw new Error(`OpenAPI ${res.status}`);
	const spec = await res.json();
	return Object.keys(spec.definitions ?? {}).sort();
}

async function dumpTable(auth, table) {
	const rows = [];
	let total = null;
	for (let from = 0; ; from += PAGE) {
		const res = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=*`, {
			headers: headers(auth, { range: `${from}-${from + PAGE - 1}`, 'range-unit': 'items', prefer: 'count=exact' })
		});
		if (!res.ok && res.status !== 206) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
		const page = await res.json();
		total ??= Number(res.headers.get('content-range')?.split('/')[1] ?? NaN);
		rows.push(...page);
		if (page.length < PAGE) break;
	}
	return { rows, total };
}

async function dumpAuthUsers(auth) {
	if (auth.mode !== 'service') return { skipped: 'nécessite la clé de service' };
	const users = [];
	for (let page = 1; ; page++) {
		const res = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: headers(auth, { authorization: `Bearer ${auth.apikey}` }) });
		if (!res.ok) throw new Error(`auth users ${res.status}`);
		const body = await res.json();
		users.push(...body.users);
		if (body.users.length < 200) break;
	}
	return { users };
}

async function listObjects(auth, bucket, prefix = '') {
	const out = [];
	for (let offset = 0; ; offset += 100) {
		const res = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
			method: 'POST',
			headers: headers(auth, { 'content-type': 'application/json', ...(auth.bearer ? {} : { authorization: `Bearer ${auth.apikey}` }) }),
			body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
		});
		if (!res.ok) throw new Error(`list ${bucket}/${prefix}: ${res.status}`);
		const items = await res.json();
		for (const it of items) {
			const path = prefix ? `${prefix}/${it.name}` : it.name;
			if (it.id === null) out.push(...(await listObjects(auth, bucket, path)));
			else out.push({ path, size: it.metadata?.size, mimetype: it.metadata?.mimetype });
		}
		if (items.length < 100) break;
	}
	return out;
}

// Inventaire fourni par fichier (SELECT bucket_id, name FROM storage.objects via le connecteur) :
// évite le POST /object/list, pour n'émettre que des GET avec la clé de service.
const objectsFile = process.env.BACKUP_OBJECTS_FILE;
const inventory = objectsFile ? JSON.parse(await readFile(objectsFile, 'utf8')) : null;

async function dumpBucket(auth, bucket) {
	const objects = inventory
		? inventory.filter((o) => o.bucket_id === bucket).map((o) => ({ path: o.name }))
		: await listObjects(auth, bucket);
	let bytes = 0;
	for (const o of objects) {
		const res = await fetch(`${url}/storage/v1/object/authenticated/${bucket}/${o.path.split('/').map(encodeURIComponent).join('/')}`, {
			headers: headers(auth, auth.bearer ? {} : { authorization: `Bearer ${auth.apikey}` })
		});
		if (!res.ok) {
			report.errors.push(`storage ${bucket}/${o.path}: ${res.status}`);
			continue;
		}
		const buf = Buffer.from(await res.arrayBuffer());
		const dest = join(outDir, 'storage', bucket, o.path);
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, buf);
		bytes += buf.length;
	}
	return { objects: objects.length, bytes };
}

const auth = await resolveAuth();
report.mode = auth.mode;
await mkdir(join(outDir, 'data'), { recursive: true });

for (const table of await listTables(auth)) {
	try {
		const { rows, total } = await dumpTable(auth, table);
		await writeFile(join(outDir, 'data', `${table}.json`), JSON.stringify(rows));
		report.tables[table] = { rows: rows.length, expected: total };
	} catch (e) {
		report.errors.push(String(e.message ?? e));
	}
}

try {
	const authUsers = await dumpAuthUsers(auth);
	if (authUsers.users) await writeFile(join(outDir, 'auth_users.json'), JSON.stringify(authUsers.users, null, 1));
	report.auth = authUsers.users ? { users: authUsers.users.length } : authUsers;
} catch (e) {
	report.errors.push(String(e.message ?? e));
}

for (const bucket of (process.env.BACKUP_BUCKETS ?? 'avatars,documents,taxis,movements_pdf').split(',').filter(Boolean)) {
	try {
		report.storage[bucket] = await dumpBucket(auth, bucket);
	} catch (e) {
		report.errors.push(String(e.message ?? e));
	}
}

report.finished_at = new Date().toISOString();
await writeFile(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ mode: report.mode, tables: Object.keys(report.tables).length, auth: report.auth, storage: report.storage, errors: report.errors }, null, 2));
