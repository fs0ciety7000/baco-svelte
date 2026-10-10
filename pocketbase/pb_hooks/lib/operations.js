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
		// Tri automatique (Administration › Journal) : mot-clé d'abord ; la règle sans mot-clé vaut pour les perturbations.
		const category = journalCategory(app, 'irail', `${title} ${description}`, restored ? 'info' : planned ? 'travaux' : '', 'perturbation');
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
// « @DSO », « @DSE », « @DCE » (casse libre) : mention d'un district entier (demande du 10 oct. 2026).
const DISTRICT_TAGS = { DSO: 'Sud-Ouest', DSE: 'Sud-Est', DCE: 'Centre' };
function districtTagsIn(body) {
	const out = [];
	const re = /(^|[^A-Za-z0-9_.-])@(DSO|DSE|DCE)(?![A-Za-z0-9_])/gi;
	let m;
	while ((m = re.exec(String(body || '')))) {
		const tag = m[2].toUpperCase();
		if (out.indexOf(tag) === -1) out.push(tag);
	}
	return out;
}

// Agents qui lisent le journal et travaillent aujourd'hui dans ce district (districts du jour, sinon du profil).
function districtRecipients(app, tag, exclude) {
	const name = DISTRICT_TAGS[tag];
	const list = app.findRecordsByFilter('users', 'role != "disabled" && role != "otto_agent"', '', 500, 0);
	const today = brusselsDay();
	return list.filter((u) => exclude.indexOf(u.id) === -1 && hasJournalRead(u) && dutyDistricts(u, today).indexOf(name) !== -1).map((u) => u.id);
}

