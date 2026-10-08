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
// Fiches de test supprimées par le superuser : leurs lignes d'audit sont nettoyées à la fin.
const auditIds = [];

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
				// Comptes créés sans grants/denies (comme par l'interface admin) : le hook doit les normaliser.
				...(role === 'denied' ? { denies: ['otto:write'] } : {}),
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
		body: { reason: 'Test règles modifié' }
	});
	check('agent modifie sa commande', upd.status === 200 && upd.json.reason === 'Test règles modifié', `HTTP ${upd.status}`);
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
	check('lecteur lit les commandes bus', rl.status === 200 && rl.json.totalItems > 0, `${rl.json?.totalItems} lignes`);
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
	const diff = al.json?.items?.[1]?.changes?.reason;
	check('audit : différentiel du motif', diff?.old === 'Test règles' && diff?.new === 'Test règles modifié', JSON.stringify(diff));
	const ua = await api('GET', '/api/collections/audit_log/records?perPage=1', { token: u.token });
	check("agent ne lit pas l'audit", ua.status !== 200 || ua.json.totalItems === 0, `HTTP ${ua.status}`);
	const ad = await api('POST', '/api/collections/audit_log/records', {
		token: roles.admin.token,
		body: { action: 'create', collection: 'x', record: 'x', at: new Date().toISOString() }
	});
	check("même un admin n'écrit pas dans l'audit", ad.status >= 400, `HTTP ${ad.status}`);

	// ---------- Module Commandes (session 3) ----------
	const anonCols = ['pmr_clients', 'order_events', 'taxi_companies', 'order_templates', 'b201_reports', 'bus_drivers'];
	for (const c of anonCols) {
		const r = await api('GET', `/api/collections/${c}/records?perPage=1`);
		check(`anonyme ne lit pas ${c}`, r.status !== 200 || r.json.totalItems === 0, `HTTP ${r.status}`);
	}
	const notDraft = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'envoye', created_by: u.id }
	});
	check('création directement « envoyé » refusée', notDraft.status >= 400, `HTTP ${notDraft.status}`);
	const forged = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'brouillon', created_by: u.id, sent_at: '2026-01-01 00:00:00Z' }
	});
	check('horodatage de cycle de vie refusé dans la requête', forged.status >= 400, `HTTP ${forged.status}`);

	const noMail = await api('POST', '/api/collections/bus_companies/records', { token: roles.admin.token, body: { name: `Test sans mail ${suffix}` } });
	const withMail = await api('POST', '/api/collections/bus_companies/records', {
		token: roles.admin.token,
		body: { name: `Test ${suffix}`, email: 'fournisseur@csm.invalid' }
	});
	const bo = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'brouillon', created_by: u.id, company: noMail.json.id, reason: 'Test cycle' }
	});
	check('numéro de bon attribué', bo.status === 200 && bo.json.number > 0, `n° ${bo.json?.number}`);
	const bid = bo.json.id;
	const patch = (token, body) => api('PATCH', `/api/collections/bus_orders/records/${bid}`, { token, body });
	let t = await patch(u.token, { status: 'envoye' });
	check('envoi refusé sans e-mail fournisseur', t.status === 400, `HTTP ${t.status}`);
	t = await patch(u.token, { company: withMail.json.id, status: 'envoye' });
	check('brouillon → envoyé', t.status === 200 && t.json.sent_by === u.id && !!t.json.sent_at, `HTTP ${t.status}`);
	t = await patch(u.token, { sent_by: roles.admin.id });
	check('sent_by non modifiable', t.status >= 400, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'termine' });
	check('envoyé → terminé refusé (étape sautée)', t.status === 400, `HTTP ${t.status}`);
	t = await patch(roles.otto_agent.token, { status: 'confirme' });
	check('tout agent confirme (otto_agent)', t.status === 200 && t.json.confirmed_by === roles.otto_agent.id, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'en_cours' });
	check('confirmé → en cours', t.status === 200 && !!t.json.started_at, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'annule', cancel_reason: 'Test' });
	check('annulation après « en cours » réservée au coordinateur', t.status === 403, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'confirme' });
	check('« en cours → confirmé » réservé au coordinateur (contournement de l\'annulation)', t.status === 403, `HTTP ${t.status}`);
	t = await patch(u.token, { validated_by: u.id, sent_by_name: 'X' });
	check('attribution reprise de BACO non modifiable', t.status >= 400, `HTTP ${t.status}`);
	t = await patch(roles.admin.token, { status: 'annule' });
	check('annulation sans motif refusée', t.status === 400, `HTTP ${t.status}`);
	t = await patch(roles.admin.token, { status: 'annule', cancel_reason: 'Test annulation' });
	check('coordinateur annule avec motif', t.status === 200 && t.json.status_before_cancel === 'en_cours', `HTTP ${t.status}`);
	t = await patch(u.token, { reason: 'Modif après annulation' });
	check('commande annulée non modifiable par un agent', t.status === 400, `HTTP ${t.status}`);
	t = await patch(roles.admin.token, { status: 'confirme' });
	check('rétablir vers un autre statut que le précédent refusé', t.status === 400, `HTTP ${t.status}`);
	t = await patch(roles.admin.token, { status: 'en_cours' });
	check('coordinateur rétablit au statut précédent', t.status === 200 && !t.json.cancelled_at, `HTTP ${t.status}`);
	// Numéros de bon : créations simultanées sans doublon.
	const burst = await Promise.all(
		Array.from({ length: 12 }, () =>
			api('POST', '/api/collections/bus_orders/records', { token: u.token, body: { status: 'brouillon', created_by: u.id } })
		)
	);
	const nums = burst.filter((r) => r.status === 200).map((r) => r.json.number);
	check('12 créations simultanées, numéros uniques', nums.length === 12 && new Set(nums).size === 12, `${nums.length} OK`);
	for (const r of burst) if (r.json?.id) {
		await api('DELETE', `/api/collections/bus_orders/records/${r.json.id}`, { token: root });
		auditIds.push(r.json.id);
	}
	const ev = await api('GET', `/api/collections/order_events/records?sort=at&perPage=50&filter=${encodeURIComponent(`order="${bid}"`)}`, {
		token: roles.reader.token
	});
	const chain = (ev.json?.items ?? []).map((i) => i.to).join(',');
	check('historique horodaté lisible (lecteur)', chain === 'brouillon,envoye,confirme,en_cours,annule,en_cours', chain);
	check("historique : auteur de l'envoi", ev.json?.items?.[1]?.by === u.id && ev.json?.items?.[1]?.from === 'brouillon');
	const evc = await api('POST', '/api/collections/order_events/records', {
		token: roles.admin.token,
		body: { kind: 'bus', order: bid, to: 'termine', at: new Date().toISOString() }
	});
	check("personne n'écrit l'historique à la main", evc.status >= 400, `HTTP ${evc.status}`);

	// Taxi et PMR : otto_agent n'y a pas accès ; un agent crée en son nom seulement.
	for (const c of ['taxi_orders', 'pmr_clients', 'taxi_companies']) {
		const r = await api('GET', `/api/collections/${c}/records?perPage=1`, { token: roles.otto_agent.token });
		check(`otto_agent ne lit pas ${c}`, r.status !== 200 || r.json.totalItems === 0, `HTTP ${r.status}`);
	}
	const tx = await api('POST', '/api/collections/taxi_orders/records', {
		token: u.token,
		body: { status: 'brouillon', created_by: u.id, to_station: 'Test' }
	});
	check('agent crée une commande taxi', tx.status === 200 && tx.json.number > 0, `HTTP ${tx.status}`);
	const txs = await api('POST', '/api/collections/taxi_orders/records', {
		token: u.token,
		body: { status: 'brouillon', created_by: roles.admin.id }
	});
	check("taxi : pas de création au nom d'un autre", txs.status >= 400, `HTTP ${txs.status}`);
	const txe = await api('GET', `/api/collections/order_events/records?filter=${encodeURIComponent(`order="${tx.json.id}"`)}`, {
		token: roles.otto_agent.token
	});
	check("otto_agent ne lit pas l'historique taxi", txe.json?.totalItems === 0, `${txe.json?.totalItems}`);
	const pc = await api('POST', '/api/collections/pmr_clients/records', { token: u.token, body: { last_name: 'Test', updated_by: u.id } });
	check('agent crée une fiche PMR', pc.status === 200, `HTTP ${pc.status}`);
	const pd = await api('DELETE', `/api/collections/pmr_clients/records/${pc.json.id}`, { token: u.token });
	check('agent ne supprime pas une fiche PMR', pd.status >= 400, `HTTP ${pd.status}`);
	const pf = await api('POST', '/api/collections/pmr_clients/records', { token: u.token, body: { last_name: 'X', updated_by: roles.admin.id } });
	check('fiche PMR : auteur de la modification non forgeable', pf.status >= 400, `HTTP ${pf.status}`);

	// Modèles : tous partagés, modifiables par tout agent qui écrit des commandes.
	const tp = await api('POST', '/api/collections/order_templates/records', {
		token: u.token,
		body: { kind: 'bus', name: 'Test', data: {}, created_by: u.id }
	});
	check('agent crée un modèle', tp.status === 200, `HTTP ${tp.status}`);
	const tpo = await api('PATCH', `/api/collections/order_templates/records/${tp.json.id}`, {
		token: roles.otto_agent.token,
		body: { name: 'Modifié' }
	});
	check("modèle partagé modifiable par un autre agent", tpo.status === 200, `HTTP ${tpo.status}`);
	const tpk = await api('PATCH', `/api/collections/order_templates/records/${tp.json.id}`, { token: u.token, body: { kind: 'taxi' } });
	check('type de modèle non modifiable', tpk.status >= 400, `HTTP ${tpk.status}`);
	const tpr = await api('POST', '/api/collections/order_templates/records', {
		token: roles.reader.token,
		body: { kind: 'bus', name: 'X', created_by: roles.reader.id }
	});
	check('lecteur ne crée pas de modèle', tpr.status >= 400, `HTTP ${tpr.status}`);
	const tpt = await api('POST', '/api/collections/order_templates/records', {
		token: roles.otto_agent.token,
		body: { kind: 'taxi', name: 'X', created_by: roles.otto_agent.id }
	});
	check('otto_agent ne crée pas de modèle taxi', tpt.status >= 400, `HTTP ${tpt.status}`);

	// B201 : lecture par tous, écriture par les détenteurs de b201:write.
	const b2 = await api('POST', '/api/collections/b201_reports/records', { token: roles.admin.token, body: { day: '2099-01-01', notes: {}, updated_by: roles.admin.id } });
	check('admin crée la B201 du jour', b2.status === 200, `HTTP ${b2.status}`);
	const b2d = await api('POST', '/api/collections/b201_reports/records', { token: roles.admin.token, body: { day: '2099-01-01', updated_by: roles.admin.id } });
	check('une seule B201 par jour', b2d.status >= 400, `HTTP ${b2d.status}`);
	const b2r = await api('GET', `/api/collections/b201_reports/records/${b2.json.id}`, { token: roles.reader.token });
	check('lecteur lit la B201', b2r.status === 200, `HTTP ${b2r.status}`);
	const b2m = await api('PATCH', `/api/collections/b201_reports/records/${b2.json.id}`, { token: roles.admin.token, body: { day: '2099-01-02', updated_by: roles.admin.id } });
	check('jour de la B201 non modifiable (bug B1 de BACO)', b2m.status >= 400, `HTTP ${b2m.status}`);

	for (const [c, id] of [
		['bus_orders', bid],
		['taxi_orders', tx.json.id],
		['pmr_clients', pc.json.id],
		['order_templates', tp.json.id],
		['b201_reports', b2.json.id],
		['bus_companies', noMail.json.id],
		['bus_companies', withMail.json.id]
	]) {
		await api('DELETE', `/api/collections/${c}/records/${id}`, { token: root });
		auditIds.push(id);
	}
	const evLeft = await api('GET', `/api/collections/order_events/records?filter=${encodeURIComponent(`order="${bid}"`)}`, { token: root });
	check('historique supprimé avec la commande', evLeft.json?.totalItems === 0, `${evLeft.json?.totalItems}`);

	// Admin : supprime.
	const adel = await api('DELETE', `/api/collections/bus_orders/records/${order.json.id}`, { token: roles.admin.token });
	check('admin supprime', adel.status === 204, `HTTP ${adel.status}`);
} finally {
	for (const id of created) await api('DELETE', `/api/collections/users/records/${id}`, { token: root });
	const leftovers = await api('GET', `/api/collections/audit_log/records?perPage=500&filter=${encodeURIComponent(`legacy=false`)}`, {
		token: root
	});
	for (const i of leftovers.json?.items ?? []) {
		// Nettoyage des fiches de test créées par les comptes de test.
		if (created.includes(i.record) || created.includes(i.user) || auditIds.includes(i.record)) {
			// Les lignes d'audit sont protégées par les règles mais le superuser peut nettoyer les traces du test.
			await api('DELETE', `/api/collections/audit_log/records/${i.id}`, { token: root });
		}
	}
}

console.log(results.join('\n'));
console.log(failed ? `\n${failed} échec(s)` : `\n${results.length} contrôles réussis`);
process.exit(failed ? 1 : 0);
