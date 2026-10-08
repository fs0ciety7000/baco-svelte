// Module Opérations : logique partagée par les hooks (les callbacks JSVM sont isolés, voir operations.pb.js).

const COORD_ROLES = ['admin', 'sysop', 'moderator'];
// Rôles qui lisent la main courante par défaut (journal:read) ; otto_agent exclu (décision du 8 octobre 2026).
const LOG_READERS = ['admin', 'sysop', 'moderator', 'user', 'reader'];
const MAX_WATCHES = 10;

function isCoord(auth) {
	return !!auth && (auth.isSuperuser() || COORD_ROLES.indexOf(auth.getString('role')) !== -1);
}

function now() {
	return new Date().toISOString().replace('T', ' ');
}

// Jour civil à Bruxelles (heure d'été : du dernier dimanche de mars au dernier dimanche d'octobre, à 1 h UTC).
// Intl n'est pas disponible dans le JSVM.
function lastSunday(year, month) {
	const d = new Date(Date.UTC(year, month + 1, 0, 1));
	d.setUTCDate(d.getUTCDate() - d.getUTCDay());
	return d.getTime();
}
function brusselsDay(at) {
	const t = (at || new Date()).getTime();
	const y = new Date(t).getUTCFullYear();
	const summer = t >= lastSunday(y, 2) && t < lastSunday(y, 9);
	return new Date(t + (summer ? 2 : 1) * 3600000).toISOString().slice(0, 10);
}

// Liste d'identifiants d'une relation multiple (le JSVM renvoie un tableau Go).
function ids(record, field) {
	const v = record.get(field);
	const out = [];
	if (!v) return out;
	for (let i = 0; i < v.length; i++) if (v[i]) out.push(String(v[i]));
	return out;
}

function hasJournalRead(u) {
	const denies = u.getString('denies');
	const grants = u.getString('grants');
	if (u.getString('role') === 'disabled') return false;
	if (grants.indexOf('"journal:read"') !== -1) return true;
	if (LOG_READERS.indexOf(u.getString('role')) === -1) return false;
	return u.getString('role') === 'admin' || u.getString('role') === 'sysop' || denies.indexOf('"journal:read"') === -1;
}

// « @nom.utilisateur » → agents actifs qui lisent la main courante (l'auteur exclu).
function mentionsFrom(app, body, authorId) {
	const out = [];
	const re = /(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_.-]{2,40})/g;
	let m;
	const seen = {};
	let tokens = 0;
	// 40 « @ » examinés au plus (une requête par nom) : un texte rempli de « @ » ne coûte rien de plus.
	while ((m = re.exec(String(body || ''))) !== null && tokens++ < 40) {
		const name = m[2].replace(/[.-]+$/, '').toLowerCase();
		if (seen[name]) continue;
		seen[name] = true;
		try {
			const u = app.findFirstRecordByFilter('users', 'username = {:u}', { u: name });
			if (u.id !== authorId && hasJournalRead(u) && out.indexOf(u.id) === -1) out.push(u.id);
		} catch (_) {}
		if (out.length >= 20) break;
	}
	return out;
}

// Destinataires d'une entrée urgente : agents qui lisent la main courante, du district de l'entrée (ou tous).
function urgentRecipients(app, district, exclude) {
	const list = app.findRecordsByFilter('users', 'role != "disabled" && role != "otto_agent"', '', 500, 0);
	const out = [];
	for (const u of list) {
		if (exclude.indexOf(u.id) !== -1 || !hasJournalRead(u)) continue;
		if (district && u.getString('district') && u.getString('district') !== district) continue;
		out.push(u.id);
	}
	return out;
}

function notify(app, user, kind, title, body, link, source, sourceId) {
	const n = new Record(app.findCollectionByNameOrId('notifications'));
	n.set('user', user);
	n.set('kind', kind);
	n.set('title', String(title).slice(0, 200));
	n.set('body', String(body || '').replace(/\s+/g, ' ').trim().slice(0, 500));
	n.set('link', link);
	n.set('source', source);
	n.set('source_id', sourceId);
	app.save(n);
}