function planNotifications(app, record, mentions, urgent) {
	const already = jsonList(record, 'notified');
	const author = record.getString('author');
	const mention = mentions.filter((u) => already.indexOf(u) === -1);
	let urgentTo = [];
	if (urgent && already.indexOf('*urgent') === -1) {
		const exclude = already.concat(mention, [author]);
		urgentTo = urgentRecipients(app, record.getString('district'), exclude);
	}
	const next = already.concat(mention, urgentTo);
	if (urgentTo.length || (urgent && already.indexOf('*urgent') === -1)) next.push('*urgent');
	// Mentions de district : une fois par district et par entrée, sans doubler une mention ou une urgence.
	const district = [];
	for (const tag of districtTagsIn(record.getString('body'))) {
		if (already.indexOf(`*@${tag}`) !== -1) continue;
		next.push(`*@${tag}`);
		for (const u of districtRecipients(app, tag, next.concat([author]))) {
			district.push({ user: u, tag: tag });
			next.push(u);
		}
	}
	record.set('notified', next);
	return { mention: mention, urgent: urgentTo, district: district };
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
	for (const u of plan.mention) notify(app, u, 'mention', `${who} te mentionne dans le Journal`, excerpt, link, 'ops_log', record.id);
	for (const u of plan.urgent) notify(app, u, 'urgent', `Message urgent de ${who}`, excerpt, link, 'ops_log', record.id);
	for (const d of plan.district || []) notify(app, d.user, 'mention', `${who} mentionne @${d.tag} dans le Journal`, excerpt, link, 'ops_log', record.id);
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

// --- Retards des trains des missions PMR / groupes (cron `mission-trains`, demande du 10 oct. 2026) ---

const DISTRICT_NAME = { DSO: 'Sud-Ouest', DSE: 'Sud-Est', DCE: 'Centre' };
const DELAY_ALERT = 5; // minutes : premier seuil, puis paliers de 10 min

function trainId(raw) {
	const s = String(raw || '').trim().toUpperCase().replace(/^BE\.NMBS\./, '').replace(/\s+/g, '');
	return /^[A-Z]{0,4}\d{1,6}$/.test(s) ? s : '';
}

function minutesOf(hhmm) {
	const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
	return m ? +m[1] * 60 + +m[2] : -1;
}

// Heure HH:MM à Bruxelles d'un instant (secondes Unix).
function brusselsHHMM(sec) {
	const t = sec * 1000;
	const y = new Date(t).getUTCFullYear();
	const summer = t >= lastSunday(y, 2) && t < lastSunday(y, 9);
	return new Date(t + (summer ? 2 : 1) * 3600000).toISOString().slice(11, 16);
}

// Arrêt iRail d'une gare de mission : nom replié identique, ou l'un commence par l'autre (« Bruxelles-Midi »).
function findStop(stops, station) {
	const norm = (v) => fold(v).replace(/[^a-z0-9]+/g, ' ').trim();
	const k = norm(station);
	if (!k) return null;
	const namesOf = (s) => [s.st].concat(s.alt ? [s.alt].concat(String(s.alt).split('/')) : []).map(norm).filter(Boolean);
	let best = null;
	for (const s of stops) {
		const names = namesOf(s);
		if (names.indexOf(k) !== -1) return s;
		// Préfixe à une frontière de mot seulement (« Ath » ≠ « Athus »).
		if (!best && names.some((n) => n.indexOf(`${k} `) === 0 || k.indexOf(`${n} `) === 0)) best = s;
	}
	return best;
}

function hasPerm(u, perm, roles) {
	const role = u.getString('role');
	if (role === 'disabled') return false;
	if (role === 'admin' || role === 'sysop') return true;
	if (u.getString('grants').indexOf(`"${perm}"`) !== -1) return true;
	return roles.indexOf(role) !== -1 && u.getString('denies').indexOf(`"${perm}"`) === -1;
}

// Lit l'état iRail des trains portant une mission du jour (dans une fenêtre autour de leurs heures), l'enregistre dans
// `mission_trains` et prévient les agents du district quand le retard à la gare assistée atteint 5 min (puis +10) ou
// quand l'arrêt est supprimé. Une notification par train et par palier.
function missionTrains(app, at) {
	const setting = $os.getenv('CSM_IRAIL_URL');
	if (setting === 'off') return 0;
	const base = (setting || 'https://api.irail.be/v1').replace(/\/$/, '');
	const date = at || new Date();
	const nowMin = Math.floor(brusselsHour(date) * 60);
	if (nowMin < 5 * 60) return 0;
	const today = brusselsDay(date);
	const missions = [];
	const collect = (name, kind) => {
		const rows = app.findRecordsByFilter(
			name,
			'day = {:d} && status != "annulee" && status != "realisee" && train != "" && transport != "taxi"',
			'time',
			2000,
			0,
			{ d: today }
		);
		for (const r of rows) {
			const id = trainId(r.getString('train'));
			if (!id) continue;
			const from = minutesOf(r.getString('time'));
			const to = Math.max(from, minutesOf(r.getString('arr_time')));
			// Fenêtre : 90 min avant le départ jusqu'à 60 min après l'arrivée (heure inconnue : toujours).
			if (from >= 0 && (nowMin < from - 90 || nowMin > to + 60)) continue;
			missions.push({
				kind: kind,
				train: id,
				dep: r.getString('station'),
				arr: r.getString('other_station'),
				inA: r.getBool('in_assist') || (!r.getBool('in_assist') && !r.getBool('out_assist')),
				outA: r.getBool('out_assist'),
				depD: r.getString('district'),
				arrD: r.getString('arr_district'),
				from: from
			});
		}
	};
	collect('pmr_assists', 'pmr');
	collect('group_missions', 'groupe');
	if (!missions.length) return 0;
	const byTrain = {};
	for (const m of missions) (byTrain[m.train] = byTrain[m.train] || []).push(m);
	const ddmmyy = `${today.slice(8, 10)}${today.slice(5, 7)}${today.slice(2, 4)}`;
	const users = app
		.findRecordsByFilter('users', 'role != "disabled" && role != "connector"', '', 500, 0)
		.filter((u) => hasPerm(u, 'deplacements:read', ['moderator', 'user', 'reader']));
	const collection = app.findCollectionByNameOrId('mission_trains');
	const started = Date.now();
	const trains = Object.keys(byTrain).slice(0, 60);
	let sent = 0;
	for (let k = 0; k < trains.length; k++) {
		if (Date.now() - started > 100000) break;
		if (k > 0) sleep(350);
		const train = trains[k];
		let json;
		try {
			const res = $http.send({
				url: `${base}/vehicle/?id=BE.NMBS.${encodeURIComponent(train)}&date=${ddmmyy}&format=json&lang=fr`,
				method: 'GET',
				headers: { 'User-Agent': 'CSM/1.0 (Client Solutions Management Tool; contact: exploitation)' },
				timeout: 5
			});
			if (res.statusCode !== 200 || !res.json || !res.json.stops) continue;
			json = res.json;
		} catch (_) {
			continue;
		}
		let raw = json.stops.stop || [];
		if (!Array.isArray(raw)) raw = [raw];
		// Nom français (lang=fr) d'abord : le nom officiel iRail est bilingue à Bruxelles et néerlandais en Flandre ;
		// retard et suppression au départ (d, c) ET à l'arrivée (da, ca : débarquements, terminus).
		const stops = raw.map((s) => {
			const fr = String(s.station || (s.stationinfo && s.stationinfo.name) || '');
			const official = String((s.stationinfo && s.stationinfo.standardname) || '');
			const flag = (v) => v === '1' || v === 1;
			const min = (v) => Math.round(parseInt(v || '0', 10) / 60) || 0;
			const dep = min(s.departureDelay !== undefined ? s.departureDelay : s.delay);
			const arr = min(s.arrivalDelay !== undefined ? s.arrivalDelay : s.delay);
			const out = {
				st: fr || official,
				t: brusselsHHMM(parseInt(s.time || s.scheduledDepartureTime || '0', 10)),
				d: dep,
				da: arr,
				c: flag(s.departureCanceled) || flag(s.canceled),
				ca: flag(s.arrivalCanceled) || flag(s.canceled),
				l: flag(s.left)
			};
			if (official && official !== out.st) out.alt = official;
			return out;
		});
		if (!stops.length) continue;
		const next = stops.filter((s) => !s.l)[0] || stops[stops.length - 1];
		const allCancelled = stops.every((s) => s.c);
		let rec;
		try {
			rec = app.findFirstRecordByFilter('mission_trains', 'day = {:d} && train = {:t}', { d: today, t: train });
		} catch (_) {
			rec = new Record(collection);
			rec.set('day', today);
			rec.set('train', train);
		}
		rec.set('delay', Math.max(0, Math.min(1440, next.d)));
		rec.set('cancelled', allCancelled);
		rec.set('stops', stops);
		rec.set('checked_at', now());

		// Impact aux gares assistées (seulement les arrêts pas encore quittés).
		let worst = 0;
		let cancelHit = false;
		const districts = {};
		const where = {};
		let pmr = 0;
		let groups = 0;
		for (const m of byTrain[train]) {
			let hit = false;
			const legs = [];
			if (m.inA) legs.push([m.dep, m.depD, false]);
			if (m.outA) legs.push([m.arr, m.arrD, true]);
			for (const leg of legs) {
				const s = findStop(stops, leg[0]);
				if (!s || s.l) continue;
				// Débarquement : retard et suppression à l'arrivée ; embarquement : au départ.
				const delay = leg[2] ? s.da : s.d;
				const cancelled = leg[2] ? s.ca : s.c;
				if (cancelled) cancelHit = true;
				if (cancelled || delay >= DELAY_ALERT) {
					hit = true;
					worst = Math.max(worst, delay);
					if (leg[1]) districts[leg[1]] = true;
					where[s.st] = true;
				}
			}
			if (hit) m.kind === 'pmr' ? pmr++ : groups++;
		}
		const notifiedDelay = rec.getInt('notified_delay');
		const newCancel = cancelHit && !rec.getBool('notified_cancel');
		const newDelay = !cancelHit && worst >= DELAY_ALERT && worst >= (notifiedDelay ? notifiedDelay + 10 : DELAY_ALERT);
		let pending = null;
		if (newCancel || newDelay) {
			const names = Object.keys(districts).map((c) => DISTRICT_NAME[c]).filter(Boolean);
			const parts = [];
			if (pmr) parts.push(`${pmr} mission${pmr > 1 ? 's' : ''} PMR`);
			if (groups) parts.push(`${groups} groupe${groups > 1 ? 's' : ''}`);
			const stations = Object.keys(where).slice(0, 3).join(', ');
			const label = train.replace(/^([A-Z]+)(\d)/, '$1 $2');
			pending = {
				names: names,
				title: newCancel ? `Train ${label} supprimé à ${stations}` : `Train ${label} : +${worst} min à ${stations}`,
				body: `${parts.join(' et ')} concernée${pmr + groups > 1 ? 's' : ''} (iRail).`
			};
			if (newCancel) rec.set('notified_cancel', true);
			if (newDelay) rec.set('notified_delay', worst);
		}
		// Enregistré avant d'envoyer : un échec d'écriture ne rejoue pas les mêmes alertes au passage suivant.
		app.save(rec);
		if (pending && pending.names.length) {
			// Seulement les agents dont les districts du jour croisent ceux des gares concernées (pas de diffusion générale).
			for (const u of users) {
				const mine = dutyDistricts(u, today);
				if (!mine.some((d) => pending.names.indexOf(d) !== -1)) continue;
				notify(app, u.id, 'train', pending.title, pending.body, `/pmr?q=${encodeURIComponent(train.replace(/^[A-Z]+/, ''))}`, 'mission_trains', `${train}:${today}`.slice(0, 40));
				sent++;
			}
		}
	}
	return sent;
}

// --- Tri automatique des messages (réglage `journal_rules`, demande du 10 oct. 2026) ---
const JOURNAL_CATEGORIES = ['incident', 'pmr', 'commande', 'travaux', 'consigne', 'info', 'service', 'perturbation', 'groupes'];
function journalRules(app) {
	try {
		const rec = app.findFirstRecordByData('app_settings', 'key', 'journal_rules');
		const v = JSON.parse(rec.getString('value') || '{}');
		return Array.isArray(v.rules) ? v.rules : [];
	} catch (_) {
		return [];
	}
}
// Catégorie d'un message automatique : 1re règle de la source dont un mot-clé figure dans le texte ; sinon `fixed`
// (catégorie imposée par le type, ex. travaux) ; sinon la règle sans mot-clé de la source ; sinon `fallback`.
function journalCategory(app, source, text, fixed, fallback, rules) {
	const list = (rules || journalRules(app)).filter((r) => r && r.source === source && JOURNAL_CATEGORIES.indexOf(r.category) !== -1);
	const t = fold(text);
	for (const r of list) {
		const words = String(r.match || '')
			.split(',')
			.map((w) => fold(w).trim())
			.filter(Boolean);
		if (words.length && words.some((w) => t.indexOf(w) !== -1)) return r.category;
	}
	if (fixed) return fixed;
	const plain = list.filter((r) => !String(r.match || '').trim())[0];
	return plain ? plain.category : fallback;
}

module.exports = {
	journalCategory,
	journalRules,
	districtTagsIn,
	missionTrains,
	trainId,
	findStop,
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
