#!/usr/bin/env node
// Test des règles d'accès PocketBase de CSM (équivalent des tests RLS).
// Crée des comptes de test par rôle, vérifie lectures / écritures / suppressions / escalade, puis nettoie.
//
//   PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/test-rules.mjs
//
// Ne jamais lancer contre une instance qui n'est pas CSM (voir CLAUDE.md §2 : PREPROD_PB_* = autre projet).

const PB = (process.env.PB_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const results = [];
let failed = 0;

async function api(method, path, { token, body } = {}) {
	const res = await fetch(`${PB}${path}`, {
		method,
		headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
		body: body ? JSON.stringify(body) : undefined
	});
	let json = null;
	try {
		json = await res.json();
	} catch {
		// Réponse vide (204).
	}
	return { status: res.status, json };
}

function check(label, ok, detail = '') {
	results.push(`${ok ? 'OK ' : 'KO '} ${label}${detail ? ` (${detail})` : ''}`);
	if (!ok) failed++;
}

const su = await api('POST', '/api/collections/_superusers/auth-with-password', {
	body: { identity: process.env.PB_SUPERUSER_EMAIL, password: process.env.PB_SUPERUSER_PASSWORD }
});
if (!su.json?.token) throw new Error(`Connexion superuser impossible (${su.status})`);
const root = su.json.token;

const suffix = Math.random().toString(36).slice(2, 8);
const roles = { admin: null, user: null, reader: null, otto_agent: null, denied: null };
const created = [];

try {
	for (const role of Object.keys(roles)) {
		const password = `Test-${suffix}-${role}`;
		const r = await api('POST', '/api/collections/users/records', {
			token: root,
			body: {
				email: `test-${role}-${suffix}@csm.invalid`,
				password,
				passwordConfirm: password,
				name: `Test ${role}`,
				role: role === 'denied' ? 'user' : role,
				denies: role === 'denied' ? ['otto:write'] : [],
				verified: true
			}
		});
		if (r.status !== 200) throw new Error(`Création ${role} : ${r.status} ${JSON.stringify(r.json)}`);
		created.push(r.json.id);
		const auth = await api('POST', '/api/collections/users/auth-with-password', {
			body: { identity: r.json.email, password }
		});
		roles[role] = { id: r.json.id, token: auth.json.token };
	}

	// Sans connexion : rien n'est lisible (les données PMR des commandes taxi en particulier).
	for (const c of ['bus_orders', 'taxi_orders', 'users', 'audit_log']) {
		const r = await api('GET', `/api/collections/${c}/records?perPage=1`);
		check(`anonyme ne lit pas ${c}`, r.status !== 200 || r.json.totalItems === 0, `HTTP ${r.status}`);
	}
	const anonCreate = await api('POST', '/api/collections/taxi_orders/records', { body: { status: 'brouillon' } });
	check('anonyme ne crée pas de commande taxi', anonCreate.status >= 400, `HTTP ${anonCreate.status}`);

	// Agent (rôle user) : lit, crée et modifie, ne supprime pas.
	const u = roles.user;
	const order = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'brouillon', reason: 'Test règles', created_by: u.id }
	});
	check('agent crée une commande bus', order.status === 200, `HTTP ${order.status}`);
	const spoof = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'brouillon', reason: 'Usurpation', created_by: roles.admin.id }
	});
	check("agent ne crée pas au nom d'un autre", spoof.status >= 400, `HTTP ${spoof.status}`);
	const upd = await api('PATCH', `/api/collections/bus_orders/records/${order.json.id}`, {
		token: u.token,
		body: { status: 'envoye' }
	});
	check('agent modifie le statut', upd.status === 200 && upd.json.status === 'envoye', `HTTP ${upd.status}`);
	const del = await api('DELETE', `/api/collections/bus_orders/records/${order.json.id}`, { token: u.token });
	check('agent ne supprime pas', del.status >= 400, `HTTP ${del.status}`);

	// Escalade de privilèges (faille S1 de BACO) : impossible.
	for (const field of [{ role: 'admin' }, { grants: ['admin:access'] }, { denies: [] }, { banned_until: '' }]) {
		const r = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: field });
		check(`agent ne modifie pas son ${Object.keys(field)[0]}`, r.status >= 400, `HTTP ${r.status}`);
	}
	const me = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { fonction: 'Opérateur' } });
	check('agent modifie sa fonction', me.status === 200, `HTTP ${me.status}`);
	const other = await api('PATCH', `/api/collections/users/records/${roles.reader.id}`, { token: u.token, body: { name: 'X' } });
	check("agent ne modifie pas le profil d'un autre", other.status >= 400, `HTTP ${other.status}`);

	// Lecteur : lit, n'écrit pas.
	const rl = await api('GET', '/api/collections/bus_orders/records?perPage=1', { token: roles.reader.token });
	check('lecteur lit les commandes bus', rl.status === 200, `HTTP ${rl.status}`);
	const rc = await api('POST', '/api/collections/bus_orders/records', {
		token: roles.reader.token,
		body: { status: 'brouillon', created_by: roles.reader.id }
	});
	check('lecteur ne crée pas', rc.status >= 400, `HTTP ${rc.status}`);

	// Permission retirée (denies) : prioritaire sur le rôle.
	const dc = await api('POST', '/api/collections/bus_orders/records', {
		token: roles.denied.token,
		body: { status: 'brouillon', created_by: roles.denied.id }
	});
	check('otto:write retiré → pas de création', dc.status >= 400, `HTTP ${dc.status}`);

	// Journal d'audit : alimenté par les hooks, lisible par l'admin seulement, non modifiable.
	const al = await api('GET', `/api/collections/audit_log/records?filter=${encodeURIComponent(`record="${order.json.id}"`)}&sort=at`, {
		token: roles.admin.token
	});
	const actions = (al.json?.items ?? []).map((i) => i.action).join(',');
	check('audit : création + modification tracées', actions === 'create,update', actions);
	const author = al.json?.items?.[1]?.user;
	check("audit : auteur = l'agent", author === u.id);
	const diff = al.json?.items?.[1]?.changes?.status;
	check('audit : différentiel du statut', diff?.old === 'brouillon' && diff?.new === 'envoye', JSON.stringify(diff));
	const ua = await api('GET', '/api/collections/audit_log/records?perPage=1', { token: u.token });
	check("agent ne lit pas l'audit", ua.status !== 200 || ua.json.totalItems === 0, `HTTP ${ua.status}`);
	const ad = await api('POST', '/api/collections/audit_log/records', {
		token: roles.admin.token,
		body: { action: 'create', collection: 'x', record: 'x', at: new Date().toISOString() }
	});
	check("même un admin n'écrit pas dans l'audit", ad.status >= 400, `HTTP ${ad.status}`);

	// Admin : supprime.
	const adel = await api('DELETE', `/api/collections/bus_orders/records/${order.json.id}`, { token: roles.admin.token });
	check('admin supprime', adel.status === 204, `HTTP ${adel.status}`);
} finally {
	for (const id of created) await api('DELETE', `/api/collections/users/records/${id}`, { token: root });
	const leftovers = await api('GET', `/api/collections/audit_log/records?perPage=200&filter=${encodeURIComponent(`legacy=false`)}`, {
		token: root
	});
	for (const i of leftovers.json?.items ?? []) {
		if (created.includes(i.record) || created.includes(i.user)) {
			// Les lignes d'audit sont protégées par les règles mais le superuser peut nettoyer les traces du test.
			await api('DELETE', `/api/collections/audit_log/records/${i.id}`, { token: root });
		}
	}
}

console.log(results.join('\n'));
console.log(failed ? `\n${failed} échec(s)` : `\n${results.length} contrôles réussis`);
process.exit(failed ? 1 : 0);