function event(app, entry, kind, field, from, to, auth, note) {
	const ev = new Record(app.findCollectionByNameOrId('ops_log_events'));
	ev.set('entry', entry);
	ev.set('kind', kind);
	ev.set('field', field);
	ev.set('from', String(from == null ? '' : from).slice(0, 4000));
	ev.set('to', String(to == null ? '' : to).slice(0, 4000));
	if (auth && !auth.isSuperuser()) ev.set('by', auth.id);
	ev.set('note', String(note || '').slice(0, 500));
	ev.set('at', now());
	app.save(ev);
}

function authorName(auth) {
	if (!auth || auth.isSuperuser()) return 'Un agent';
	return auth.getString('name') || auth.getString('username') || 'Un agent';
}

function jsonList(record, field) {
	try {
		const v = JSON.parse(record.getString(field) || '[]');
		return Array.isArray(v) ? v.map(String) : [];
	} catch (_) {
		return [];
	}
}

// Notifications d'une entrée, préparées AVANT l'enregistrement : chaque agent est notifié une fois au plus par entrée
// (mention ou urgence), l'urgence n'est diffusée qu'une fois (« *urgent »). La liste est gardée dans `notified`.
function planNotifications(app, record, mentions, urgent) {
	const already = jsonList(record, 'notified');
	const mention = mentions.filter((u) => already.indexOf(u) === -1);
	let urgentTo = [];
	if (urgent && already.indexOf('*urgent') === -1) {
		const exclude = already.concat(mention, [record.getString('author')]);
		urgentTo = urgentRecipients(app, record.getString('district'), exclude);
	}
	const next = already.concat(mention, urgentTo);
	if (urgentTo.length || (urgent && already.indexOf('*urgent') === -1)) next.push('*urgent');
	record.set('notified', next);
	return { mention: mention, urgent: urgentTo };
}

function sendPlanned(app, record, auth, plan) {
	const link = `/operations/main-courante?entree=${record.id}`;
	const who = authorName(auth);
	const excerpt = record.getString('body');
	for (const u of plan.mention) notify(app, u, 'mention', `${who} vous mentionne dans la main courante`, excerpt, link, 'ops_log', record.id);
	for (const u of plan.urgent) notify(app, u, 'urgent', `Entrée urgente de ${who}`, excerpt, link, 'ops_log', record.id);
}

// --- Passages à niveau (import) ---
// « PN 12 Bis » / « PN 9Bis » / « PN 3 TER » → « 12 bis » / « 9 bis » / « 3 ter ».
function pnNumber(v) {
	const m = /^\s*(?:PN\s*)?([0-9]{1,4})\s*(bis|ter)?\s*$/i.exec(String(v || ''));
	if (!m) return '';
	return m[2] ? `${parseInt(m[1], 10)} ${m[2].toLowerCase()}` : String(parseInt(m[1], 10));
}
function bkValue(v) {
	const m = /([0-9]+(?:[.,][0-9]+)?)/.exec(String(v || ''));
	return m ? parseFloat(m[1].replace(',', '.')) : 0;
}
function latLon(v) {
	const m = /(-?[0-9]{1,2}\.[0-9]+)\s*,\s*(-?[0-9]{1,3}\.[0-9]+)/.exec(String(v || ''));
	if (!m) return null;
	const lat = parseFloat(m[1]);
	const lon = parseFloat(m[2]);
	if (lat < 49 || lat > 52 || lon < 2 || lon > 7) return null;
	return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
}
module.exports = {
	MAX_WATCHES,
	isCoord,
	now,
	brusselsDay,
	ids,
	mentionsFrom,
	notify,
	planNotifications,
	sendPlanned,
	jsonList,
	event,
	pnNumber,
	bkValue,
	latLon
};
