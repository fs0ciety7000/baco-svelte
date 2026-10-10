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
const roles = { admin: null, user: null, reader: null, otto_agent: null, denied: null, moderator: null };
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
				username: `t${role.replace('_', '')}${suffix}`,
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
	const selfDistrict = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { district: 'Centre' } });
	check("agent ne s'attribue pas un district (droit B201)", selfDistrict.status >= 400, `HTTP ${selfDistrict.status}`);
	const me = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { fonction: 'Opérateur' } });
	check('agent modifie sa fonction', me.status === 200, `HTTP ${me.status}`);
	const phone = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { work_phone: '065 00 00 00' } });
	check('agent modifie son téléphone pro', phone.status === 200, `HTTP ${phone.status}`);
	const avatarField = (await api('GET', '/api/collections/users', { token: root })).json?.fields?.find((f) => f.name === 'avatar');
	check('avatar : fichier protégé, images seulement', avatarField?.protected === true && avatarField?.mimeTypes?.includes('image/webp') && !avatarField?.mimeTypes?.includes('image/svg+xml'), JSON.stringify(avatarField?.mimeTypes));
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
	// Envoi validé = terminé directement, même sans adresse e-mail (PDF seul) — décision du 9 oct. 2026.
	const direct = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'brouillon', created_by: u.id, company: noMail.json.id, reason: 'Test envoi direct' }
	});
	const dt = await api('PATCH', `/api/collections/bus_orders/records/${direct.json.id}`, { token: u.token, body: { status: 'termine' } });
	check(
		'brouillon → terminé sans e-mail (heure d\'envoi posée)',
		dt.status === 200 && !!dt.json.sent_at && dt.json.sent_by === u.id && !!dt.json.ended_at,
		`HTTP ${dt.status}`
	);
	let t = await patch(u.token, { company: withMail.json.id, status: 'envoye' });
	check('brouillon → envoyé', t.status === 200 && t.json.sent_by === u.id && !!t.json.sent_at, `HTTP ${t.status}`);
	t = await patch(u.token, { sent_by: roles.admin.id });
	check('sent_by non modifiable', t.status >= 400, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'termine' });
	check('envoyé → terminé refusé avant 5 jours (clôture)', t.status === 400, `HTTP ${t.status}`);
	// Clôture d'un bon envoyé jamais confirmé : permise 5 jours après la date de service.
	const old = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: {
			status: 'brouillon',
			created_by: u.id,
			company: withMail.json.id,
			reason: 'Test clôture',
			order_date: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10) + ' 00:00:00.000Z'
		}
	});
	await api('PATCH', `/api/collections/bus_orders/records/${old.json?.id}`, { token: u.token, body: { status: 'envoye' } });
	const closed = await api('PATCH', `/api/collections/bus_orders/records/${old.json?.id}`, { token: u.token, body: { status: 'termine' } });
	check('envoyé → terminé (clôture) après 5 jours', closed.status === 200 && !!closed.json.ended_at, `HTTP ${closed.status} ${JSON.stringify(closed.json).slice(0, 120)}`);
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
	const pc = await api('POST', '/api/collections/pmr_clients/records', { token: u.token, body: { last_name: 'Test', updated_by: u.id, created_by: u.id } });
	check('agent crée une fiche PMR', pc.status === 200, `HTTP ${pc.status}`);
	const pd = await api('DELETE', `/api/collections/pmr_clients/records/${pc.json.id}`, { token: u.token });
	check('agent ne supprime pas une fiche PMR', pd.status >= 400, `HTTP ${pd.status}`);
	const pf = await api('POST', '/api/collections/pmr_clients/records', { token: u.token, body: { last_name: 'X', updated_by: roles.admin.id, created_by: u.id } });
	check('fiche PMR : auteur de la modification non forgeable', pf.status >= 400, `HTTP ${pf.status}`);
	const pc2 = await api('POST', '/api/collections/pmr_clients/records', { token: u.token, body: { last_name: 'X', updated_by: u.id, created_by: roles.admin.id } });
	check('fiche PMR : créateur non forgeable', pc2.status >= 400, `HTTP ${pc2.status}`);

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

	// B201 : lecture par tous ; écriture par les agents rattachés à un district (décision du 8 octobre 2026).
	const b2n = await api('POST', '/api/collections/b201_reports/records', { token: u.token, body: { day: '2099-02-01', updated_by: u.id } });
	check('agent sans district ne crée pas la B201', b2n.status >= 400, `HTTP ${b2n.status}`);
	await api('PATCH', `/api/collections/users/records/${u.id}`, { token: root, body: { district: 'Centre' } });
	const b2a = await api('POST', '/api/collections/b201_reports/records', { token: u.token, body: { day: '2099-02-01', updated_by: u.id } });
	check('agent du district Centre écrit la B201', b2a.status === 200, `HTTP ${b2a.status}`);
	// otto_agent : refusé sans district, accepté avec ; lecteur refusé même avec un district ; retrait explicite.
	const ox = await api('POST', '/api/collections/b201_reports/records', { token: roles.otto_agent.token, body: { day: '2099-02-02', updated_by: roles.otto_agent.id } });
	check("otto_agent sans district n'écrit pas la B201", ox.status >= 400, `HTTP ${ox.status}`);
	for (const r of ['otto_agent', 'reader']) {
		await api('PATCH', `/api/collections/users/records/${roles[r].id}`, { token: root, body: { district: 'Sud-Est' } });
	}
	const oy = await api('POST', '/api/collections/b201_reports/records', { token: roles.otto_agent.token, body: { day: '2099-02-02', updated_by: roles.otto_agent.id } });
	check('otto_agent du district écrit la B201', oy.status === 200, `HTTP ${oy.status}`);
	if (oy.json?.id) {
		await api('DELETE', `/api/collections/b201_reports/records/${oy.json.id}`, { token: root });
		auditIds.push(oy.json.id);
	}
	const rx = await api('POST', '/api/collections/b201_reports/records', { token: roles.reader.token, body: { day: '2099-02-04', updated_by: roles.reader.id } });
	check("lecteur avec district n'écrit pas la B201", rx.status >= 400, `HTTP ${rx.status}`);
	await api('PATCH', `/api/collections/users/records/${roles.denied.id}`, { token: root, body: { district: 'Sud-Est', denies: ['otto:write', 'b201:write'] } });
	const xd = await api('POST', '/api/collections/b201_reports/records', { token: roles.denied.token, body: { day: '2099-02-03', updated_by: roles.denied.id } });
	check('b201:write retiré → pas d\'écriture malgré le district', xd.status >= 400, `HTTP ${xd.status}`);
	if (b2a.json?.id) {
		await api('DELETE', `/api/collections/b201_reports/records/${b2a.json.id}`, { token: root });
		auditIds.push(b2a.json.id);
	}
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

	// ---------- Module PMR (session 3) ----------
	for (const c of ['pmr_assists', 'pmr_equipment', 'pmr_events', 'pmr_zones']) {
		const r = await api('GET', `/api/collections/${c}/records?perPage=1`);
		check(`anonyme ne lit pas ${c}`, r.status !== 200 || r.json.totalItems === 0, `HTTP ${r.status}`);
	}
	const zone = await api('POST', '/api/collections/pmr_zones/records', { token: roles.admin.token, body: { code: `Z${suffix.toUpperCase().slice(0, 4)}`, district: 'Sud-Ouest', stations: ['XTEST'] } });
	check('coordinateur crée une zone', zone.status === 200, `HTTP ${zone.status}`);
	const zu = await api('POST', '/api/collections/pmr_zones/records', { token: u.token, body: { code: 'ZZZ' } });
	check('agent ne crée pas de zone', zu.status >= 400, `HTTP ${zu.status}`);
	const as = await api('POST', '/api/collections/pmr_assists/records', {
		token: u.token,
		body: { day: '2099-03-01', time: '14:30', station: 'xtest', status: 'prevue', created_by: u.id, updated_by: u.id, pax: 1 }
	});
	check('agent crée une prestation, période et zone déduites', as.status === 200 && as.json.period === 'apres_midi' && as.json.zone === zone.json?.id, `HTTP ${as.status} ${as.json?.period}`);
	const aid = as.json?.id;
	const asNo = await api('POST', '/api/collections/pmr_assists/records', { token: u.token, body: { day: '2099-03-01', status: 'realisee', created_by: u.id, updated_by: u.id } });
	check('prestation créée directement « réalisée » refusée', asNo.status >= 400, `HTTP ${asNo.status}`);
	await api('PATCH', `/api/collections/users/records/${roles.denied.id}`, { token: root, body: { denies: ['otto:write', 'b201:write', 'pmr:read'] } });
	const cl = await api('POST', '/api/collections/pmr_clients/records', { token: root, body: { last_name: 'Lien test' } });
	const asC = await api('POST', '/api/collections/pmr_assists/records', {
		token: roles.denied.token,
		body: { day: '2099-03-01', status: 'prevue', created_by: roles.denied.id, updated_by: roles.denied.id, client: cl.json?.id }
	});
	check('sans pmr:read, pas de lien vers une fiche client', asC.status >= 400, `HTTP ${asC.status}`);
	if (cl.json?.id) {
		await api('DELETE', `/api/collections/pmr_clients/records/${cl.json.id}`, { token: root });
		auditIds.push(cl.json.id);
	}
	const asR = await api('POST', '/api/collections/pmr_assists/records', { token: roles.reader.token, body: { day: '2099-03-01', status: 'prevue', created_by: roles.reader.id, updated_by: roles.reader.id } });
	check('lecteur ne crée pas de prestation', asR.status >= 400, `HTTP ${asR.status}`);
	const asO = await api('GET', '/api/collections/pmr_assists/records?perPage=1', { token: roles.otto_agent.token });
	check('otto_agent ne lit pas les prestations', asO.status !== 200 || asO.json.totalItems === 0, `HTTP ${asO.status}`);
	const asL = await api('POST', '/api/collections/pmr_assists/records', {
		token: u.token,
		body: { day: '2099-03-01', status: 'prevue', created_by: u.id, updated_by: u.id, legacy_id: 'x' }
	});
	check('identifiant de reprise BACO non forgeable', asL.status >= 400, `HTTP ${asL.status}`);
	const lgw = await api('POST', '/api/collections/pmr_assist_legacy/records', { token: roles.admin.token, body: { assist: aid, text: 'x' } });
	check("personne n'écrit le texte BACO", lgw.status >= 400, `HTTP ${lgw.status}`);
	const ap = (body, token = u.token) => api('PATCH', `/api/collections/pmr_assists/records/${aid}`, { token, body: { updated_by: u.id, ...body } });
	let pr = await ap({ updated_by: roles.admin.id });
	check('updated_by non forgeable', pr.status >= 400, `HTTP ${pr.status}`);
	pr = await ap({ anonymized: true });
	check('anonymisation non déclenchable par la requête', pr.status >= 400, `HTTP ${pr.status}`);
	pr = await ap({ status: 'annulee' });
	check('annulation sans motif refusée', pr.status === 400, `HTTP ${pr.status}`);
	pr = await ap({ status: 'annulee', cancel_reason: 'Train supprimé' });
	check('prestation annulée avec motif', pr.status === 200, `HTTP ${pr.status}`);
	pr = await ap({ status: 'realisee' });
	check('annulée → réalisée refusé', pr.status === 400, `HTTP ${pr.status}`);
	pr = await ap({ status: 'prevue', time: '15:10' });
	check('rétablie en prévue, motif effacé', pr.status === 200 && pr.json.cancel_reason === '', `HTTP ${pr.status}`);
	const pev = await api('GET', `/api/collections/pmr_events/records?sort=at&perPage=50&filter=${encodeURIComponent(`record="${aid}"`)}`, { token: roles.reader.token });
	const pchain = (pev.json?.items ?? []).map((i) => `${i.field}:${i.to}`).join(',');
	check('historique de la prestation', pchain === 'status:prevue,status:annulee,status:prevue,time:15:10', pchain);
	const pew = await api('POST', '/api/collections/pmr_events/records', { token: roles.admin.token, body: { kind: 'assist', record: aid, to: 'x', at: new Date().toISOString() } });
	check("personne n'écrit l'historique PMR à la main", pew.status >= 400, `HTTP ${pew.status}`);

	// Matériel : création par les coordinateurs, état par tout agent pmr:write.
	const eq = await api('POST', '/api/collections/pmr_equipment/records', { token: u.token, body: { station: 'XTEST', state: 'ok', updated_by: u.id } });
	check('agent ne crée pas de matériel', eq.status >= 400, `HTTP ${eq.status}`);
	const eqa = await api('POST', '/api/collections/pmr_equipment/records', { token: roles.admin.token, body: { station: 'XTEST', state: 'ok', updated_by: roles.admin.id } });
	check('coordinateur crée une rampe', eqa.status === 200, `HTTP ${eqa.status}`);
	const equ = await api('PATCH', `/api/collections/pmr_equipment/records/${eqa.json?.id}`, { token: u.token, body: { state: 'hs', state_note: 'Charnière cassée', updated_by: u.id } });
	check('agent passe une rampe hors service', equ.status === 200 && equ.json.state === 'hs', `HTTP ${equ.status}`);
	const eqs = await api('PATCH', `/api/collections/pmr_equipment/records/${eqa.json?.id}`, { token: u.token, body: { station: 'AUTRE', updated_by: u.id } });
	check('agent ne modifie pas la gare d\'une rampe (coordinateurs)', eqs.status >= 400, `HTTP ${eqs.status}`);
	const eqd = await api('DELETE', `/api/collections/pmr_equipment/records/${eqa.json?.id}`, { token: u.token });
	check('agent ne supprime pas une rampe', eqd.status >= 400, `HTTP ${eqd.status}`);
	const eqo = await api('GET', '/api/collections/pmr_equipment/records?perPage=1', { token: roles.otto_agent.token });
	check('otto_agent ne lit pas le matériel', eqo.status !== 200 || eqo.json.totalItems === 0, `HTTP ${eqo.status}`);
	for (const [c, id] of [['pmr_assists', aid], ['pmr_equipment', eqa.json?.id], ['pmr_zones', zone.json?.id]]) {
		if (!id) continue;
		await api('DELETE', `/api/collections/${c}/records/${id}`, { token: root });
		auditIds.push(id);
	}

	// --- Opérations : main courante, notifications, passages à niveau, trains suivis ---
	const mod = roles.moderator;
	for (const r of [u, roles.reader, mod]) await api('PATCH', `/api/collections/users/records/${r.id}`, { token: root, body: { district: 'Sud-Ouest' } });
	const lg = await api('POST', '/api/collections/ops_log/records', {
		token: u.token,
		body: { body: `Essai @tmoderator${suffix} voir le PN`, category: 'info', author: u.id, urgent: true }
	});
	check('agent publie une entrée (statut, heure, district, mention posés)', lg.status === 200 && lg.json.status === 'active' && !!lg.json.occurred_at && lg.json.district === 'Sud-Ouest' && lg.json.mentions?.includes(roles.moderator.id), `HTTP ${lg.status}`);
	const lid = lg.json?.id;
	const lgF = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'x', category: 'info', author: roles.admin.id } });
	check('auteur non forgeable', lgF.status >= 400, `HTTP ${lgF.status}`);
	const lgM = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'x', category: 'info', author: u.id, mentions: [roles.admin.id] } });
	check('mentions non forgeables', lgM.status >= 400, `HTTP ${lgM.status}`);
	const lgS = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'x', category: 'info', author: u.id, source: 'irail' } });
	check('source iRail non forgeable', lgS.status >= 400, `HTTP ${lgS.status}`);
	const lgX = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'x', category: 'info', author: u.id, external_id: 'k' } });
	check('identifiant externe non forgeable', lgX.status >= 400, `HTTP ${lgX.status}`);
	const lgXu = await api('PATCH', `/api/collections/ops_log/records/${lid}`, { token: u.token, body: { external_id: 'k' } });
	check('identifiant externe non modifiable', lgXu.status >= 400, `HTTP ${lgXu.status}`);
	// Réponses (1760002300) : rattachées au message d'origine, un seul niveau, `reply_to` figé.
	const rp1 = await api('POST', '/api/collections/ops_log/records', { token: mod.token, body: { body: 'Réponse', category: 'info', author: mod.id, reply_to: lid } });
	check('agent répond à un message', rp1.status === 200 && rp1.json.reply_to === lid, `HTTP ${rp1.status}`);
	const rp2 = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'Réponse 2', category: 'service', author: u.id, reply_to: rp1.json?.id } });
	check('réponse à une réponse rattachée au même fil (catégorie service)', rp2.status === 200 && rp2.json.reply_to === lid, `HTTP ${rp2.status} ${rp2.json?.reply_to}`);
	const rpMove = await api('PATCH', `/api/collections/ops_log/records/${rp2.json?.id}`, { token: u.token, body: { reply_to: rp1.json?.id } });
	check('fil d une réponse figé', rpMove.status >= 400, `HTTP ${rpMove.status}`);
	const rpBad = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'x', category: 'info', author: u.id, reply_to: 'aaaaaaaaaaaaaaa' } });
	check('réponse à un message inexistant refusée', rpBad.status >= 400, `HTTP ${rpBad.status}`);
	const lgR = await api('POST', '/api/collections/ops_log/records', { token: roles.reader.token, body: { body: 'x', category: 'info', author: roles.reader.id } });
	check('lecteur ne publie pas', lgR.status >= 400, `HTTP ${lgR.status}`);
	const lgO = await api('GET', '/api/collections/ops_log/records?perPage=1', { token: roles.otto_agent.token });
	check('otto_agent ne lit pas la main courante', lgO.status !== 200 || lgO.json.totalItems === 0, `HTTP ${lgO.status}`);
	const lgRd = await api('GET', `/api/collections/ops_log/records/${lid}`, { token: roles.reader.token });
	check('lecteur lit une entrée', lgRd.status === 200, `HTTP ${lgRd.status}`);
	const nMod = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.moderator.token });
	check('mention notifiée (une seule, même si urgente)', nMod.json?.items?.length === 1 && nMod.json.items[0].kind === 'mention' && nMod.json.items[0].link.startsWith('/operations/journal'), JSON.stringify(nMod.json?.items?.map((i) => i.kind)));
	const nRd = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.reader.token });
	check('urgence notifiée aux lecteurs du district', nRd.json?.items?.length === 1 && nRd.json.items[0].kind === 'urgent', `${nRd.json?.items?.length}`);
	const nOt = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.otto_agent.token });
	check('otto_agent pas notifié', (nOt.json?.items?.length ?? 0) === 0, `${nOt.json?.items?.length}`);
	const nAll = await api('GET', `/api/collections/notifications/records?perPage=200`, { token: u.token });
	check("l'agent ne voit que ses notifications", (nAll.json?.items ?? []).every((i) => i.user === u.id), `${nAll.json?.items?.length}`);
	const nid = nMod.json?.items?.[0]?.id;
	let np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: u.token, body: { read_at: new Date().toISOString() } });
	check("on ne marque pas lue la notification d'un autre", np.status >= 400, `HTTP ${np.status}`);
	np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: roles.moderator.token, body: { title: 'Faux titre' } });
	check('notification non modifiable (titre)', np.status >= 400, `HTTP ${np.status}`);
	np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: roles.moderator.token, body: { read_at: new Date().toISOString() } });
	check('destinataire marque lu', np.status === 200 && !!np.json.read_at, `HTTP ${np.status}`);
	const nf = await api('POST', '/api/collections/notifications/records', { token: roles.admin.token, body: { user: u.id, kind: 'systeme', title: 'Faux' } });
	check('personne ne crée de notification par l API (BUG-8 v1)', nf.status >= 400, `HTTP ${nf.status}`);
	const lp = (body, token = u.token) => api('PATCH', `/api/collections/ops_log/records/${lid}`, { token, body });
	let lr = await lp({ body: 'Essai corrigé' });
	check('auteur corrige son entrée (edited_at posé)', lr.status === 200 && !!lr.json.edited_at, `HTTP ${lr.status}`);
	lr = await lp({ body: 'Pas à moi' }, roles.denied.token);
	check("un agent ne modifie pas l'entrée d'un autre", lr.status >= 400, `HTTP ${lr.status}`);
	await lp({ urgent: false });
	await lp({ urgent: true });
	const nRd2 = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.reader.token });
	check('urgence diffusée une seule fois par entrée', nRd2.json?.items?.length === 1, `${nRd2.json?.items?.length}`);
	lr = await lp({ notified: [] });
	check('liste des notifiés non forgeable', lr.status >= 400, `HTTP ${lr.status}`);
	lr = await lp({ edited_at: '' });
	check('edited_at non forgeable', lr.status >= 400, `HTTP ${lr.status}`);
	lr = await lp({ status: 'retiree' });
	check('retrait sans motif refusé', lr.status === 400, `HTTP ${lr.status}`);
	lr = await lp({ status: 'retiree', retired_reason: 'Doublon' });
	check("l'auteur retire dans les 15 min", lr.status === 200 && lr.json.status === 'retiree', `HTTP ${lr.status}`);
	const hid = await api('GET', `/api/collections/ops_log/records/${lid}`, { token: roles.reader.token });
	check('entrée retirée masquée aux autres agents', hid.status === 404, `HTTP ${hid.status}`);
	const hidEv = await api('GET', `/api/collections/ops_log_events/records?filter=${encodeURIComponent(`entry="${lid}"`)}`, { token: roles.reader.token });
	check("historique d'une entrée retirée masqué", hidEv.json?.items?.length === 0, `${hidEv.json?.items?.length}`);
	const hidRd = await api('POST', '/api/collections/ops_log_reads/records', { token: roles.reader.token, body: { entry: lid, user: roles.reader.id } });
	check('« Lu » impossible sur une entrée retirée', hidRd.status >= 400, `HTTP ${hidRd.status}`);
	const nGone = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.moderator.token });
	check('notifications de l entrée retirée supprimées', nGone.json?.items?.length === 0, `${nGone.json?.items?.length}`);
	lr = await lp({ status: 'active' });
	check("l'auteur ne rétablit pas (coordinateur)", lr.status === 403, `HTTP ${lr.status}`);
	lr = await lp({ status: 'active' }, roles.moderator.token);
	check('coordinateur rétablit', lr.status === 200 && lr.json.retired_reason === '', `HTTP ${lr.status}`);
	const lev = await api('GET', `/api/collections/ops_log_events/records?sort=at&perPage=50&filter=${encodeURIComponent(`entry="${lid}"`)}`, { token: roles.reader.token });
	const lchain = (lev.json?.items ?? []).map((i) => `${i.kind}:${i.field}`).join(',');
	check('historique de l entrée', lchain === 'create:,edit:body,edit:urgent,edit:urgent,retire:status,restore:status', lchain);
	const levw = await api('POST', '/api/collections/ops_log_events/records', { token: roles.admin.token, body: { entry: lid, kind: 'edit', at: new Date().toISOString() } });
	check("personne n'écrit l'historique de la main courante", levw.status >= 400, `HTTP ${levw.status}`);
	const rd = await api('POST', '/api/collections/ops_log_reads/records', { token: roles.reader.token, body: { entry: lid, user: roles.reader.id } });
	check('lecteur marque « Lu »', rd.status === 200, `HTTP ${rd.status}`);
	const rd2 = await api('POST', '/api/collections/ops_log_reads/records', { token: roles.reader.token, body: { entry: lid, user: u.id } });
	check('« Lu » au nom d un autre refusé', rd2.status >= 400, `HTTP ${rd2.status}`);
	const ld = await api('DELETE', `/api/collections/ops_log/records/${lid}`, { token: roles.moderator.token });
	check('coordinateur ne supprime pas (admin seulement)', ld.status >= 400, `HTTP ${ld.status}`);

	// Passages à niveau : lecture large, écriture coordinateurs (BUG-1 de la v1 : UPDATE ouvert à tous).
	const pn = await api('POST', '/api/collections/level_crossings/records', { token: roles.moderator.token, body: { line: 'L.999', number: '12 bis', zone: 'FMS', active: true, updated_by: roles.moderator.id } });
	check('coordinateur crée un PN', pn.status === 200, `HTTP ${pn.status} ${JSON.stringify(pn.json?.data ?? '')}`);
	const pnU = await api('PATCH', `/api/collections/level_crossings/records/${pn.json?.id}`, { token: roles.reader.token, body: { address: '<img src=x onerror=alert(1)>', updated_by: roles.reader.id } });
	check('lecteur ne modifie pas un PN', pnU.status >= 400, `HTTP ${pnU.status}`);
	const pnA = await api('PATCH', `/api/collections/level_crossings/records/${pn.json?.id}`, { token: u.token, body: { address: 'x', updated_by: u.id } });
	check('agent ne modifie pas un PN', pnA.status >= 400, `HTTP ${pnA.status}`);
	const pnL = await api('GET', `/api/collections/level_crossings/records/${pn.json?.id}`, { token: roles.reader.token });
	check('lecteur lit un PN', pnL.status === 200, `HTTP ${pnL.status}`);
	const pnO = await api('GET', '/api/collections/level_crossings/records?perPage=1', { token: roles.otto_agent.token });
	check('otto_agent ne lit pas les PN', pnO.status !== 200 || pnO.json.totalItems === 0, `HTTP ${pnO.status}`);
	const pnD = await api('POST', '/api/collections/level_crossings/records', { token: roles.moderator.token, body: { line: 'L.999', number: '12 bis', updated_by: roles.moderator.id } });
	check('PN en double (ligne + n°) refusé', pnD.status >= 400, `HTTP ${pnD.status}`);

	// Trains suivis : propres à l'agent, 10 au maximum, aujourd'hui ou demain.
	const bxl = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
	const tw = await api('POST', '/api/collections/train_watches/records', { token: u.token, body: { user: u.id, train: 'IC2134', day: bxl } });
	check('agent suit un train', tw.status === 200 && tw.json.threshold_min === 5, `HTTP ${tw.status}`);
	const twO = await api('GET', `/api/collections/train_watches/records/${tw.json?.id}`, { token: roles.reader.token });
	check("un autre agent ne voit pas le suivi", twO.status === 404, `HTTP ${twO.status}`);
	const twF = await api('POST', '/api/collections/train_watches/records', { token: u.token, body: { user: roles.reader.id, train: 'IC1', day: bxl } });
	check('suivi au nom d un autre refusé', twF.status >= 400, `HTTP ${twF.status}`);
	const twP = await api('POST', '/api/collections/train_watches/records', { token: u.token, body: { user: u.id, train: 'IC2', day: '2020-01-01' } });
	check('suivi d un jour passé refusé', twP.status === 400, `HTTP ${twP.status}`);
	let lastW = 200;
	for (let i = 0; i < 10; i++) lastW = (await api('POST', '/api/collections/train_watches/records', { token: u.token, body: { user: u.id, train: `S${100 + i}`, day: bxl } })).status;
	check('11e train suivi refusé', lastW === 400, `HTTP ${lastW}`);
	const twOtto = await api('POST', '/api/collections/train_watches/records', { token: roles.otto_agent.token, body: { user: roles.otto_agent.id, train: 'IC1', day: bxl } });
	check('otto_agent ne suit pas de train (live:read)', twOtto.status >= 400, `HTTP ${twOtto.status}`);
	for (const [c, id] of [['ops_log', lid], ['level_crossings', pn.json?.id]]) {
		if (!id) continue;
		await api('DELETE', `/api/collections/${c}/records/${id}`, { token: root });
		auditIds.push(id);
	}

	// --- Missions PMR (ingestion DICOS) : compte de service dicos:write, détail nominatif protégé ---
	await api('PATCH', `/api/collections/users/records/${roles.reader.id}`, { token: root, body: { grants: ['dicos:write'] } });
	const svcTok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: `test-reader-${suffix}@csm.invalid`, password: `Test-${suffix}-reader` } })).json?.token;
	const dm = await api('POST', '/api/collections/pmr_assists/records', {
		token: svcTok,
		body: { day: '2099-05-01', time: '07:30', station: 'XDICOS', status: 'realisee', source: 'dicos', dicos_id: `D${suffix}`, created_by: roles.reader.id, updated_by: roles.reader.id }
	});
	check('service dicos:write crée une mission (statut libre)', dm.status === 200, `HTTP ${dm.status}`);
	const did = dm.json?.id;
	const dmForge = await api('POST', '/api/collections/pmr_assists/records', {
		token: u.token,
		body: { day: '2099-05-01', status: 'realisee', source: 'dicos', dicos_id: `F${suffix}`, created_by: u.id, updated_by: u.id }
	});
	check('agent sans dicos:write ne crée pas de mission DICOS', dmForge.status >= 400, `HTTP ${dmForge.status}`);
	const detail = await api('POST', '/api/collections/pmr_mission/records', { token: svcTok, body: { assist: did, client_last: 'Nom test', client_email: 'x@invalid.test' } });
	check('service écrit le détail nominatif', detail.status === 200, `HTTP ${detail.status}`);
	const detailForge = await api('POST', '/api/collections/pmr_mission/records', { token: u.token, body: { assist: did, client_last: 'X' } });
	check('agent n’écrit pas le détail nominatif (dicos:write)', detailForge.status >= 400, `HTTP ${detailForge.status}`);
	const detO = await api('GET', '/api/collections/pmr_mission/records?perPage=1', { token: roles.otto_agent.token });
	check('sans pmr:read, le détail nominatif est invisible', detO.status !== 200 || detO.json.totalItems === 0, `HTTP ${detO.status}`);
	const detR = await api('GET', '/api/collections/pmr_mission/records?perPage=1', { token: svcTok });
	check('avec pmr:read, le détail nominatif est lisible', detR.status === 200 && detR.json.totalItems >= 1, `${detR.json?.totalItems}`);

	// Moindre privilège : le vrai compte de service a le rôle `connector` (hors READERS). Il lit pmr_assists et
	// pmr_mission (branche dicos:write) mais AUCUNE autre donnée nominative (pmr_clients, pmr_assist_legacy).
	const cpass = `Test-${suffix}-connector`;
	const cu = await api('POST', '/api/collections/users/records', {
		token: root,
		body: { email: `test-connector-${suffix}@csm.invalid`, password: cpass, passwordConfirm: cpass, name: 'Test connector', username: `tconn${suffix}`, role: 'connector', grants: ['dicos:write'], verified: true }
	});
	check('compte connector créé (rôle dédié)', cu.status === 200, `HTTP ${cu.status} ${JSON.stringify(cu.json).slice(0, 80)}`);
	if (cu.status === 200) {
		created.push(cu.json.id);
		const ctok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: cu.json.email, password: cpass } })).json?.token;
		const cAssists = await api('GET', '/api/collections/pmr_assists/records?perPage=1', { token: ctok });
		check('connector lit pmr_assists (dédup)', cAssists.status === 200, `HTTP ${cAssists.status}`);
		const cMission = await api('GET', '/api/collections/pmr_mission/records?perPage=1', { token: ctok });
		check('connector lit pmr_mission (dédup)', cMission.status === 200 && cMission.json.totalItems >= 1, `HTTP ${cMission.status} ${cMission.json?.totalItems}`);
		const cClients = await api('GET', '/api/collections/pmr_clients/records?perPage=1', { token: ctok });
		check('connector ne lit PAS pmr_clients', cClients.status !== 200 || cClients.json.totalItems === 0, `HTTP ${cClients.status} ${cClients.json?.totalItems}`);
		const cLegacy = await api('GET', '/api/collections/pmr_assist_legacy/records?perPage=1', { token: ctok });
		check('connector ne lit PAS pmr_assist_legacy', cLegacy.status !== 200 || cLegacy.json.totalItems === 0, `HTTP ${cLegacy.status} ${cLegacy.json?.totalItems}`);
		const cg = await api('POST', '/api/collections/group_missions/records', {
			token: ctok,
			body: { dicos_id: `jc-${suffix}`, day: '2026-10-09', status: 'prevue', group_name: 'Groupe connecteur', adults: 2, children: 10 }
		});
		check('connector crée une mission de groupe', cg.status === 200, `HTTP ${cg.status}`);
		const cgUp = await api('PATCH', `/api/collections/group_missions/records/${cg.json?.id}`, { token: ctok, body: { children: 12 } });
		check('connector met à jour une mission de groupe', cgUp.status === 200, `HTTP ${cgUp.status}`);
		const cgId = await api('PATCH', `/api/collections/group_missions/records/${cg.json?.id}`, { token: ctok, body: { dicos_id: 'autre' } });
		check('dicos_id d une mission de groupe figé', cgId.status >= 400, `HTTP ${cgId.status}`);
		if (cg.json?.id) await api('DELETE', `/api/collections/group_missions/records/${cg.json.id}`, { token: root });
		// Horaires ATMS (1760001800) : écrits par le connecteur seul, lus avec pmr:read, jour et train figés.
		const ts = await api('POST', '/api/collections/train_schedules/records', {
			token: ctok,
			body: { day: '2026-10-09', train: `9${suffix.replace(/\D/g, '').slice(0, 5) || '1'}`, stops: [{ abbr: 'FMS', dwell: 0 }], source: 'atms' }
		});
		check('connector écrit un horaire ATMS', ts.status === 200, `HTTP ${ts.status} ${JSON.stringify(ts.json).slice(0, 80)}`);
		const tsUser = await api('POST', '/api/collections/train_schedules/records', { token: u.token, body: { day: '2026-10-09', train: '1', stops: [] } });
		check('agent n écrit pas les horaires ATMS', tsUser.status >= 400, `HTTP ${tsUser.status}`);
		const tsRead = await api('GET', `/api/collections/train_schedules/records/${ts.json?.id}`, { token: roles.reader.token });
		check('horaires ATMS lisibles avec pmr:read', tsRead.status === 200, `HTTP ${tsRead.status}`);
		const tsOtto = await api('GET', `/api/collections/train_schedules/records/${ts.json?.id}`, { token: roles.otto_agent.token });
		check('otto_agent ne lit pas les horaires ATMS', tsOtto.status >= 400, `HTTP ${tsOtto.status}`);
		const tsMove = await api('PATCH', `/api/collections/train_schedules/records/${ts.json?.id}`, { token: ctok, body: { train: '2' } });
		check('train d un horaire ATMS figé', tsMove.status >= 400, `HTTP ${tsMove.status}`);
		if (ts.json?.id) await api('DELETE', `/api/collections/train_schedules/records/${ts.json.id}`, { token: root });
		// Retards des trains de mission (1760002100) : écrits par le hook seulement, lus avec deplacements:read.
		const mtList = await api('GET', '/api/collections/mission_trains/records', { token: u.token });
		check('agent lit les retards des trains de mission', mtList.status === 200, `HTTP ${mtList.status}`);
		const mtAnon = await api('GET', '/api/collections/mission_trains/records', {});
		check('retards des trains : anonyme sans résultat', mtAnon.status >= 400 || (mtAnon.json?.items?.length ?? 0) === 0, `HTTP ${mtAnon.status}`);
		const mtUser = await api('POST', '/api/collections/mission_trains/records', { token: u.token, body: { day: '2026-10-09', train: 'IC1' } });
		check('agent n écrit pas les retards des trains', mtUser.status >= 400, `HTTP ${mtUser.status}`);
		const mtConn = await api('POST', '/api/collections/mission_trains/records', { token: ctok, body: { day: '2026-10-09', train: 'IC1' } });
		check('connector n écrit pas les retards des trains', mtConn.status >= 400, `HTTP ${mtConn.status}`);
		// ALEA « encodé » (1760002200) : coché par un agent qui écrit les missions, auteur forcé, unique par bloc.
		const amBody = { day: '2026-10-09', kind: 'pmr', block: `2026-10-09|IC1|Mons|IN|${suffix}`, marked_by: u.id };
		const am = await api('POST', '/api/collections/alea_marks/records', { token: u.token, body: amBody });
		check('agent coche un bloc ALEA encodé', am.status === 200, `HTTP ${am.status} ${JSON.stringify(am.json).slice(0, 80)}`);
		const amDup = await api('POST', '/api/collections/alea_marks/records', { token: u.token, body: amBody });
		check('bloc ALEA encodé unique', amDup.status >= 400, `HTTP ${amDup.status}`);
		const amForge = await api('POST', '/api/collections/alea_marks/records', { token: u.token, body: { ...amBody, block: `${amBody.block}x`, marked_by: roles.reader.id } });
		check('auteur d un bloc ALEA encodé non forgeable', amForge.status >= 400, `HTTP ${amForge.status}`);
		const amReader = await api('POST', '/api/collections/alea_marks/records', { token: roles.reader.token, body: { ...amBody, block: `${amBody.block}r`, marked_by: roles.reader.id } });
		check('lecteur ne coche pas ALEA encodé', amReader.status >= 400, `HTTP ${amReader.status}`);
		const amRead = await api('GET', `/api/collections/alea_marks/records/${am.json?.id}`, { token: roles.reader.token });
		check('blocs ALEA encodés lisibles avec deplacements:read', amRead.status === 200, `HTTP ${amRead.status}`);
		const amDel = await api('DELETE', `/api/collections/alea_marks/records/${am.json?.id}`, { token: u.token });
		check('agent décoche un bloc ALEA encodé', amDel.status === 204, `HTTP ${amDel.status}`);
		// Journal des synchros DICOS (1760001900) : écrit par le connecteur, lu avec pmr:read, jamais modifiable.
		const ds = await api('POST', '/api/collections/dicos_syncs/records', {
			token: ctok,
			body: { day: '2026-10-09', kind: 'missions', received: 3, created_count: 1, updated_count: 2 }
		});
		check('connector journalise une synchro DICOS', ds.status === 200, `HTTP ${ds.status}`);
		const dsUser = await api('POST', '/api/collections/dicos_syncs/records', { token: u.token, body: { day: '2026-10-09', kind: 'missions' } });
		check('agent ne journalise pas de synchro DICOS', dsUser.status >= 400, `HTTP ${dsUser.status}`);
		const dsRead = await api('GET', `/api/collections/dicos_syncs/records/${ds.json?.id}`, { token: roles.reader.token });
		check('synchros DICOS lisibles avec pmr:read', dsRead.status === 200, `HTTP ${dsRead.status}`);
		const dsOtto = await api('GET', `/api/collections/dicos_syncs/records/${ds.json?.id}`, { token: roles.otto_agent.token });
		check('otto_agent ne lit pas les synchros DICOS', dsOtto.status >= 400, `HTTP ${dsOtto.status}`);
		const dsEdit = await api('PATCH', `/api/collections/dicos_syncs/records/${ds.json?.id}`, { token: ctok, body: { received: 99 } });
		check('synchro DICOS non modifiable', dsEdit.status >= 400, `HTTP ${dsEdit.status}`);
		if (ds.json?.id) await api('DELETE', `/api/collections/dicos_syncs/records/${ds.json.id}`, { token: root });
		// Jetons de connecteur personnels (1760002000) : pour soi, avec deplacements:read ; lus par le propriétaire,
		// les admins et le connecteur ; usage mis à jour par le connecteur seul ; supprimés à la désactivation.
		const hash = (c) => c.repeat(64);
		const tk = await api('POST', '/api/collections/connector_tokens/records', { token: u.token, body: { user: u.id, label: 'Chrome', token_hash: hash('a'), prefix: 'csmc_aaaa' } });
		check('agent crée son jeton de connecteur', tk.status === 200, `HTTP ${tk.status} ${JSON.stringify(tk.json).slice(0, 80)}`);
		const tkOther = await api('POST', '/api/collections/connector_tokens/records', { token: u.token, body: { user: roles.reader.id, token_hash: hash('b') } });
		check('jeton de connecteur jamais pour un autre agent', tkOther.status >= 400, `HTTP ${tkOther.status}`);
		const tkForged = await api('POST', '/api/collections/connector_tokens/records', { token: u.token, body: { user: u.id, token_hash: hash('c'), last_used: '2026-10-09 10:00:00.000Z' } });
		check('date d usage d un jeton non forgeable', tkForged.status >= 400, `HTTP ${tkForged.status}`);
		const tkOtto = await api('POST', '/api/collections/connector_tokens/records', { token: roles.otto_agent.token, body: { user: roles.otto_agent.id, token_hash: hash('d') } });
		check('otto_agent ne crée pas de jeton de connecteur', tkOtto.status >= 400, `HTTP ${tkOtto.status}`);
		const tkReader = await api('POST', '/api/collections/connector_tokens/records', { token: roles.reader.token, body: { user: roles.reader.id, token_hash: hash('9') } });
		check('lecteur (sans écriture des missions) ne crée pas de jeton', tkReader.status >= 400, `HTTP ${tkReader.status}`);
		const tkPeek = await api('GET', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: roles.moderator.token });
		check('un agent ne voit pas le jeton d un autre', tkPeek.status === 404, `HTTP ${tkPeek.status}`);
		const tkAdmin = await api('GET', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: roles.admin.token });
		check('admin voit les jetons de connecteur', tkAdmin.status === 200, `HTTP ${tkAdmin.status}`);
		const tkFind = await api('GET', `/api/collections/connector_tokens/records?filter=${encodeURIComponent(`token_hash="${hash('a')}"`)}`, { token: ctok });
		check('connector retrouve un jeton par son empreinte', tkFind.status === 200 && tkFind.json?.totalItems === 1, `HTTP ${tkFind.status}`);
		const tkUse = await api('PATCH', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: ctok, body: { last_used: '2026-10-09 10:00:00.000Z', last_version: '1.7.0' } });
		check('connector note l usage d un jeton', tkUse.status === 200, `HTTP ${tkUse.status}`);
		const tkSteal = await api('PATCH', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: ctok, body: { user: roles.reader.id } });
		check('connector ne réattribue pas un jeton', tkSteal.status >= 400, `HTTP ${tkSteal.status}`);
		const tkSelfEdit = await api('PATCH', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: u.token, body: { token_hash: hash('e') } });
		check('agent ne modifie pas l empreinte de son jeton', tkSelfEdit.status >= 400, `HTTP ${tkSelfEdit.status}`);
		const tkDelOther = await api('DELETE', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: roles.reader.token });
		check('un agent ne révoque pas le jeton d un autre', tkDelOther.status === 404, `HTTP ${tkDelOther.status}`);
		const tkDel = await api('DELETE', `/api/collections/connector_tokens/records/${tk.json?.id}`, { token: u.token });
		check('agent révoque son jeton', tkDel.status === 204, `HTTP ${tkDel.status}`);
		// Désactivation du compte : ses jetons disparaissent.
		const dpass = `Test-${suffix}-tokdis`;
		const du = await api('POST', '/api/collections/users/records', { token: root, body: { email: `test-tokdis-${suffix}@csm.invalid`, password: dpass, passwordConfirm: dpass, name: 'Test tokdis', username: `ttokdis${suffix}`, role: 'user', verified: true } });
		if (du.json?.id) created.push(du.json.id);
		const dtok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: du.json?.email, password: dpass } })).json?.token;
		const dk = await api('POST', '/api/collections/connector_tokens/records', { token: dtok, body: { user: du.json?.id, token_hash: hash('f') } });
		await api('PATCH', `/api/collections/users/records/${du.json?.id}`, { token: root, body: { role: 'disabled', disabled_role: 'user' } });
		const dkAfter = await api('GET', `/api/collections/connector_tokens/records/${dk.json?.id}`, { token: root });
		check('jetons supprimés à la désactivation du compte', dk.status === 200 && dkAfter.status === 404, `HTTP ${dk.status}/${dkAfter.status}`);
	}
	// Un agent reste soumis à la table des transitions sur une mission DICOS (réalisée → absent est interdit).
	const dmTrans = await api('PATCH', `/api/collections/pmr_assists/records/${did}`, { token: u.token, body: { status: 'absent', cancel_reason: 'x', updated_by: u.id } });
	check('agent reste soumis aux transitions sur une mission DICOS', dmTrans.status === 400, `HTTP ${dmTrans.status}`);
	await api('PATCH', `/api/collections/users/records/${roles.reader.id}`, { token: root, body: { grants: [] } });
	if (did) { await api('DELETE', `/api/collections/pmr_assists/records/${did}`, { token: root }); auditIds.push(did); }

	// --- Référentiels : annuaire/ptcar/ebp = coordinateurs ; procédures/documents = user + moderator ---
	const rfMod = roles.moderator;
	const rfCt = await api('POST', '/api/collections/directory_contacts/records', { token: rfMod.token, body: { name: 'Contact test', phone: '080012', category: 'MIA', updated_by: rfMod.id } });
	check('coordinateur crée un contact annuaire', rfCt.status === 200, `HTTP ${rfCt.status} ${JSON.stringify(rfCt.json).slice(0,80)}`);
	const rfCtForge = await api('POST', '/api/collections/directory_contacts/records', { token: u.token, body: { name: 'X', updated_by: u.id } });
	check('agent (user) ne crée pas de contact annuaire', rfCtForge.status >= 400, `HTTP ${rfCtForge.status}`);
	const rfCtRead = await api('GET', '/api/collections/directory_contacts/records?perPage=1', { token: roles.reader.token });
	check('lecteur lit l annuaire', rfCtRead.status === 200, `HTTP ${rfCtRead.status}`);
	const rfPc = await api('POST', '/api/collections/ptcar/records', { token: rfMod.token, body: { abbr: `ZZ${suffix}`, name_fr: 'Gare test', updated_by: rfMod.id } });
	check('coordinateur crée un PtCar', rfPc.status === 200, `HTTP ${rfPc.status}`);
	const rfPcDup = await api('POST', '/api/collections/ptcar/records', { token: rfMod.token, body: { abbr: `ZZ${suffix}`, name_fr: 'Doublon', updated_by: rfMod.id } });
	check('PtCar abbr en double refusé', rfPcDup.status >= 400, `HTTP ${rfPcDup.status}`);
	const rfPcOtto = await api('GET', '/api/collections/ptcar/records?perPage=1', { token: roles.otto_agent.token });
	check('otto_agent ne lit pas PtCar', rfPcOtto.status !== 200 || rfPcOtto.json.totalItems === 0, `HTTP ${rfPcOtto.status} ${rfPcOtto.json?.totalItems}`);
	// Procédures et documents : un agent (user) écrit (comme la v1 « documents »).
	const rfDoc = await api('POST', '/api/collections/documents/records', { token: u.token, body: { name: 'Doc test', category: 'PMR', uploaded_by: u.id } });
	check('agent (user) crée un document', rfDoc.status === 200, `HTTP ${rfDoc.status} ${JSON.stringify(rfDoc.json).slice(0,80)}`);
	const rfProc = await api('POST', '/api/collections/procedures/records', { token: u.token, body: { title: 'Procédure test', category: 'PMR', content: '# Test', updated_by: u.id } });
	check('agent (user) crée une procédure', rfProc.status === 200, `HTTP ${rfProc.status}`);
	const rfPid = rfProc.json?.id;
	await api('PATCH', `/api/collections/procedures/records/${rfPid}`, { token: u.token, body: { content: '# Test modifié', updated_by: u.id } });
	const rfVers = await api('GET', `/api/collections/procedure_versions/records?filter=${encodeURIComponent(`procedure="${rfPid}"`)}`, { token: u.token });
	check('modification de procédure → version archivée (hook)', rfVers.status === 200 && rfVers.json.totalItems >= 1, `${rfVers.json?.totalItems}`);
	const rfVersForge = await api('POST', '/api/collections/procedure_versions/records', { token: rfMod.token, body: { procedure: rfPid, title: 'forgé' } });
	check('personne n écrit les versions à la main', rfVersForge.status >= 400, `HTTP ${rfVersForge.status}`);
	await api('PATCH', `/api/collections/procedures/records/${rfPid}`, { token: u.token, body: { attachments: [rfDoc.json.id], updated_by: u.id } });
	const rfDelRef = await api('DELETE', `/api/collections/documents/records/${rfDoc.json.id}`, { token: rfMod.token });
	check('document référencé non supprimable', rfDelRef.status >= 400, `HTTP ${rfDelRef.status}`);
	await api('PATCH', `/api/collections/procedures/records/${rfPid}`, { token: u.token, body: { attachments: [], updated_by: u.id } });
	const rfDelFree = await api('DELETE', `/api/collections/documents/records/${rfDoc.json.id}`, { token: rfMod.token });
	check('document détaché supprimable', rfDelFree.status === 204, `HTTP ${rfDelFree.status}`);
	for (const [c, id] of [['procedures', rfPid], ['ptcar', rfPc.json?.id], ['directory_contacts', rfCt.json?.id]]) if (id) { await api('DELETE', `/api/collections/${c}/records/${id}`, { token: root }); auditIds.push(id); }

	// --- Équipe et Admin (1760001400) : comptes gérés par admin/sysop seuls, Nouveautés, réglages ---
	const eaMail = `ea-${suffix}@csm.invalid`;
	const eaPass = 'Ea-test-123456';
	const eaUserCreate = await api('POST', '/api/collections/users/records', {
		token: u.token,
		body: { email: eaMail, password: eaPass, passwordConfirm: eaPass, role: 'user' }
	});
	check('agent ne crée pas de compte', eaUserCreate.status >= 400, `HTTP ${eaUserCreate.status}`);
	const eaModCreate = await api('POST', '/api/collections/users/records', {
		token: roles.moderator.token,
		body: { email: eaMail, password: eaPass, passwordConfirm: eaPass, role: 'user' }
	});
	check('moderator ne crée pas de compte', eaModCreate.status >= 400, `HTTP ${eaModCreate.status}`);
	const eaAcc = await api('POST', '/api/collections/users/records', {
		token: roles.admin.token,
		body: { email: eaMail, password: eaPass, passwordConfirm: eaPass, role: 'user', name: 'Compte test', verified: true }
	});
	check('admin crée un compte', eaAcc.status === 200, `HTTP ${eaAcc.status}`);
	if (eaAcc.json?.id) created.push(eaAcc.json.id);
	const eaPw = await api('PATCH', `/api/collections/users/records/${eaAcc.json?.id}`, {
		token: roles.admin.token,
		body: { password: 'Ea-reset-654321', passwordConfirm: 'Ea-reset-654321' }
	});
	check('admin réinitialise le mot de passe sans l ancien', eaPw.status === 200, `HTTP ${eaPw.status}`);
	const eaSelfDis = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { disabled_role: 'admin' } });
	check('agent ne pose pas disabled_role sur sa fiche', eaSelfDis.status >= 400, `HTTP ${eaSelfDis.status}`);
	const eaTok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: eaMail, password: 'Ea-reset-654321' } })).json?.token;
	await api('PATCH', `/api/collections/users/records/${eaAcc.json?.id}`, {
		token: roles.admin.token,
		body: { role: 'disabled', disabled_role: 'user' }
	});
	const eaOld = await api('PATCH', `/api/collections/users/records/${eaAcc.json?.id}`, { token: eaTok, body: { name: 'Toujours là' } });
	check('compte désactivé : ancien jeton révoqué', eaOld.status >= 400, `HTTP ${eaOld.status}`);
	const eaUname = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { username: `pris${suffix}` } });
	check('agent ne change pas son identifiant de connexion', eaUname.status >= 400, `HTTP ${eaUname.status}`);
	// Districts du jour (1760001600) : l'agent les coche pour lui-même, jamais pour un autre.
	const dutyDay = new Date().toISOString().slice(0, 10);
	const duty = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { duty_day: dutyDay, duty_districts: ['Sud-Ouest', 'Centre'] } });
	check('agent coche ses districts du jour', duty.status === 200 && duty.json.duty_districts?.length === 2, `HTTP ${duty.status}`);
	const dutyOther = await api('PATCH', `/api/collections/users/records/${roles.reader.id}`, { token: u.token, body: { duty_districts: ['Centre'] } });
	check('agent ne coche pas les districts d un autre', dutyOther.status >= 400, `HTTP ${dutyOther.status}`);
	const dutyBad = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { duty_districts: ['Flandre'] } });
	check('district du jour inconnu refusé', dutyBad.status >= 400, `HTTP ${dutyBad.status}`);
	const eaLogin = await api('POST', '/api/collections/users/auth-with-password', { body: { identity: eaMail, password: 'Ea-reset-654321' } });
	check('compte désactivé : connexion refusée', eaLogin.status >= 400, `HTTP ${eaLogin.status}`);

	const clUser = await api('POST', '/api/collections/changelog/records', { token: u.token, body: { title: 't', type: 'nouveau', author: u.id } });
	check('agent n écrit pas les Nouveautés', clUser.status >= 400, `HTTP ${clUser.status}`);
	const clForge = await api('POST', '/api/collections/changelog/records', {
		token: roles.moderator.token,
		body: { title: 't', type: 'nouveau', author: u.id }
	});
	check('Nouveautés : auteur non forgeable', clForge.status >= 400, `HTTP ${clForge.status}`);
	const clMod = await api('POST', '/api/collections/changelog/records', {
		token: roles.moderator.token,
		body: { title: 'Nouveauté test', type: 'ameliore', content: '**ok**', author: roles.moderator.id }
	});
	check('moderator publie une nouveauté', clMod.status === 200, `HTTP ${clMod.status}`);
	const clRead = await api('GET', `/api/collections/changelog/records/${clMod.json?.id}`, { token: roles.reader.token });
	check('Nouveautés lisibles par un lecteur', clRead.status === 200, `HTTP ${clRead.status}`);
	if (clMod.json?.id) await api('DELETE', `/api/collections/changelog/records/${clMod.json.id}`, { token: root });

	const stUser = await api('POST', '/api/collections/app_settings/records', { token: u.token, body: { key: `t_${suffix}`, value: true, updated_by: u.id } });
	check('agent ne modifie pas les réglages', stUser.status >= 400, `HTTP ${stUser.status}`);
	const stAdmin = await api('POST', '/api/collections/app_settings/records', {
		token: roles.admin.token,
		body: { key: `t_${suffix}`, value: true, updated_by: roles.admin.id }
	});
	check('admin écrit un réglage', stAdmin.status === 200, `HTTP ${stAdmin.status}`);
	const stRead = await api('GET', `/api/collections/app_settings/records/${stAdmin.json?.id}`, { token: roles.reader.token });
	check('réglages lisibles par tout agent actif', stRead.status === 200, `HTTP ${stRead.status}`);
	if (stAdmin.json?.id) await api('DELETE', `/api/collections/app_settings/records/${stAdmin.json.id}`, { token: root });

	// --- Missions de groupe DICOS (1760001500) ---
	const gmBody = { dicos_id: `jg-${suffix}`, day: '2026-10-09', status: 'prevue', group_name: 'École test', adults: 3, children: 20 };
	const gmUser = await api('POST', '/api/collections/group_missions/records', { token: u.token, body: gmBody });
	check('agent n écrit pas les missions de groupe', gmUser.status >= 400, `HTTP ${gmUser.status}`);
	const gmAdminCreate = await api('POST', '/api/collections/group_missions/records', { token: roles.admin.token, body: gmBody });
	check('même un admin n écrit pas les missions de groupe (connecteur seul)', gmAdminCreate.status >= 400, `HTTP ${gmAdminCreate.status}`);
	const gm = await api('POST', '/api/collections/group_missions/records', { token: root, body: gmBody });
	const gmRead = await api('GET', `/api/collections/group_missions/records/${gm.json?.id}`, { token: roles.reader.token });
	check('missions de groupe lisibles avec pmr:read', gmRead.status === 200, `HTTP ${gmRead.status}`);
	const gmOtto = await api('GET', `/api/collections/group_missions/records/${gm.json?.id}`, { token: roles.otto_agent.token });
	check('otto_agent ne lit pas les missions de groupe', gmOtto.status === 404, `HTTP ${gmOtto.status}`);
	if (gm.json?.id) await api('DELETE', `/api/collections/group_missions/records/${gm.json.id}`, { token: root });

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
