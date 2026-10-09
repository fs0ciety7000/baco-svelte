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

// Heure décimale à Bruxelles (même règle d'heure d'été que brusselsDay).
function brusselsHour(at) {
	const t = (at || new Date()).getTime();
	const y = new Date(t).getUTCFullYear();
	const summer = t >= lastSunday(y, 2) && t < lastSunday(y, 9);
	const d = new Date(t + (summer ? 2 : 1) * 3600000);
	return d.getUTCHours() + d.getUTCMinutes() / 60;
}

// Plage de service de l'alerte de synchro DICOS : `CSM_DICOS_ALERT_HOURS` = « 6-22 » (défaut), « off » = coupée.
function alertHours(raw) {
	const v = String(raw || '6-22').trim();
	if (v === 'off') return null;
	const m = /^(\d{1,2})-(\d{1,2})$/.exec(v);
	if (!m || +m[1] >= +m[2] || +m[2] > 24) return { from: 6, to: 22 };
	return { from: +m[1], to: +m[2] };
}

// Alerte « synchro DICOS périmée » (demande du 9 oct. 2026) : pendant le service, si la dernière synchro (missions ou
// groupes) date de plus d'une heure, une notification par épisode (dédupliquée sur l'id de la dernière synchro) aux
// agents qui ont connecté l'extension (jeton personnel) : ceux qui ont coché leurs districts aujourd'hui s'il y en a,
// sinon tous. Aucune synchro depuis 60 jours (extension pas utilisée) : rien.
const STALE_MS = 3600000;
function dicosStaleAlert(app, at) {
	const date = at || new Date();
	const hours = alertHours($os.getenv('CSM_DICOS_ALERT_HOURS'));
	if (!hours) return 0;
	const h = brusselsHour(date);
	// Une heure de marge après l'ouverture du service : la synchro de la veille n'alerte pas dès l'ouverture.
	if (h < hours.from + 1 || h >= hours.to) return 0;
	const last = app.findRecordsByFilter('dicos_syncs', 'kind = "missions" || kind = "groups"', '-created', 1, 0);
	if (!last.length) return 0;
	const lastAt = new Date(last[0].getString('created').replace(' ', 'T')).getTime();
	if (!(date.getTime() - lastAt > STALE_MS)) return 0;
	// Une alerte par épisode ET par jour de service : sans le jour, la synchro d'hier bloquerait l'alerte du matin.
	const sourceId = `${last[0].id}:${brusselsDay(date)}`;
	const tokens = app.findRecordsByFilter('connector_tokens', 'id != ""', '', 500, 0);
	const owners = {};
	for (let i = 0; i < tokens.length; i++) owners[tokens[i].getString('user')] = true;
	const today = brusselsDay(date);
	const all = [];
	const onDuty = [];
	for (const uid in owners) {
		let u;
		try {
			u = app.findRecordById('users', uid);
		} catch (_) {
			continue;
		}
		if (u.getString('role') === 'disabled' || u.getString('role') === 'connector') continue;
		all.push(uid);
		if (u.getString('duty_day') === today) onDuty.push(uid);
	}
	const targets = onDuty.length ? onDuty : all;
	const minutes = Math.round((date.getTime() - lastAt) / 60000);
	const ago = minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
	let sent = 0;
	for (let i = 0; i < targets.length; i++) {
		const dup = app.findRecordsByFilter(
			'notifications',
			'user = {:u} && source = "dicos-sync" && source_id = {:s}',
			'',
			1,
			0,
			{ u: targets[i], s: sourceId },
		);
		if (dup.length) continue;
		notify(
			app,
			targets[i],
			'systeme',
			'Synchro DICOS en retard',
			`Aucune synchro DICOS depuis ${ago}. Ouvre DICOS et lance la synchro depuis l'extension.`,
			'/pmr',
			'dicos-sync',
			sourceId,
		);
		sent++;
	}
	return sent;
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

// Districts où l'agent travaille aujourd'hui : ceux qu'il a cochés pour le jour (`duty_day`), sinon le district de son
// profil, sinon aucun (décision du 9 oct. 2026).
function dutyDistricts(u, today) {
	if (u.getString('duty_day') === today) {
		const v = u.get('duty_districts');
		const out = [];
		if (v) for (let i = 0; i < v.length; i++) if (v[i]) out.push(String(v[i]));
		if (out.length) return out;
	}
	return u.getString('district') ? [u.getString('district')] : [];
}

// Destinataires d'une entrée urgente : agents qui lisent le journal et travaillent aujourd'hui dans le district de
// l'entrée (entrée sans district, ou agent sans district connu : tous).
function urgentRecipients(app, district, exclude) {
	const list = app.findRecordsByFilter('users', 'role != "disabled" && role != "otto_agent"', '', 500, 0);
	const today = brusselsDay();
	const out = [];
	for (const u of list) {
		if (exclude.indexOf(u.id) !== -1 || !hasJournalRead(u)) continue;
		const mine = dutyDistricts(u, today);
		if (district && mine.length && mine.indexOf(district) === -1) continue;
		out.push(u.id);
	}
	return out;
}

// --- Perturbations et travaux iRail → Journal (cron `irail-journal`) ---

const ACCENTS = { à: 'a', â: 'a', ä: 'a', á: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', í: 'i', ô: 'o', ö: 'o', ó: 'o', ù: 'u', û: 'u', ü: 'u', ú: 'u', ç: 'c', ÿ: 'y' };
function fold(s) {
	return String(s || '')
		.toLowerCase()
		.replace(/[àâäáéèêëîïíôöóùûüúçÿ]/g, (c) => ACCENTS[c] || c);
}

// Gares des trois districts (line_stations), triées de la plus longue à la plus courte (« Mons » après « Mons-Nord »).
function stationIndex(app) {
	const rows = arrayOf(new DynamicModel({ station: '', district: '' }));
	app.db().newQuery("SELECT DISTINCT station, district FROM line_stations WHERE station != '' AND district != ''").all(rows);
	const out = [];
	for (const r of rows) {
		const name = fold(r.station);
		if (name.length >= 3) out.push({ name: name, district: String(r.district) });
	}
	return out.sort((x, y) => y.name.length - x.name.length);
}

// Districts cités par un message : gares nommées dans le titre (toutes) ou dans le texte (4 lettres au moins, pour
// éviter « Ans » dans « depuis deux ans »).
function districtsIn(index, title, description) {
	const t = ` ${fold(title)} `;
	const d = ` ${fold(description)} `;
	const out = [];
	for (const st of index) {
		if (out.indexOf(st.district) !== -1) continue;
		const re = new RegExp(`[^a-z0-9]${st.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]`);
		if (re.test(t) || (st.name.length >= 4 && re.test(d))) out.push(st.district);
	}
	return out;
}

function irailJournal(app) {
	// CSM_IRAIL_URL : autre source (tests) ; « off » coupe la reprise (CI : notifications déterministes).
	const setting = $os.getenv('CSM_IRAIL_URL');
	if (setting === 'off') return 0;
	const base = (setting || 'https://api.irail.be/v1').replace(/\/$/, '');
	const res = $http.send({
		url: `${base}/disturbances/?format=json&lang=fr`,
		method: 'GET',
		headers: { 'User-Agent': 'CSM/1.0 (Client Solutions Management Tool; contact: exploitation)' },
		timeout: 10
	});
	if (res.statusCode !== 200 || !res.json) return 0;
	let items = res.json.disturbance || [];
	if (!Array.isArray(items)) items = [items];
	const index = stationIndex(app);
	const users = app.findRecordsByFilter('users', 'role != "disabled" && role != "otto_agent"', '', 500, 0).filter(hasJournalRead);
	const today = brusselsDay();
	const collection = app.findCollectionByNameOrId('ops_log');
	let created = 0;
	for (const d of items) {
		if (created >= 30) break;
		const title = String(d.title || '').trim().slice(0, 300);
		if (!title) continue;
		const ts = parseInt(String(d.timestamp || '0'), 10) * 1000 || Date.now();
		const planned = String(d.type) === 'planned';
		// Perturbation de plus de 24 h : déjà ancienne, pas reprise (les travaux annoncés le sont).
		if (!planned && Date.now() - ts > 86400000) continue;
		const key = $security.sha256(`${d.link || ''}|${title}|${brusselsDay(new Date(ts))}`).slice(0, 40);
		try {
			app.findFirstRecordByFilter('ops_log', 'external_id = {:k}', { k: key });
			continue; // déjà au journal
		} catch (_) {}
		const description = String(d.description || '').replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, 3400);
		const restored = /r[ée]tabli/i.test(title);
		const category = restored ? 'info' : planned ? 'travaux' : 'incident';
		const emoji = restored ? '✅' : planned ? '🚧' : '⚠️';
		const districts = districtsIn(index, title, description);
		const recipients = districts.length
			? users.filter((u) => dutyDistricts(u, today).some((x) => districts.indexOf(x) !== -1)).map((u) => u.id)
			: [];
		const r = new Record(collection);
		r.set('body', `${emoji} **${title.replace(/\*/g, '')}**${description ? `\n${description}` : ''}`.slice(0, 4000));
		r.set('category', category);
		r.set('occurred_at', new Date(ts).toISOString().replace('T', ' '));
		r.set('status', 'active');
		r.set('source', 'irail');
		r.set('external_id', key);
		if (districts.length === 1) r.set('district', districts[0]);
		r.set('mentions', []);
		r.set('notified', recipients);
		app.save(r);
		event(app, r.id, 'create', '', '', '', null, 'iRail');
		const label = restored ? 'Rétabli' : planned ? 'Travaux' : 'Perturbation';
		for (const u of recipients) notify(app, u, 'perturbation', `${label} (${districts.join(', ')}) : ${title}`, description, `/operations/journal?entree=${r.id}`, 'ops_log', r.id);
		created++;
	}
	return created;
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
	const link = `/operations/journal?entree=${record.id}`;
	const who = authorName(auth);
	// Aperçu sans les marques Markdown du Journal (gras, barré, code, titres, citations).
	const excerpt = record
		.getString('body')
		.replace(/\*\*|~~|`/g, '')
		.replace(/^\s*[#>]+\s*/gm, '')
		.replace(/\s+/g, ' ')
		.trim();
	for (const u of plan.mention) notify(app, u, 'mention', `${who} vous mentionne dans le journal`, excerpt, link, 'ops_log', record.id);
	for (const u of plan.urgent) notify(app, u, 'urgent', `Message urgent de ${who}`, excerpt, link, 'ops_log', record.id);
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
	dutyDistricts,
	districtsIn,
	fold,
	irailJournal,
	MAX_WATCHES,
	isCoord,
	now,
	brusselsDay,
	brusselsHour,
	alertHours,
	dicosStaleAlert,
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
