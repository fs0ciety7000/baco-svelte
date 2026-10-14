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
const roles = { admin: null, user: null, reader: null, otto_agent: null, denied: null, moderator: null, modo: null };
// Rôles v2 (11 oct. 2026) : les clés historiques des tests désignent désormais PACO/RCCA (user, moderator, denied)
// ou Invité (reader, otto_agent : lecture des commandes bus et taxi seulement).
const ROLE_OF = { admin: 'admin', user: 'paco', moderator: 'paco', denied: 'paco', reader: 'guest', otto_agent: 'guest', modo: 'moderator' };
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
				role: ROLE_OF[role],
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
	// N° de train (1760003800) : chiffres seulement, 6 au plus.
	let t = await patch(u.token, { train_number: '1706' });
	check('n° de train enregistré', t.status === 200 && t.json.train_number === '1706', `HTTP ${t.status}`);
	t = await patch(u.token, { train_number: 'IC1706' });
	check('n° de train non numérique refusé', t.status === 400, `HTTP ${t.status}`);
	// Cycle v3 (14 oct. 2026) : brouillon / en cours → terminé (bus démobilisés) → envoyé / finalisé ; annulé.
	t = await patch(u.token, { status: 'envoye' });
	check('brouillon → envoyé refusé (passer par « terminé »)', t.status === 400, `HTTP ${t.status}`);
	t = await patch(roles.otto_agent.token, { status: 'termine' });
	check("l'invité ne termine pas (lecture seule)", t.status >= 400, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'termine' });
	check('brouillon → terminé (heure de fin posée)', t.status === 200 && t.json.ended_by === u.id && !!t.json.ended_at, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'brouillon' });
	check('terminé → brouillon (retour, heure de fin effacée)', t.status === 200 && !t.json.ended_at, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'termine' });
	t = await patch(u.token, { validated_by: u.id, sent_by_name: 'X' });
	check('attribution reprise de BACO non modifiable', t.status >= 400, `HTTP ${t.status}`);
	// Envoi permis sans adresse e-mail (PDF seul) — décision du 9 oct. 2026.
	t = await patch(u.token, { status: 'envoye' });
	check('terminé → envoyé sans e-mail (heure d\'envoi posée)', t.status === 200 && t.json.sent_by === u.id && !!t.json.sent_at, `HTTP ${t.status}`);
	t = await patch(u.token, { sent_by: roles.admin.id });
	check('sent_by non modifiable', t.status >= 400, `HTTP ${t.status}`);
	t = await patch(u.token, { reason: 'Modif après envoi' });
	check('bon finalisé non modifiable (rouvrir d\'abord)', t.status === 400, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'annule', cancel_reason: 'Après envoi' });
	check('envoyé / finalisé : annulation refusée', t.status === 400, `HTTP ${t.status}`);
	// Rouvrir un bon finalisé : coordinateurs, dont les PACO/RCCA (décision du 11 oct. 2026).
	t = await patch(u.token, { status: 'termine' });
	check('PACO/RCCA rouvre un bon envoyé (→ terminé)', t.status === 200 && !t.json.sent_at, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'annule' });
	check('annulation sans motif refusée', t.status === 400, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'annule', cancel_reason: 'Test annulation' });
	check('annulation avec motif depuis « terminé »', t.status === 200 && t.json.status_before_cancel === 'termine', `HTTP ${t.status}`);
	t = await patch(roles.otto_agent.token, { reason: 'Modif après annulation' });
	check("l'invité ne modifie pas une commande annulée", t.status >= 400, `HTTP ${t.status}`);
	t = await patch(roles.admin.token, { status: 'brouillon' });
	check('rétablir vers un autre statut que le précédent refusé', t.status === 400, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'termine' });
	check('PACO/RCCA rétablit au statut précédent', t.status === 200 && !t.json.cancelled_at, `HTTP ${t.status}`);
	t = await patch(u.token, { status: 'confirme' });
	check('« confirmé » n\'existe plus', t.status >= 400, `HTTP ${t.status}`);
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
	check('historique horodaté lisible (invité)', chain === 'brouillon,termine,brouillon,termine,envoye,termine,annule,termine', chain);
	check("historique : auteur de la fin", ev.json?.items?.[1]?.by === u.id && ev.json?.items?.[1]?.from === 'brouillon');
	const evc = await api('POST', '/api/collections/order_events/records', {
		token: roles.admin.token,
		body: { kind: 'bus', order: bid, to: 'termine', at: new Date().toISOString() }
	});
	check("personne n'écrit l'historique à la main", evc.status >= 400, `HTTP ${evc.status}`);

	// PMR : l'invité n'y a pas accès (il lit les taxis) ; un agent crée en son nom seulement.
	for (const c of ['pmr_clients', 'pmr_assists', 'ops_log', 'directory_contacts', 'documents']) {
		const r = await api('GET', `/api/collections/${c}/records?perPage=1`, { token: roles.otto_agent.token });
		check(`l'invité ne lit pas ${c}`, r.status !== 200 || r.json.totalItems === 0, `HTTP ${r.status}`);
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
	check("l'invité lit l'historique taxi", txe.json?.totalItems === 1, `${txe.json?.totalItems}`);
	const txg = await api('GET', `/api/collections/taxi_orders/records/${tx.json.id}`, { token: roles.otto_agent.token });
	check("l'invité lit une commande taxi", txg.status === 200, `HTTP ${txg.status}`);
	const txw = await api('PATCH', `/api/collections/taxi_orders/records/${tx.json.id}`, { token: roles.otto_agent.token, body: { to_station: 'X' } });
	check("l'invité ne modifie pas une commande taxi", txw.status >= 400, `HTTP ${txw.status}`);
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
	check("l'invité ne modifie pas un modèle", tpo.status >= 400, `HTTP ${tpo.status}`);
	const tpm = await api('PATCH', `/api/collections/order_templates/records/${tp.json.id}`, { token: roles.moderator.token, body: { name: 'Modifié' } });
	check('modèle partagé modifiable par un autre PACO/RCCA', tpm.status === 200, `HTTP ${tpm.status}`);
	const tpd = await api('DELETE', `/api/collections/order_templates/records/${tp.json.id}`, { token: roles.moderator.token });
	check('PACO/RCCA ne supprime pas un modèle (otto:delete)', tpd.status >= 400, `HTTP ${tpd.status}`);
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
	check("l'invité ne crée pas de modèle taxi", tpt.status >= 400, `HTTP ${tpt.status}`);

	// B201 (rôles v2) : écrite par tout PACO/RCCA, quel que soit son district ; l'invité ne la lit pas.
	const b2a = await api('POST', '/api/collections/b201_reports/records', { token: u.token, body: { day: '2099-02-01', updated_by: u.id } });
	check('PACO/RCCA sans district écrit la B201', b2a.status === 200, `HTTP ${b2a.status}`);
	const ox = await api('POST', '/api/collections/b201_reports/records', { token: roles.otto_agent.token, body: { day: '2099-02-02', updated_by: roles.otto_agent.id } });
	check("l'invité n'écrit pas la B201", ox.status >= 400, `HTTP ${ox.status}`);
	await api('PATCH', `/api/collections/users/records/${roles.denied.id}`, { token: root, body: { denies: ['otto:write', 'b201:write'] } });
	const xd = await api('POST', '/api/collections/b201_reports/records', { token: roles.denied.token, body: { day: '2099-02-03', updated_by: roles.denied.id } });
	check("b201:write retiré → pas d'écriture", xd.status >= 400, `HTTP ${xd.status}`);
	if (b2a.json?.id) {
		const b2u = await api('PATCH', `/api/collections/b201_reports/records/${b2a.json.id}`, { token: roles.denied.token, body: { updated_by: roles.denied.id } });
		check('b201:write retiré : la modification (b201:update) reste permise', b2u.status === 200, `HTTP ${b2u.status}`);
		const b2x = await api('DELETE', `/api/collections/b201_reports/records/${b2a.json.id}`, { token: u.token });
		check('PACO/RCCA ne supprime pas la B201', b2x.status >= 400, `HTTP ${b2x.status}`);
		await api('DELETE', `/api/collections/b201_reports/records/${b2a.json.id}`, { token: root });
		auditIds.push(b2a.json.id);
	}
	const b2 = await api('POST', '/api/collections/b201_reports/records', { token: roles.admin.token, body: { day: '2099-01-01', notes: {}, updated_by: roles.admin.id } });
	check('admin crée la B201 du jour', b2.status === 200, `HTTP ${b2.status}`);
	const b2d = await api('POST', '/api/collections/b201_reports/records', { token: roles.admin.token, body: { day: '2099-01-01', updated_by: roles.admin.id } });
	check('une seule B201 par jour', b2d.status >= 400, `HTTP ${b2d.status}`);
	const b2r = await api('GET', `/api/collections/b201_reports/records/${b2.json.id}`, { token: roles.reader.token });
	check("l'invité ne lit pas la B201", b2r.status >= 400, `HTTP ${b2r.status}`);
	const b2p = await api('GET', `/api/collections/b201_reports/records/${b2.json.id}`, { token: roles.moderator.token });
	check('PACO/RCCA lit la B201', b2p.status === 200, `HTTP ${b2p.status}`);
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
	const zu = await api('POST', '/api/collections/pmr_zones/records', { token: roles.reader.token, body: { code: `G${suffix.toUpperCase().slice(0, 4)}` } });
	check("l'invité ne crée pas de zone", zu.status >= 400, `HTTP ${zu.status}`);
	const zp = await api('POST', '/api/collections/pmr_zones/records', { token: u.token, body: { code: `P${suffix.toUpperCase().slice(0, 4)}` } });
	check('PACO/RCCA crée une zone (coordinateur)', zp.status === 200, `HTTP ${zp.status}`);
	if (zp.json?.id) { await api('DELETE', `/api/collections/pmr_zones/records/${zp.json.id}`, { token: root }); auditIds.push(zp.json.id); }
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
	const pev = await api('GET', `/api/collections/pmr_events/records?sort=at&perPage=50&filter=${encodeURIComponent(`record="${aid}"`)}`, { token: roles.denied.token });
	const pchain = (pev.json?.items ?? []).map((i) => `${i.field}:${i.to}`).join(',');
	check('historique de la prestation', pchain === 'status:prevue,status:annulee,status:prevue,time:15:10', pchain);
	const pew = await api('POST', '/api/collections/pmr_events/records', { token: roles.admin.token, body: { kind: 'assist', record: aid, to: 'x', at: new Date().toISOString() } });
	check("personne n'écrit l'historique PMR à la main", pew.status >= 400, `HTTP ${pew.status}`);

	// Matériel : création par les coordinateurs, état par tout agent pmr:write.
	const eq = await api('POST', '/api/collections/pmr_equipment/records', { token: roles.otto_agent.token, body: { station: 'XTEST', state: 'ok', updated_by: roles.otto_agent.id } });
	check("l'invité ne crée pas de matériel", eq.status >= 400, `HTTP ${eq.status}`);
	const eqa = await api('POST', '/api/collections/pmr_equipment/records', { token: roles.admin.token, body: { station: 'XTEST', state: 'ok', updated_by: roles.admin.id } });
	check('coordinateur crée une rampe', eqa.status === 200, `HTTP ${eqa.status}`);
	const equ = await api('PATCH', `/api/collections/pmr_equipment/records/${eqa.json?.id}`, { token: u.token, body: { state: 'hs', state_note: 'Charnière cassée', updated_by: u.id } });
	check('agent passe une rampe hors service', equ.status === 200 && equ.json.state === 'hs', `HTTP ${equ.status}`);
	const eqs = await api('PATCH', `/api/collections/pmr_equipment/records/${eqa.json?.id}`, { token: u.token, body: { station: 'AUTRE', updated_by: u.id } });
	check('PACO/RCCA modifie la gare d\'une rampe (coordinateur)', eqs.status === 200, `HTTP ${eqs.status}`);
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
	for (const r of [u, roles.denied, mod]) await api('PATCH', `/api/collections/users/records/${r.id}`, { token: root, body: { district: 'Sud-Ouest' } });
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
	check("l'invité ne publie pas", lgR.status >= 400, `HTTP ${lgR.status}`);
	const lgO = await api('GET', '/api/collections/ops_log/records?perPage=1', { token: roles.otto_agent.token });
	check("l'invité ne lit pas le Journal", lgO.status !== 200 || lgO.json.totalItems === 0, `HTTP ${lgO.status}`);
	const lgRd = await api('GET', `/api/collections/ops_log/records/${lid}`, { token: roles.denied.token });
	check('PACO/RCCA lit une entrée', lgRd.status === 200, `HTTP ${lgRd.status}`);
	const nMod = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.moderator.token });
	check('mention notifiée (une seule, même si urgente)', nMod.json?.items?.length === 1 && nMod.json.items[0].kind === 'mention' && nMod.json.items[0].link.startsWith('/operations/journal'), JSON.stringify(nMod.json?.items?.map((i) => i.kind)));
	const nRd = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.denied.token });
	check('urgence notifiée aux PACO/RCCA du district', nRd.json?.items?.length === 1 && nRd.json.items[0].kind === 'urgent', `${nRd.json?.items?.length}`);
	const nOt = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.otto_agent.token });
	check("l'invité pas notifié", (nOt.json?.items?.length ?? 0) === 0, `${nOt.json?.items?.length}`);
	const nAll = await api('GET', `/api/collections/notifications/records?perPage=200`, { token: u.token });
	check("l'agent ne voit que ses notifications", (nAll.json?.items ?? []).every((i) => i.user === u.id), `${nAll.json?.items?.length}`);
	const nid = nMod.json?.items?.[0]?.id;
	let np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: u.token, body: { read_at: new Date().toISOString() } });
	check("on ne marque pas lue la notification d'un autre", np.status >= 400, `HTTP ${np.status}`);
	np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: roles.moderator.token, body: { title: 'Faux titre' } });
	check('notification non modifiable (titre)', np.status >= 400, `HTTP ${np.status}`);
	np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: roles.moderator.token, body: { districts: ['Centre'] } });
	check('districts d une notification non modifiables (1760004000)', np.status >= 400, `HTTP ${np.status}`);
	{
		const urg = nRd.json?.items?.[0];
		const entry = (await api('GET', `/api/collections/ops_log/records/${lid}`, { token: roles.denied.token })).json;
		const want = entry?.district ? [entry.district] : [];
		check('urgence rattachée au district de l entrée', JSON.stringify(urg?.districts ?? []) === JSON.stringify(want), `${JSON.stringify(urg?.districts)} / ${JSON.stringify(want)}`);
	}
	np = await api('PATCH', `/api/collections/notifications/records/${nid}`, { token: roles.moderator.token, body: { read_at: new Date().toISOString() } });
	check('destinataire marque lu', np.status === 200 && !!np.json.read_at, `HTTP ${np.status}`);
	const nf = await api('POST', '/api/collections/notifications/records', { token: roles.admin.token, body: { user: u.id, kind: 'systeme', title: 'Faux' } });
	check('personne ne crée de notification par l API (BUG-8 v1)', nf.status >= 400, `HTTP ${nf.status}`);
	const lp = (body, token = u.token) => api('PATCH', `/api/collections/ops_log/records/${lid}`, { token, body });
	let lr = await lp({ body: 'Essai corrigé' });
	check('auteur corrige son entrée (edited_at posé)', lr.status === 200 && !!lr.json.edited_at, `HTTP ${lr.status}`);
	lr = await lp({ body: 'Pas à moi' }, roles.reader.token);
	check("l'invité ne modifie pas une entrée", lr.status >= 400, `HTTP ${lr.status}`);
	await lp({ urgent: false });
	await lp({ urgent: true });
	const nRd2 = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.denied.token });
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
	check("entrée retirée masquée à l'invité", hid.status === 404, `HTTP ${hid.status}`);
	const hidEv = await api('GET', `/api/collections/ops_log_events/records?filter=${encodeURIComponent(`entry="${lid}"`)}`, { token: roles.denied.token });
	check("historique d'une entrée retirée masqué aux PACO/RCCA (modération)", hidEv.json?.items?.length === 0, `${hidEv.json?.items?.length}`);
	const hidRd = await api('POST', '/api/collections/ops_log_reads/records', { token: roles.denied.token, body: { entry: lid, user: roles.denied.id } });
	check('« Lu » impossible sur une entrée retirée', hidRd.status >= 400, `HTTP ${hidRd.status}`);
	const nGone = await api('GET', `/api/collections/notifications/records?filter=${encodeURIComponent(`source_id="${lid}"`)}`, { token: roles.moderator.token });
	check('notifications de l entrée retirée supprimées', nGone.json?.items?.length === 0, `${nGone.json?.items?.length}`);
	lr = await lp({ status: 'active' });
	check("l'auteur PACO/RCCA ne rétablit pas (modérateur)", lr.status >= 400, `HTTP ${lr.status}`);
	lr = await lp({ status: 'active' }, roles.modo.token);
	check('modérateur rétablit', lr.status === 200 && lr.json.retired_reason === '', `HTTP ${lr.status}`);
	lr = await lp({ status: 'retiree', retired_reason: 'x' }, roles.reader.token);
	check("l'invité ne retire pas", lr.status >= 400, `HTTP ${lr.status}`);
	const lev = await api('GET', `/api/collections/ops_log_events/records?sort=at&perPage=50&filter=${encodeURIComponent(`entry="${lid}"`)}`, { token: roles.denied.token });
	const lchain = (lev.json?.items ?? []).map((i) => `${i.kind}:${i.field}`).join(',');
	check('historique de l entrée', lchain === 'create:,edit:body,edit:urgent,edit:urgent,retire:status,restore:status', lchain);
	const levw = await api('POST', '/api/collections/ops_log_events/records', { token: roles.admin.token, body: { entry: lid, kind: 'edit', at: new Date().toISOString() } });
	check("personne n'écrit l'historique de la main courante", levw.status >= 400, `HTTP ${levw.status}`);
	const rd = await api('POST', '/api/collections/ops_log_reads/records', { token: roles.denied.token, body: { entry: lid, user: roles.denied.id } });
	check('PACO/RCCA marque « Lu »', rd.status === 200, `HTTP ${rd.status}`);
	const rd2 = await api('POST', '/api/collections/ops_log_reads/records', { token: roles.denied.token, body: { entry: lid, user: u.id } });
	check('« Lu » au nom d un autre refusé', rd2.status >= 400, `HTTP ${rd2.status}`);
	const ld = await api('DELETE', `/api/collections/ops_log/records/${lid}`, { token: roles.moderator.token });
	check('PACO/RCCA ne supprime pas (journal:delete)', ld.status >= 400, `HTTP ${ld.status}`);

	// Passages à niveau : lecture large, écriture coordinateurs (BUG-1 de la v1 : UPDATE ouvert à tous).
	const pn = await api('POST', '/api/collections/level_crossings/records', { token: roles.moderator.token, body: { line: 'L.999', number: '12 bis', zone: 'FMS', active: true, updated_by: roles.moderator.id } });
	check('coordinateur crée un PN', pn.status === 200, `HTTP ${pn.status} ${JSON.stringify(pn.json?.data ?? '')}`);
	const pnU = await api('PATCH', `/api/collections/level_crossings/records/${pn.json?.id}`, { token: roles.reader.token, body: { address: '<img src=x onerror=alert(1)>', updated_by: roles.reader.id } });
	check("l'invité ne modifie pas un PN", pnU.status >= 400, `HTTP ${pnU.status}`);
	const pnA = await api('PATCH', `/api/collections/level_crossings/records/${pn.json?.id}`, { token: u.token, body: { address: 'x', updated_by: u.id } });
	check('PACO/RCCA modifie un PN', pnA.status === 200, `HTTP ${pnA.status}`);
	const pnL = await api('GET', `/api/collections/level_crossings/records/${pn.json?.id}`, { token: roles.denied.token });
	check('PACO/RCCA lit un PN', pnL.status === 200, `HTTP ${pnL.status}`);
	const pnO = await api('GET', '/api/collections/level_crossings/records?perPage=1', { token: roles.otto_agent.token });
	check("l'invité ne lit pas les PN", pnO.status !== 200 || pnO.json.totalItems === 0, `HTTP ${pnO.status}`);
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
		check("l'invité ne coche pas ALEA encodé", amReader.status >= 400, `HTTP ${amReader.status}`);
		const amRead = await api('GET', `/api/collections/alea_marks/records/${am.json?.id}`, { token: roles.denied.token });
		check('blocs ALEA encodés lisibles par un PACO/RCCA (deplacements:read)', amRead.status === 200, `HTTP ${amRead.status}`);
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
		const du = await api('POST', '/api/collections/users/records', { token: root, body: { email: `test-tokdis-${suffix}@csm.invalid`, password: dpass, passwordConfirm: dpass, name: 'Test tokdis', username: `ttokdis${suffix}`, role: 'paco', verified: true } });
		if (du.json?.id) created.push(du.json.id);
		const dtok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: du.json?.email, password: dpass } })).json?.token;
		const dk = await api('POST', '/api/collections/connector_tokens/records', { token: dtok, body: { user: du.json?.id, token_hash: hash('f') } });
		await api('PATCH', `/api/collections/users/records/${du.json?.id}`, { token: root, body: { role: 'disabled', disabled_role: 'paco' } });
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
	const rfCtForge = await api('POST', '/api/collections/directory_contacts/records', { token: roles.reader.token, body: { name: 'X', updated_by: roles.reader.id } });
	check("l'invité ne crée pas de contact annuaire", rfCtForge.status >= 400, `HTTP ${rfCtForge.status}`);
	const rfCtDel = await api('DELETE', `/api/collections/directory_contacts/records/${rfCt.json?.id}`, { token: u.token });
	check('PACO/RCCA ne supprime pas un contact (repertoire:delete)', rfCtDel.status >= 400, `HTTP ${rfCtDel.status}`);
	const rfCtRead = await api('GET', '/api/collections/directory_contacts/records?perPage=1', { token: roles.denied.token });
	check('PACO/RCCA lit l annuaire', rfCtRead.status === 200, `HTTP ${rfCtRead.status}`);
	const rfPc = await api('POST', '/api/collections/ptcar/records', { token: rfMod.token, body: { abbr: `ZZ${suffix}`, name_fr: 'Gare test', updated_by: rfMod.id } });
	check('coordinateur crée un PtCar', rfPc.status === 200, `HTTP ${rfPc.status}`);
	const rfPcDup = await api('POST', '/api/collections/ptcar/records', { token: rfMod.token, body: { abbr: `ZZ${suffix}`, name_fr: 'Doublon', updated_by: rfMod.id } });
	check('PtCar abbr en double refusé', rfPcDup.status >= 400, `HTTP ${rfPcDup.status}`);
	const rfPcOtto = await api('GET', '/api/collections/ptcar/records?perPage=1', { token: roles.otto_agent.token });
	check("l'invité ne lit pas PtCar", rfPcOtto.status !== 200 || rfPcOtto.json.totalItems === 0, `HTTP ${rfPcOtto.status} ${rfPcOtto.json?.totalItems}`);
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
	const rfDelRef = await api('DELETE', `/api/collections/documents/records/${rfDoc.json.id}`, { token: roles.admin.token });
	check('document référencé non supprimable (même par un admin)', rfDelRef.status >= 400, `HTTP ${rfDelRef.status}`);
	await api('PATCH', `/api/collections/procedures/records/${rfPid}`, { token: u.token, body: { attachments: [], updated_by: u.id } });
	const rfDelPaco = await api('DELETE', `/api/collections/documents/records/${rfDoc.json.id}`, { token: rfMod.token });
	check('PACO/RCCA ne supprime pas un document (documents:delete)', rfDelPaco.status >= 400, `HTTP ${rfDelPaco.status}`);
	const rfDelFree = await api('DELETE', `/api/collections/documents/records/${rfDoc.json.id}`, { token: roles.admin.token });
	check('document détaché supprimable (admin)', rfDelFree.status === 204, `HTTP ${rfDelFree.status}`);
	for (const [c, id] of [['procedures', rfPid], ['ptcar', rfPc.json?.id], ['directory_contacts', rfCt.json?.id]]) if (id) { await api('DELETE', `/api/collections/${c}/records/${id}`, { token: root }); auditIds.push(id); }

	// --- Équipe et Admin (1760001400) : comptes gérés par admin/sysop seuls, Nouveautés, réglages ---
	const eaMail = `ea-${suffix}@csm.invalid`;
	const eaPass = 'Ea-test-123456';
	const eaUserCreate = await api('POST', '/api/collections/users/records', {
		token: u.token,
		body: { email: eaMail, password: eaPass, passwordConfirm: eaPass, role: 'paco' }
	});
	check('agent ne crée pas de compte', eaUserCreate.status >= 400, `HTTP ${eaUserCreate.status}`);
	const eaModCreate = await api('POST', '/api/collections/users/records', {
		token: roles.moderator.token,
		body: { email: eaMail, password: eaPass, passwordConfirm: eaPass, role: 'paco' }
	});
	check('moderator ne crée pas de compte', eaModCreate.status >= 400, `HTTP ${eaModCreate.status}`);
	const eaAcc = await api('POST', '/api/collections/users/records', {
		token: roles.admin.token,
		body: { email: eaMail, password: eaPass, passwordConfirm: eaPass, role: 'paco', name: 'Compte test', verified: true }
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
		body: { role: 'disabled', disabled_role: 'paco' }
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
	check("PACO/RCCA n'écrit pas les Nouveautés (administrateurs)", clMod.status >= 400, `HTTP ${clMod.status}`);
	const clAdm = await api('POST', '/api/collections/changelog/records', {
		token: roles.admin.token,
		body: { title: 'Nouveauté test', type: 'ameliore', content: '**ok**', author: roles.admin.id }
	});
	check('admin publie une nouveauté', clAdm.status === 200, `HTTP ${clAdm.status}`);
	const clRead = await api('GET', `/api/collections/changelog/records/${clAdm.json?.id}`, { token: roles.reader.token });
	check("Nouveautés masquées à l'invité", clRead.status === 404, `HTTP ${clRead.status}`);
	const clPaco = await api('GET', `/api/collections/changelog/records/${clAdm.json?.id}`, { token: u.token });
	check('Nouveautés lisibles par un PACO/RCCA', clPaco.status === 200, `HTTP ${clPaco.status}`);
	for (const c of [clMod, clAdm]) if (c.json?.id) await api('DELETE', `/api/collections/changelog/records/${c.json.id}`, { token: root });

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

	// --- Rôles v2 (1760002800) : droits L/É/M/S, héritage, districts ---
	{
		const g = roles.reader; // invité
		await api('PATCH', `/api/collections/users/records/${g.id}`, { token: root, body: { grants: ['otto:write'] } });
		const v2c = await api('POST', '/api/collections/bus_orders/records', { token: g.token, body: { status: 'brouillon', created_by: g.id } });
		check('invité + otto:write accordé : crée un bon', v2c.status === 200, `HTTP ${v2c.status}`);
		const v2u = await api('PATCH', `/api/collections/bus_orders/records/${v2c.json?.id}`, { token: g.token, body: { reason: 'x' } });
		check('invité + otto:write seul : ne modifie pas (otto:update)', v2u.status >= 400, `HTTP ${v2u.status}`);
		await api('PATCH', `/api/collections/users/records/${g.id}`, { token: root, body: { grants: ['otto:write', 'otto:update', 'otto:delete'] } });
		const v2u2 = await api('PATCH', `/api/collections/bus_orders/records/${v2c.json?.id}`, { token: g.token, body: { reason: 'x' } });
		check('otto:update accordé : modifie', v2u2.status === 200, `HTTP ${v2u2.status}`);
		const v2d = await api('DELETE', `/api/collections/bus_orders/records/${v2c.json?.id}`, { token: g.token });
		check('otto:delete accordé : supprime', v2d.status === 204, `HTTP ${v2d.status}`);
		if (v2c.json?.id) auditIds.push(v2c.json.id);
		await api('PATCH', `/api/collections/users/records/${g.id}`, { token: root, body: { grants: [] } });
		const pacoBus = await api('POST', '/api/collections/bus_orders/records', { token: u.token, body: { status: 'brouillon', created_by: u.id } });
		await api('PATCH', `/api/collections/users/records/${roles.moderator.id}`, { token: root, body: { denies: ['otto:update'] } });
		const v2nu = await api('PATCH', `/api/collections/bus_orders/records/${pacoBus.json?.id}`, { token: roles.moderator.token, body: { reason: 'y' } });
		check('PACO/RCCA avec otto:update retiré : ne modifie pas', v2nu.status >= 400, `HTTP ${v2nu.status}`);
		const v2nc = await api('POST', '/api/collections/bus_orders/records', { token: roles.moderator.token, body: { status: 'brouillon', created_by: roles.moderator.id } });
		check('… mais crée encore (otto:write hérité)', v2nc.status === 200, `HTTP ${v2nc.status}`);
		const v2pd = await api('DELETE', `/api/collections/bus_orders/records/${pacoBus.json?.id}`, { token: u.token });
		check('PACO/RCCA ne supprime pas un bon', v2pd.status >= 400, `HTTP ${v2pd.status}`);
		await api('PATCH', `/api/collections/users/records/${roles.moderator.id}`, { token: root, body: { denies: [] } });
		for (const r of [pacoBus, v2nc]) if (r.json?.id) { await api('DELETE', `/api/collections/bus_orders/records/${r.json.id}`, { token: root }); auditIds.push(r.json.id); }
		// Modérateur : PACO/RCCA + suppression partout et Nouveautés ; ni comptes ni réglages.
		const md = roles.modo;
		const mdBus = await api('POST', '/api/collections/bus_orders/records', { token: md.token, body: { status: 'brouillon', created_by: md.id } });
		check('modérateur crée un bon', mdBus.status === 200, `HTTP ${mdBus.status}`);
		const mdUpd = await api('PATCH', `/api/collections/bus_orders/records/${mdBus.json?.id}`, { token: md.token, body: { reason: 'm' } });
		check('modérateur modifie un bon', mdUpd.status === 200, `HTTP ${mdUpd.status}`);
		const mdDel = await api('DELETE', `/api/collections/bus_orders/records/${mdBus.json?.id}`, { token: md.token });
		check('modérateur supprime un bon', mdDel.status === 204, `HTTP ${mdDel.status}`);
		if (mdBus.json?.id) auditIds.push(mdBus.json.id);
		const mdCt = await api('POST', '/api/collections/directory_contacts/records', { token: md.token, body: { name: 'Contact modo', updated_by: md.id } });
		const mdCtDel = await api('DELETE', `/api/collections/directory_contacts/records/${mdCt.json?.id}`, { token: md.token });
		check('modérateur supprime un contact', mdCt.status === 200 && mdCtDel.status === 204, `HTTP ${mdCt.status}/${mdCtDel.status}`);
		if (mdCt.json?.id) auditIds.push(mdCt.json.id);
		const mdCl = await api('POST', '/api/collections/changelog/records', { token: md.token, body: { title: 'Modo', type: 'nouveau', author: md.id } });
		check('modérateur publie une nouveauté', mdCl.status === 200, `HTTP ${mdCl.status}`);
		if (mdCl.json?.id) await api('DELETE', `/api/collections/changelog/records/${mdCl.json.id}`, { token: md.token });
		await api('PATCH', `/api/collections/users/records/${md.id}`, { token: root, body: { denies: ['otto:delete'] } });
		const mdBus2 = await api('POST', '/api/collections/bus_orders/records', { token: md.token, body: { status: 'brouillon', created_by: md.id } });
		const mdDel2 = await api('DELETE', `/api/collections/bus_orders/records/${mdBus2.json?.id}`, { token: md.token });
		check('modérateur avec otto:delete retiré : ne supprime pas', mdDel2.status >= 400, `HTTP ${mdDel2.status}`);
		if (mdBus2.json?.id) { await api('DELETE', `/api/collections/bus_orders/records/${mdBus2.json.id}`, { token: root }); auditIds.push(mdBus2.json.id); }
		await api('PATCH', `/api/collections/users/records/${md.id}`, { token: root, body: { denies: [] } });
		const mdRole = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: md.token, body: { role: 'admin' } });
		check('modérateur ne gère pas les comptes', mdRole.status >= 400, `HTTP ${mdRole.status}`);
		const mdSelf = await api('PATCH', `/api/collections/users/records/${md.id}`, { token: md.token, body: { role: 'admin' } });
		check('modérateur ne change pas son rôle', mdSelf.status >= 400, `HTTP ${mdSelf.status}`);
		const mdSet = await api('POST', '/api/collections/app_settings/records', { token: md.token, body: { key: `m_${suffix}`, value: true, updated_by: md.id } });
		check('modérateur ne modifie pas les réglages', mdSet.status >= 400, `HTTP ${mdSet.status}`);
		const dSelf = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { districts: ['Centre'] } });
		check('districts réservés à l admin', dSelf.status >= 400, `HTTP ${dSelf.status}`);
		const dAdm = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: roles.admin.token, body: { districts: ['Sud-Ouest', 'Centre'] } });
		check('admin règle plusieurs districts', dAdm.status === 200 && dAdm.json.districts?.length === 2, `HTTP ${dAdm.status}`);
		const oldRole = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: roles.admin.token, body: { role: 'user' } });
		check('anciens rôles refusés', oldRole.status >= 400, `HTTP ${oldRole.status}`);
	}

	// --- Archives des bons (1760002900) : écriture par les routes internes seulement ---
	{
		const fd = new FormData();
		fd.set('kind', 'bus');
		fd.set('order_id', `arch${suffix}xxxxxxxxx`.slice(0, 15));
		fd.set('file', new Blob(['%PDF-1.4\n%%EOF\n'], { type: 'application/pdf' }), 'test.pdf');
		const mk = await fetch(`${PB}/api/collections/order_pdfs/records`, { method: 'POST', headers: { authorization: roles.admin.token }, body: fd });
		check('même un admin ne crée pas d archive par l API', mk.status >= 400, `HTTP ${mk.status}`);
		const fd2 = new FormData();
		for (const [k, v] of fd.entries()) fd2.set(k, v);
		const ar = await fetch(`${PB}/api/collections/order_pdfs/records`, { method: 'POST', headers: { authorization: root }, body: fd2 });
		const arj = await ar.json();
		const arPaco = await api('GET', `/api/collections/order_pdfs/records/${arj.id}`, { token: u.token });
		check('PACO/RCCA lit une archive', arPaco.status === 200, `HTTP ${arPaco.status}`);
		const arGuest = await api('GET', `/api/collections/order_pdfs/records/${arj.id}`, { token: roles.reader.token });
		check("l'invité ne lit pas les archives", arGuest.status === 404, `HTTP ${arGuest.status}`);
		const arDelPaco = await api('DELETE', `/api/collections/order_pdfs/records/${arj.id}`, { token: u.token });
		check('PACO/RCCA ne supprime pas une archive', arDelPaco.status >= 400, `HTTP ${arDelPaco.status}`);
		const arUpd = await api('PATCH', `/api/collections/order_pdfs/records/${arj.id}`, { token: roles.admin.token, body: { reference: 'x' } });
		check('archive non modifiable par l API', arUpd.status >= 400, `HTTP ${arUpd.status}`);
		const arDelModo = await api('DELETE', `/api/collections/order_pdfs/records/${arj.id}`, { token: roles.modo.token });
		check('modérateur supprime une archive', arDelModo.status === 204, `HTTP ${arDelModo.status}`);
		const st = await api('POST', '/api/csm/archives/store', { body: { kind: 'bus', order_id: 'x' } });
		check('route interne d archivage fermée sans secret', st.status === 404, `HTTP ${st.status}`);
	}

	// --- Missions de groupe DICOS (1760001500) ---
	const gmBody = { dicos_id: `jg-${suffix}`, day: '2026-10-09', status: 'prevue', group_name: 'École test', adults: 3, children: 20 };
	const gmUser = await api('POST', '/api/collections/group_missions/records', { token: u.token, body: gmBody });
	check('agent n écrit pas les missions de groupe', gmUser.status >= 400, `HTTP ${gmUser.status}`);
	const gmAdminCreate = await api('POST', '/api/collections/group_missions/records', { token: roles.admin.token, body: gmBody });
	check('même un admin n écrit pas les missions de groupe (connecteur seul)', gmAdminCreate.status >= 400, `HTTP ${gmAdminCreate.status}`);
	const gm = await api('POST', '/api/collections/group_missions/records', { token: root, body: gmBody });
	const gmRead = await api('GET', `/api/collections/group_missions/records/${gm.json?.id}`, { token: roles.moderator.token });
	check('missions de groupe lisibles par un PACO/RCCA (pmr:read)', gmRead.status === 200, `HTTP ${gmRead.status}`);
	const gmOtto = await api('GET', `/api/collections/group_missions/records/${gm.json?.id}`, { token: roles.otto_agent.token });
	check("l'invité ne lit pas les missions de groupe", gmOtto.status === 404, `HTTP ${gmOtto.status}`);
	if (gm.json?.id) await api('DELETE', `/api/collections/group_missions/records/${gm.json.id}`, { token: root });

	// Passkeys (10 oct. 2026) : aucune création directe (route interne après vérification par Next) ; personne d'autre ne
	// les lit (sauf admin) ; routes internes fermées sans secret.
	const pkBody = { user: u.id, credential_id: `cred-${suffix}`, public_key: 'pk', name: 'Test' };
	const pkDirect = await api('POST', '/api/collections/passkeys/records', { token: u.token, body: pkBody });
	check("agent n'écrit pas de passkey directement (clé non vérifiée)", pkDirect.status >= 400, `HTTP ${pkDirect.status}`);
	const pk = await api('POST', '/api/collections/passkeys/records', { token: root, body: pkBody });
	const pkKey = await api('PATCH', `/api/collections/passkeys/records/${pk.json?.id}`, { token: u.token, body: { public_key: 'autre' } });
	check("agent ne change pas la clé publique d'une passkey", pkKey.status >= 400, `HTTP ${pkKey.status}`);
	const pkName = await api('PATCH', `/api/collections/passkeys/records/${pk.json?.id}`, { token: u.token, body: { name: 'Portable' } });
	check('agent renomme sa passkey', pkName.status === 200, `HTTP ${pkName.status}`);
	const pkRead = await api('GET', `/api/collections/passkeys/records/${pk.json?.id}`, { token: roles.reader.token });
	check("un autre agent ne lit pas la passkey", pkRead.status === 404, `HTTP ${pkRead.status}`);
	const pkAdmin = await api('DELETE', `/api/collections/passkeys/records/${pk.json?.id}`, { token: roles.admin.token });
	check('admin supprime une passkey', pkAdmin.status === 204, `HTTP ${pkAdmin.status}`);
	for (const route of ['lookup', 'token', 'register']) {
		const r = await api('POST', `/api/csm/passkey/${route}`, { body: { credentialId: `cred-${suffix}`, user: u.id, counter: 1 } });
		check(`route interne passkey ${route} fermée sans secret`, r.status === 404, `HTTP ${r.status}`);
	}

	// Sessions ouvertes et campagnes (10 oct. 2026).
	const sid = 'a'.repeat(40) + suffix.replace(/[^a-f0-9]/g, '0').padEnd(8, '0');
	const sessDirect = await api('POST', '/api/collections/user_sessions/records', { token: u.token, body: { user: u.id, sid, user_agent: 'test' } });
	check("agent n'ouvre pas de session directement (route interne seule)", sessDirect.status >= 400, `HTTP ${sessDirect.status}`);
	const sess = await api('POST', '/api/collections/user_sessions/records', { token: root, body: { user: u.id, sid, user_agent: 'test' } });
	const sessSid = await api('PATCH', `/api/collections/user_sessions/records/${sess.json?.id}`, { token: u.token, body: { sid: 'c'.repeat(48) } });
	check("agent ne change pas l'identifiant d'une session", sessSid.status >= 400, `HTTP ${sessSid.status}`);
	const sessRead = await api('GET', `/api/collections/user_sessions/records/${sess.json?.id}`, { token: roles.reader.token });
	check("un autre agent ne voit pas la session", sessRead.status === 404, `HTTP ${sessRead.status}`);
	const sessDel = await api('DELETE', `/api/collections/user_sessions/records/${sess.json?.id}`, { token: u.token });
	check('agent ferme sa session', sessDel.status === 204, `HTTP ${sessDel.status}`);
	const campUser = await api('POST', '/api/collections/mail_campaigns/records', { token: u.token, body: { subject: 'x', body: 'y', created_by: u.id } });
	check("agent ne crée pas de campagne d'e-mail", campUser.status >= 400, `HTTP ${campUser.status}`);
	const camp = await api('POST', '/api/collections/mail_campaigns/records', { token: roles.admin.token, body: { subject: 'Test', body: 'Bonjour', created_by: roles.admin.id } });
	check("admin crée une campagne d'e-mail", camp.status === 200, `HTTP ${camp.status}`);
	const campRead = await api('GET', `/api/collections/mail_campaigns/records/${camp.json?.id}`, { token: u.token });
	check('agent ne lit pas les campagnes', campRead.status === 404, `HTTP ${campRead.status}`);
	if (camp.json?.id) await api('DELETE', `/api/collections/mail_campaigns/records/${camp.json.id}`, { token: root });
	for (const route of ['/api/csm/mail/send', '/api/csm/session/rotate', '/api/csm/session/open']) {
		const r = await api('POST', route, { body: { to: 'x@example.org', user: u.id } });
		check(`route interne ${route} fermée sans secret`, r.status === 404, `HTTP ${r.status}`);
	}
	const st = await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { status: 'EXTRA', status_day: '2026-10-10' } });
	check('agent pose son statut du jour', st.status === 200, `HTTP ${st.status}`);

	// --- Rôle « Écran » (1760003000, 11 oct. 2026) : ne lit que ce que /tv affiche, rien de nominatif, n'écrit rien ---
	const brussels = (() => {
		const p = Object.fromEntries(
			new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
				.formatToParts(new Date())
				.map((x) => [x.type, x.value])
		);
		return { day: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
	})();
	const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
	// Heure « dans N minutes » à Bruxelles, aujourd'hui (le test des alertes est sauté s'il déborde sur demain).
	const inMin = (n) => (brussels.min + n < 1440 ? hhmm(brussels.min + n) : null);
	const scCo = await api('POST', '/api/collections/bus_companies/records', { token: roles.admin.token, body: { name: `Écran ${suffix}`, email: 'ecran@csm.invalid' } });
	const spass = `Test-${suffix}-screen`;
	const sc = await api('POST', '/api/collections/users/records', {
		token: root,
		body: { email: `test-screen-${suffix}@csm.invalid`, password: spass, passwordConfirm: spass, name: 'Écran test', username: `tscreen${suffix}`, role: 'screen', verified: true }
	});
	check('compte « Écran » créé', sc.status === 200 && sc.json.role === 'screen', `HTTP ${sc.status} ${JSON.stringify(sc.json).slice(0, 80)}`);
	if (sc.status === 200) {
		created.push(sc.json.id);
		const stok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: sc.json.email, password: spass } })).json?.token;
		check('écran : connexion', !!stok);
		const sMe = await api('GET', `/api/collections/users/records/${sc.json.id}`, { token: stok });
		check('écran lit sa propre fiche', sMe.status === 200, `HTTP ${sMe.status}`);
		const sUsers = await api('GET', '/api/collections/users/records?perPage=50', { token: stok });
		check("écran ne liste pas les agents (sa fiche seule)", sUsers.status === 200 && sUsers.json.totalItems === 1, `${sUsers.json?.totalItems}`);
		const sOther = await api('GET', `/api/collections/users/records/${u.id}`, { token: stok });
		check("écran ne lit pas la fiche d'un agent", sOther.status === 404, `HTTP ${sOther.status}`);
		const sSelf = await api('PATCH', `/api/collections/users/records/${sc.json.id}`, { token: stok, body: { fonction: 'x' } });
		check('écran ne modifie pas sa fiche', sSelf.status >= 400, `HTTP ${sSelf.status}`);
		// Lectures nominatives ou hors /tv : refusées, même avec un droit accordé.
		await api('PATCH', `/api/collections/users/records/${sc.json.id}`, { token: root, body: { grants: ['pmr:read', 'generate_taxi:read', 'repertoire:read', 'dicos:write'] } });
		const stok2 = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: sc.json.email, password: spass } })).json?.token;
		for (const c of ['stations', 'train_services', 'train_relations', 'train_paths', 'rail_lines', 'taxi_orders', 'group_missions', 'pmr_mission', 'pmr_clients', 'pmr_assist_legacy', 'directory_contacts', 'audit_log', 'line_stations', 'changelog', 'order_events', 'pmr_events', 'connector_tokens', 'train_schedules', 'b201_reports', 'level_crossings']) {
			const r = await api('GET', `/api/collections/${c}/records?perPage=1`, { token: stok2 });
			check(`écran ne lit pas ${c} (même avec un droit accordé)`, r.status !== 200 || r.json.totalItems === 0, `HTTP ${r.status} ${r.json?.totalItems}`);
		}
		// Bons bus : ouverts seulement (envoyés / en cours), pas les brouillons.
		const draft = await api('POST', '/api/collections/bus_orders/records', { token: u.token, body: { status: 'brouillon', created_by: u.id, reason: 'Brouillon écran' } });
		// Cycle v3 : l'écran lit les bons ouverts (brouillon / en cours, terminé), pas les finalisés.
		const sDraft = await api('GET', `/api/collections/bus_orders/records/${draft.json?.id}`, { token: stok2 });
		check('écran lit un bon en cours', sDraft.status === 200, `HTTP ${sDraft.status}`);
		const ended = await api('PATCH', `/api/collections/bus_orders/records/${draft.json?.id}`, { token: u.token, body: { status: 'termine', company: scCo.json?.id } });
		const sEnded = await api('GET', `/api/collections/bus_orders/records/${draft.json?.id}`, { token: stok2 });
		check('écran lit un bon terminé', ended.status === 200 && sEnded.status === 200, `HTTP ${ended.status}/${sEnded.status} ${JSON.stringify(ended.json).slice(0, 160)}`);
		const sCreate = await api('POST', '/api/collections/bus_orders/records', { token: stok2, body: { status: 'brouillon', created_by: sc.json.id } });
		check("écran ne crée pas de bon", sCreate.status >= 400, `HTTP ${sCreate.status}`);
		const sSend = await api('PATCH', `/api/collections/bus_orders/records/${draft.json?.id}`, { token: stok2, body: { status: 'envoye' } });
		check("écran n'envoie pas de bon", sSend.status >= 400, `HTTP ${sSend.status}`);
		await api('PATCH', `/api/collections/bus_orders/records/${draft.json?.id}`, { token: u.token, body: { status: 'envoye' } });
		const sSent = await api('GET', `/api/collections/bus_orders/records/${draft.json?.id}`, { token: stok2 });
		check("écran ne lit pas un bon finalisé", sSent.status === 404, `HTTP ${sSent.status}`);
		if (draft.json?.id) await api('DELETE', `/api/collections/bus_orders/records/${draft.json.id}`, { token: root });
		// Journal : urgences, épinglés, iRail seulement.
		const plain = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'Message ordinaire écran', category: 'info', author: u.id } });
		const urgentLog = await api('POST', '/api/collections/ops_log/records', { token: u.token, body: { body: 'Urgence écran', category: 'incident', author: u.id, urgent: true } });
		const sPlain = await api('GET', `/api/collections/ops_log/records/${plain.json?.id}`, { token: stok2 });
		check("écran ne lit pas un message ordinaire du Journal", sPlain.status === 404, `HTTP ${sPlain.status}`);
		const sUrgent = await api('GET', `/api/collections/ops_log/records/${urgentLog.json?.id}`, { token: stok2 });
		check('écran lit une urgence du Journal', sUrgent.status === 200, `HTTP ${sUrgent.status}`);
		const sWrite = await api('POST', '/api/collections/ops_log/records', { token: stok2, body: { body: 'x', category: 'info', author: sc.json.id } });
		check("écran n'écrit pas au Journal", sWrite.status >= 400, `HTTP ${sWrite.status}`);
		for (const id of [plain.json?.id, urgentLog.json?.id]) if (id) await api('DELETE', `/api/collections/ops_log/records/${id}`, { token: root });
		for (const c of ['pmr_assists', 'mission_trains', 'alea_marks', 'dicos_syncs']) {
			const r = await api('GET', `/api/collections/${c}/records?perPage=1`, { token: stok2 });
			check(`écran lit ${c} (données d'exploitation de /tv)`, r.status === 200, `HTTP ${r.status}`);
		}
		// Champs pouvant porter un nom ou une information de santé : jamais renvoyés à l'écran (hook onRecordEnrich).
		const noted = await api('POST', '/api/collections/pmr_assists/records', { token: root, body: { day: '2026-01-02', station: 'Mons', time: '10:00', pmr_type: 'CRF', status: 'prevue', note: 'Note confidentielle écran', dicos_ref: '2026-01-02-0001' } });
		const sNoted = await api('GET', `/api/collections/pmr_assists/records/${noted.json?.id}`, { token: stok2 });
		check(
			"écran : note, réf. DICOS et client masqués sur pmr_assists",
			noted.status === 200 && sNoted.status === 200 && !('note' in sNoted.json) && !('dicos_ref' in sNoted.json) && !('client' in sNoted.json),
			`HTTP ${noted.status}/${sNoted.status} ${Object.keys(sNoted.json ?? {}).join(',').slice(0, 120)}`
		);
		const aNoted = await api('GET', `/api/collections/pmr_assists/records/${noted.json?.id}`, { token: u.token });
		check("agent : la note reste lisible", aNoted.status === 200 && aNoted.json.note === 'Note confidentielle écran', `HTTP ${aNoted.status}`);
		if (noted.json?.id) await api('DELETE', `/api/collections/pmr_assists/records/${noted.json.id}`, { token: root });
		const sNotif = await api('GET', '/api/collections/notifications/records?perPage=1', { token: stok2 });
		check("écran n'a aucune notification", sNotif.status === 200 && sNotif.json.totalItems === 0, `${sNotif.json?.totalItems}`);
		const sTok = await api('POST', '/api/collections/connector_tokens/records', { token: stok2, body: { user: sc.json.id, token_hash: 'e'.repeat(64) } });
		check("écran ne crée pas de jeton de connecteur", sTok.status >= 400, `HTTP ${sTok.status}`);
		const mt = await api('POST', '/api/collections/app_settings/records', { token: roles.admin.token, body: { key: `maint_${suffix}`, value: true, updated_by: roles.admin.id } });
		const sSet = await api('GET', `/api/collections/app_settings/records/${mt.json?.id}`, { token: stok2 });
		check("écran ne lit que le réglage « maintenance »", sSet.status === 404, `HTTP ${sSet.status}`);
		if (mt.json?.id) await api('DELETE', `/api/collections/app_settings/records/${mt.json.id}`, { token: root });
		// Pas de session ouverte directement non plus (route interne seule) ; ses sessions restent les siennes.
		const sSess = await api('GET', '/api/collections/user_sessions/records?perPage=1', { token: stok2 });
		check('écran liste ses sessions (déconnexion à distance)', sSess.status === 200, `HTTP ${sSess.status}`);
	}

	// --- Registre de l'import différentiel : admin / sysop seulement (1760003200) ---
	{
		const reg = await api('POST', '/api/collections/app_settings/records', { token: root, body: { key: 'import_delta', value: { test: suffix } } });
		const asAgent = await api('GET', `/api/collections/app_settings/records/${reg.json?.id}`, { token: u.token });
		check("registre d'import : invisible pour un agent", reg.status === 200 && asAgent.status === 404, `HTTP ${reg.status}/${asAgent.status}`);
		const asAdmin = await api('GET', `/api/collections/app_settings/records/${reg.json?.id}`, { token: roles.admin.token });
		check("registre d'import : lisible par un admin", asAdmin.status === 200, `HTTP ${asAdmin.status}`);
		if (reg.json?.id) await api('DELETE', `/api/collections/app_settings/records/${reg.json.id}`, { token: root });
	}

	// --- Missions vues par la synchro DICOS, alertes de dernière minute (1760003010, 11 oct. 2026) ---
	const kpass = `Test-${suffix}-conn2`;
	const k = await api('POST', '/api/collections/users/records', {
		token: root,
		body: { email: `test-conn2-${suffix}@csm.invalid`, password: kpass, passwordConfirm: kpass, name: 'Connecteur 2', username: `tconn2${suffix}`, role: 'connector', grants: ['dicos:write'], verified: true }
	});
	if (k.status === 200) {
		created.push(k.json.id);
		const ktok = (await api('POST', '/api/collections/users/auth-with-password', { body: { identity: k.json.email, password: kpass } })).json?.token;
		const gForge = await api('POST', '/api/collections/group_missions/records', { token: ktok, body: { dicos_id: `jf-${suffix}`, day: '2099-01-01', status: 'prevue', last_seen_sync: '2099-01-01 10:00:00.000Z' } });
		check('last_seen_sync non forgeable (groupe)', gForge.status >= 400, `HTTP ${gForge.status}`);
		const pmrForge = await api('POST', '/api/collections/pmr_assists/records', { token: ktok, body: { day: '2099-01-01', station: 'X', status: 'prevue', source: 'dicos', dicos_id: `jp-${suffix}`, created_by: k.json.id, updated_by: k.json.id, last_seen_by: u.id } });
		check('last_seen_by non forgeable (mission PMR)', pmrForge.status >= 400, `HTTP ${pmrForge.status}`);
		const gm = await api('POST', '/api/collections/group_missions/records', { token: ktok, body: { dicos_id: `js-${suffix}`, day: '2099-01-02', status: 'prevue', adults: 3 } });
		const syncForge = await api('POST', '/api/collections/dicos_syncs/records', { token: ktok, body: { day: '2099-01-02', kind: 'groups', complete: true, session_start: '2000-01-01 00:00:00.000Z' } });
		check('session_start non forgeable', syncForge.status >= 400, `HTTP ${syncForge.status}`);
		const sync = await api('POST', '/api/collections/dicos_syncs/records', { token: ktok, body: { day: '2099-01-02', kind: 'groups', complete: true, seen: [`js-${suffix}`] } });
		check('synchro complète : session_start posé, liste vidée', sync.status === 200 && !!sync.json.session_start && (!sync.json.seen || sync.json.seen.length === 0), `HTTP ${sync.status} ${JSON.stringify(sync.json).slice(0, 120)}`);
		const gSeen = (await api('GET', `/api/collections/group_missions/records/${gm.json?.id}`, { token: root })).json;
		check('mission vue par la synchro (last_seen_sync posé, sans changer « updated »)', !!gSeen?.last_seen_sync && gSeen.last_seen_sync === sync.json?.created && gSeen.updated === gm.json?.updated, `${gSeen?.last_seen_sync} / ${sync.json?.created}`);
		const userSeen = await api('PATCH', `/api/collections/pmr_assists/records/${did}`, { token: u.token, body: { last_seen_sync: '2099-01-01 10:00:00.000Z', updated_by: u.id } });
		check("agent ne pose pas last_seen_sync", userSeen.status >= 400, `HTTP ${userSeen.status}`);
		for (const id of [gm.json?.id]) if (id) await api('DELETE', `/api/collections/group_missions/records/${id}`, { token: root });
		for (const id of [sync.json?.id]) if (id) await api('DELETE', `/api/collections/dicos_syncs/records/${id}`, { token: root });

		// Alertes DICOS de dernière minute : agent PACO avec Sud-Ouest pour aujourd'hui.
		await api('PATCH', `/api/collections/users/records/${u.id}`, { token: u.token, body: { duty_day: brussels.day, duty_districts: ['Sud-Ouest'] } });
		const t30 = inMin(30);
		const t50 = inMin(50);
		if (t30 && t50 && brussels.min >= 30) {
			const notes = async (src) =>
				(await api('GET', `/api/collections/notifications/records?perPage=50&filter=${encodeURIComponent(`user = "${u.id}" && source = "${src}"`)}`, { token: root })).json?.items ?? [];
			const g1 = await api('POST', '/api/collections/group_missions/records', { token: ktok, body: { dicos_id: `jd-${suffix}`, day: brussels.day, time: t30, station: 'Mons', district: 'DSO', in_assist: true, train: '1234', status: 'prevue', adults: 10 } });
			check('premier passage du jour : pas d alerte « nouveau » sans synchro complète', g1.status === 200 && (await notes('dicos')).length === 0, `${(await notes('dicos')).length}`);
			const prior = await api('POST', '/api/collections/dicos_syncs/records', { token: ktok, body: { day: brussels.day, kind: 'groups', complete: true } });
			const g2 = await api('POST', '/api/collections/group_missions/records', { token: ktok, body: { dicos_id: `je-${suffix}`, day: brussels.day, time: t30, station: 'Mons', district: 'DSO', in_assist: true, train: '1235', status: 'prevue', adults: 4, group_name: 'École Nom Privé' } });
			let n = await notes('dicos');
			check('groupe nouveau dans les 3 h → alerte au district (sans nom)', g2.status === 200 && n.length === 1 && n[0].kind === 'dicos' && !/Privé/.test(`${n[0].title} ${n[0].body}`), `${n.length} ${n[0]?.title}`);
			await api('PATCH', `/api/collections/group_missions/records/${g2.json?.id}`, { token: ktok, body: { time: t50 } });
			n = await notes('dicos');
			check('groupe déplacé dans les 3 h → alerte', n.length === 2 && n.some((x) => /déplacé/.test(x.title)), n.map((x) => x.title).join(' | '));
			await api('PATCH', `/api/collections/group_missions/records/${g2.json?.id}`, { token: ktok, body: { status: 'annulee' } });
			n = await notes('dicos');
			check('groupe annulé dans les 3 h → alerte', n.length === 3 && n.some((x) => /annulé/.test(x.title)), n.map((x) => x.title).join(' | '));
			// Mission PMR : même règle (synchro complète des missions du jour, puis nouvelle mission dans les 3 h).
			const priorM = await api('POST', '/api/collections/dicos_syncs/records', { token: ktok, body: { day: brussels.day, kind: 'missions', complete: true } });
			const pm = await api('POST', '/api/collections/pmr_assists/records', { token: ktok, body: { day: brussels.day, time: t30, station: 'Mons', district: 'DSO', in_assist: true, train: '4321', pmr_type: 'CRF', pax: 1, status: 'prevue', source: 'dicos', dicos_id: `jm-${suffix}`, created_by: k.json.id, updated_by: k.json.id } });
			n = await notes('dicos');
			check('mission PMR nouvelle dans les 3 h → alerte (type, train, gare)', pm.status === 200 && n.length === 4 && n.some((x) => /nouvelle mission à Mons/.test(x.title) && /4321/.test(x.body) && /CRF/.test(x.body)), `HTTP ${pm.status} ${n.length}`);
			for (const id of [pm.json?.id]) if (id) await api('DELETE', `/api/collections/pmr_assists/records/${id}`, { token: root });
			if (priorM.json?.id) await api('DELETE', `/api/collections/dicos_syncs/records/${priorM.json.id}`, { token: root });
			await api('PATCH', `/api/collections/group_missions/records/${g1.json?.id}`, { token: u.token, body: { status: 'annulee' } });
			check("agent ne déclenche pas d'alerte DICOS", (await notes('dicos')).length === 4);
			for (const id of [g1.json?.id, g2.json?.id]) if (id) await api('DELETE', `/api/collections/group_missions/records/${id}`, { token: root });
			if (prior.json?.id) await api('DELETE', `/api/collections/dicos_syncs/records/${prior.json.id}`, { token: root });
			for (const x of await notes('dicos')) await api('DELETE', `/api/collections/notifications/records/${x.id}`, { token: root });
		}

	}
	if (scCo.json?.id) await api('DELETE', `/api/collections/bus_companies/records/${scCo.json.id}`, { token: root });

	// Fournisseurs gérés dans CSM (1760003100, 11 oct. 2026) : PACO/RCCA crée et modifie, ne supprime pas ; legacy_id
	// non forgeable ; invité en lecture seule ; société citée par un bon non supprimable ; modérateur supprime.
	const spBus = await api('POST', '/api/collections/bus_companies/records', { token: u.token, body: { name: `Fournisseur ${suffix}`, email: 'planning@example.org', notes: 'Permanence 24 h' } });
	check('PACO crée une société de bus (avec remarques)', spBus.status === 200 && spBus.json?.notes === 'Permanence 24 h', `HTTP ${spBus.status}`);
	const spLegacy = await api('POST', '/api/collections/bus_companies/records', { token: u.token, body: { name: `Usurpation ${suffix}`, legacy_id: 999999 } });
	check('PACO ne pose pas de legacy_id sur une société de bus', spLegacy.status >= 400, `HTTP ${spLegacy.status}`);
	const spLegacyUpd = await api('PATCH', `/api/collections/bus_companies/records/${spBus.json?.id}`, { token: u.token, body: { legacy_id: 999998 } });
	check('PACO ne change pas le legacy_id', spLegacyUpd.status >= 400, `HTTP ${spLegacyUpd.status}`);
	const spUpd = await api('PATCH', `/api/collections/bus_companies/records/${spBus.json?.id}`, { token: u.token, body: { phone: '065 11 22 33' } });
	check('PACO modifie une société de bus', spUpd.status === 200, `HTTP ${spUpd.status}`);
	const spGuest = await api('POST', '/api/collections/bus_companies/records', { token: roles.reader.token, body: { name: `Invité ${suffix}` } });
	check('invité ne crée pas de société de bus', spGuest.status >= 400, `HTTP ${spGuest.status}`);
	const spGuestRead = await api('GET', `/api/collections/bus_companies/records/${spBus.json?.id}`, { token: roles.reader.token });
	check('invité lit une société de bus', spGuestRead.status === 200, `HTTP ${spGuestRead.status}`);
	const spDrv = await api('POST', '/api/collections/bus_drivers/records', { token: u.token, body: { company: spBus.json?.id, name: 'Chauffeur Test', phone: '0470' } });
	check('PACO ajoute un chauffeur', spDrv.status === 200, `HTTP ${spDrv.status}`);
	const spDrvLegacy = await api('POST', '/api/collections/bus_drivers/records', { token: u.token, body: { company: spBus.json?.id, name: 'Chauffeur X', legacy_id: 77777 } });
	check('PACO ne pose pas de legacy_id sur un chauffeur', spDrvLegacy.status >= 400, `HTTP ${spDrvLegacy.status}`);
	const spLine = await api('POST', '/api/collections/bus_company_lines/records', { token: u.token, body: { company: spBus.json?.id, line: 'L.96' } });
	check('PACO ajoute une ligne desservie', spLine.status === 200, `HTTP ${spLine.status}`);
	const spDrvDel = await api('DELETE', `/api/collections/bus_drivers/records/${spDrv.json?.id}`, { token: u.token });
	check('PACO ne retire pas un chauffeur (otto:delete)', spDrvDel.status >= 400, `HTTP ${spDrvDel.status}`);
	const spDrvDelMod = await api('DELETE', `/api/collections/bus_drivers/records/${spDrv.json?.id}`, { token: roles.modo.token });
	check('modérateur retire un chauffeur', spDrvDelMod.status === 204, `HTTP ${spDrvDelMod.status}`);
	const spTaxi = await api('POST', '/api/collections/taxi_companies/records', { token: u.token, body: { name: `Taxi ${suffix}`, emails: ['resa@example.org'], phones: ['065'], places: ['Mons'] } });
	check('PACO crée une société de taxi', spTaxi.status === 200, `HTTP ${spTaxi.status}`);
	const spTaxiLegacy = await api('PATCH', `/api/collections/taxi_companies/records/${spTaxi.json?.id}`, { token: u.token, body: { legacy_id: 55555 } });
	check('PACO ne change pas le legacy_id d\'un taxi', spTaxiLegacy.status >= 400, `HTTP ${spTaxiLegacy.status}`);
	const spTaxiDel = await api('DELETE', `/api/collections/taxi_companies/records/${spTaxi.json?.id}`, { token: u.token });
	check('PACO ne supprime pas une société de taxi', spTaxiDel.status >= 400, `HTTP ${spTaxiDel.status}`);
	// Bon qui cite la société : suppression refusée même au modérateur ; relance d'un bon envoyé.
	const spOrder = await api('POST', '/api/collections/bus_orders/records', {
		token: u.token,
		body: { status: 'brouillon', reason: 'Relance test', created_by: u.id, company: spBus.json?.id, order_date: '2026-10-12 00:00:00.000Z', origin: 'Mons', destination: 'Ath' }
	});
	const spBusDel = await api('DELETE', `/api/collections/bus_companies/records/${spBus.json?.id}`, { token: roles.modo.token });
	check('société citée par un bon : suppression refusée', spBusDel.status === 400, `HTTP ${spBusDel.status}`);
	await api('DELETE', `/api/collections/bus_orders/records/${spOrder.json?.id}`, { token: root });
	auditIds.push(spOrder.json?.id);
	const spBusDelOk = await api('DELETE', `/api/collections/bus_companies/records/${spBus.json?.id}`, { token: roles.modo.token });
	check('modérateur supprime une société sans bon', spBusDelOk.status === 204, `HTTP ${spBusDelOk.status}`);
	const spTaxiDelMod = await api('DELETE', `/api/collections/taxi_companies/records/${spTaxi.json?.id}`, { token: roles.modo.token });
	check('modérateur supprime une société de taxi sans bon', spTaxiDelMod.status === 204, `HTTP ${spTaxiDelMod.status}`);
	for (const id of [spBus.json?.id, spTaxi.json?.id, spDrv.json?.id, spLine.json?.id]) if (id) auditIds.push(id);

	// Supervision (1760003110, 11 oct. 2026) : battements des tâches planifiées lus par les admins seulement, jamais
	// écrits par l'API ; routes internes fermées sans le secret.
	const crPaco = await api('GET', '/api/collections/cron_runs/records', { token: u.token });
	check('PACO ne lit pas les battements des tâches', crPaco.status !== 200 || crPaco.json.totalItems === 0, `HTTP ${crPaco.status}`);
	const crMod = await api('GET', '/api/collections/cron_runs/records', { token: roles.modo.token });
	check('modérateur ne lit pas les battements des tâches', crMod.status !== 200 || crMod.json.totalItems === 0, `HTTP ${crMod.status}`);
	const crAdmin = await api('GET', '/api/collections/cron_runs/records', { token: roles.admin.token });
	check('admin lit les battements des tâches', crAdmin.status === 200, `HTTP ${crAdmin.status}`);
	const crCreate = await api('POST', '/api/collections/cron_runs/records', { token: roles.admin.token, body: { name: `faux-${suffix}`, ok: true } });
	check("admin n'écrit pas de battement par l'API", crCreate.status >= 400, `HTTP ${crCreate.status}`);
	for (const [method, route] of [['GET', '/api/csm/health'], ['POST', '/api/csm/journal/retention']]) {
		const r = await api(method, route, { token: roles.admin.token });
		check(`route interne ${route} fermée sans secret (même admin)`, r.status === 404, `HTTP ${r.status}`);
		const w = await fetch(`${PB}${route}`, { method, headers: { 'x-csm-internal': 'mauvais-secret-mauvais-secret-mauvais' } });
		check(`route interne ${route} fermée avec un mauvais secret`, w.status === 404, `HTTP ${w.status}`);
	}

	// Référentiel des relations de trains (1760003600) : lecture des agents, jamais d'écriture par l'API.
	for (const c of ['train_services', 'train_relations']) {
		const pr = await api('GET', `/api/collections/${c}/records?perPage=1`, { token: roles.user.token });
		check(`PACO/RCCA lit ${c}`, pr.status === 200, `HTTP ${pr.status}`);
		const gr = await api('GET', `/api/collections/${c}/records?perPage=1`, { token: roles.reader.token });
		check(`invité ne lit pas ${c}`, gr.status !== 200 || gr.json.totalItems === 0, `HTTP ${gr.status} ${gr.json?.totalItems}`);
		const cw = await api('POST', `/api/collections/${c}/records`, { token: roles.admin.token, body: { key: `x-${suffix}`, number: 1 } });
		check(`admin n'écrit pas ${c} par l'API`, cw.status >= 400, `HTTP ${cw.status}`);
	}
	// Lignes (1760003850) : comme train_services ; création et suppression par la route interne seulement.
	const rlRec = await api('POST', '/api/collections/rail_lines/records', { token: root, body: { line: `T${suffix}`.slice(0, 12).toUpperCase(), name: 'A – B', stations: [{ n: 'A' }, { n: 'B' }], count: 2 } });
	check('superuser crée une ligne de test', rlRec.status === 200, `HTTP ${rlRec.status}`);
	if (rlRec.status === 200) {
		const rid = rlRec.json.id;
		const rp = await api('GET', `/api/collections/rail_lines/records/${rid}`, { token: roles.user.token });
		check('PACO/RCCA lit une ligne', rp.status === 200 && rp.json.stations?.length === 2, `HTTP ${rp.status}`);
		const rm = await api('GET', `/api/collections/rail_lines/records/${rid}`, { token: roles.modo.token });
		check('modérateur lit une ligne', rm.status === 200, `HTTP ${rm.status}`);
		const rg = await api('GET', `/api/collections/rail_lines/records/${rid}`, { token: roles.reader.token });
		check("invité ne lit pas une ligne", rg.status === 404 || rg.status === 403, `HTTP ${rg.status}`);
		const rc = await api('POST', '/api/collections/rail_lines/records', { token: roles.admin.token, body: { line: 'X1', name: 'X' } });
		check("admin ne crée pas de ligne par l'API", rc.status >= 400, `HTTP ${rc.status}`);
		// Lignes modifiables (1760004100) : ptcar:update (PACO/RCCA, modérateur, admin), gares / embranchements / nom.
		const ru = await api('PATCH', `/api/collections/rail_lines/records/${rid}`, { token: roles.admin.token, body: { name: 'Modifiée' } });
		check('modification sans updated_by refusée', ru.status >= 400, `HTTP ${ru.status}`);
		const rpU = await api('PATCH', `/api/collections/rail_lines/records/${rid}`, { token: roles.user.token, body: { stations: [{ n: 'A' }, { n: 'C' }, { n: 'B' }, { n: 'X', b: 1 }], branches: [{ b: 1, from: 'C', to: '?' }], updated_by: roles.user.id } });
		check('PACO/RCCA corrige les gares d une ligne (manuelle, embranchement recalculé)', rpU.status === 200 && rpU.json.manual === true && rpU.json.count === 4 && rpU.json.branches?.[0]?.to === 'X', `HTTP ${rpU.status} ${JSON.stringify(rpU.json?.branches)}`);
		const rpS = await api('PATCH', `/api/collections/rail_lines/records/${rid}`, { token: roles.user.token, body: { sig: 'x', updated_by: roles.user.id } });
		check('signature d import non modifiable', rpS.status >= 400, `HTTP ${rpS.status}`);
		const rp1 = await api('PATCH', `/api/collections/rail_lines/records/${rid}`, { token: roles.user.token, body: { stations: [{ n: 'A' }, { n: 'X', b: 1 }], updated_by: roles.user.id } });
		check('tronc d une seule gare refusé', rp1.status >= 400, `HTTP ${rp1.status}`);
		const rpG = await api('PATCH', `/api/collections/rail_lines/records/${rid}`, { token: roles.reader.token, body: { name: 'X', updated_by: roles.reader.id } });
		check('invité ne modifie pas une ligne', rpG.status >= 400, `HTTP ${rpG.status}`);
		const rpR = await api('PATCH', `/api/collections/rail_lines/records/${rid}`, { token: roles.modo.token, body: { manual: false, updated_by: roles.modo.id } });
		check('modérateur rétablit la version automatique', rpR.status === 200 && rpR.json.manual === false, `HTTP ${rpR.status} ${rpR.json?.count}`);
		const rd = await api('DELETE', `/api/collections/rail_lines/records/${rid}`, { token: roles.admin.token });
		check("admin ne supprime pas une ligne par l'API", rd.status >= 400, `HTTP ${rd.status}`);
		await api('DELETE', `/api/collections/rail_lines/records/${rid}`, { token: root });
	}
	const rlNo = await api('GET', '/api/collections/rail_lines/records?perPage=1');
	check('anonyme ne lit pas les lignes', rlNo.status !== 200 || rlNo.json.totalItems === 0, `HTTP ${rlNo.status}`);
	// Référentiel des gares (1760003700) : lecture des agents, district seul modifiable (ptcar:update), import seul crée.
	const stRec = await api('POST', '/api/collections/stations/records', { token: root, body: { key: `gare test ${suffix}`, name: `Gare test ${suffix}`, country: 'BE' } });
	check('superuser crée une gare de test', stRec.status === 200, `HTTP ${stRec.status}`);
	if (stRec.status === 200) {
		const sid = stRec.json.id;
		const rd = await api('GET', `/api/collections/stations/records/${sid}`, { token: roles.reader.token });
		check('invité lit une gare', rd.status === 200, `HTTP ${rd.status}`);
		const pc = await api('POST', '/api/collections/stations/records', { token: roles.admin.token, body: { key: `x-${suffix}`, name: 'X', updated_by: roles.admin.id } });
		check("admin ne crée pas de gare par l'API", pc.status >= 400, `HTTP ${pc.status}`);
		const pu = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.user.token, body: { district: 'DSO', updated_by: roles.user.id } });
		check('PACO/RCCA modifie le district (marqué manuel)', pu.status === 200 && pu.json.district === 'DSO' && pu.json.district_manual === true, `HTTP ${pu.status} ${pu.json?.district} ${pu.json?.district_manual}`);
		const pl = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.user.token, body: { lines: ['96', '97'], kind: 'pang', updated_by: roles.user.id } });
		check('PACO/RCCA modifie lignes et type (lignes marquées manuelles)', pl.status === 200 && pl.json.lines_manual === true && pl.json.kind === 'pang', `HTTP ${pl.status} ${pl.json?.lines_manual} ${pl.json?.kind}`);
		const dn = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.user.token, body: { district: 'DNO', updated_by: roles.user.id } });
		check('district DNO accepté', dn.status === 200 && dn.json.district === 'DNO', `HTTP ${dn.status} ${dn.json?.district}`);
		const ps = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.user.token, body: { district_suggested: 'DSE', updated_by: roles.user.id } });
		check("proposition de district non modifiable par l'API", ps.status >= 400, `HTTP ${ps.status}`);
		const pn = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.user.token, body: { name: 'Renommée', updated_by: roles.user.id } });
		check('PACO/RCCA ne renomme pas une gare', pn.status >= 400, `HTTP ${pn.status}`);
		const gu = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.reader.token, body: { district: 'DSE', updated_by: roles.reader.id } });
		check("invité ne modifie pas le district", gu.status >= 400, `HTTP ${gu.status}`);
		const fu = await api('PATCH', `/api/collections/stations/records/${sid}`, { token: roles.user.token, body: { district: 'DSE', updated_by: roles.admin.id } });
		check('auteur de modification non forgeable', fu.status >= 400, `HTTP ${fu.status}`);
		const pd = await api('DELETE', `/api/collections/stations/records/${sid}`, { token: roles.admin.token });
		check("admin ne supprime pas de gare par l'API", pd.status >= 400, `HTTP ${pd.status}`);
		await api('DELETE', `/api/collections/stations/records/${sid}`, { token: root });
	}
	for (const [method, route] of [['POST', '/api/csm/timetable/stations'], ['GET', '/api/csm/stations/districts'], ['POST', '/api/csm/stations/suggest']]) {
		const r = await api(method, route, { token: roles.admin.token, body: method === 'POST' ? { items: [] } : undefined });
		check(`route interne ${route} fermée sans secret (même admin)`, r.status === 404, `HTTP ${r.status}`);
	}
	const tpaths = await api('GET', '/api/collections/train_paths/records?perPage=1', { token: roles.admin.token });
	check("train_paths fermé à l'API (même admin)", tpaths.status !== 200 || tpaths.json.totalItems === 0, `HTTP ${tpaths.status} ${tpaths.json?.totalItems}`);
	for (const [method, route] of [['GET', '/api/csm/timetable/status'], ['POST', '/api/csm/timetable/services'], ['POST', '/api/csm/timetable/finish'], ['GET', '/api/csm/timetable/paths'], ['POST', '/api/csm/timetable/lines']]) {
		const r = await api(method, route, { token: roles.admin.token, body: method === 'POST' ? { items: [] } : undefined });
		check(`route interne ${route} fermée sans secret (même admin)`, r.status === 404, `HTTP ${r.status}`);
		const w = await fetch(`${PB}${route}`, { method, headers: { 'x-csm-internal': 'mauvais-secret-mauvais-secret-mauvais' } });
		check(`route interne ${route} fermée avec un mauvais secret`, w.status === 404, `HTTP ${w.status}`);
	}

	// Admin : supprime.
	const adel =await api('DELETE', `/api/collections/bus_orders/records/${order.json.id}`, { token: roles.admin.token });
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
