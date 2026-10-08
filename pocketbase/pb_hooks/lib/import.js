// Import de la sauvegarde Supabase → PocketBase (appelé par la commande csm-import).
// Tout se fait dans une transaction : en cas d'erreur, rien n'est importé.

function readJson(path) {
	return JSON.parse(toString($os.readFile(path)));
}

function exists(path) {
	try {
		$os.stat(path);
		return true;
	} catch (_) {
		return false;
	}
}

// Supabase renvoie « 2026-01-19T10:47:50.123+00:00 » ; PocketBase stocke « 2026-01-19 10:47:50.123Z ».
function toDate(value) {
	if (!value) return '';
	const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
	if (isNaN(d.getTime())) return '';
	return d.toISOString().replace('T', ' ');
}

// Le champ autodate `created` est forcé à « maintenant » à l'enregistrement : on rétablit la date d'origine.
function keepCreated(app, table, id, value) {
	const created = toDate(value);
	if (!created) return;
	app.db().newQuery(`UPDATE ${table} SET created = {:created} WHERE id = {:id}`).bind({ created: created, id: id }).execute();
}

// Statut unifié des commandes (docs/PROPOSITION.md §5) depuis statut + colonne kanban de la v1.
// Règles de AUDIT-UX-COMMANDES §4 : envoyé + heure confirmée → confirmé ; kanban en route → en cours ;
// kanban terminé, ou date passée avec démobilisation saisie → terminé. `is_mail_sent` est abandonné.
function busStatus(row, today) {
	if (row.status === 'brouillon') return 'brouillon';
	const buses = row.bus_data || [];
	if (row.kanban_status === 'termine') return 'termine';
	const demob = buses.some((b) => b && b.heure_demob) || !!row.heure_demob;
	if (row.date_commande && row.date_commande < today && demob) return 'termine';
	if (row.kanban_status === 'en_approche' || row.kanban_status === 'sur_place') return 'en_cours';
	const confirmed = buses.some((b) => b && b.heure_confirmee) || !!row.heure_confirmee;
	return confirmed ? 'confirme' : 'envoye';
}

const DISTRICT_CODES = { DSO: 'Sud-Ouest', DSE: 'Sud-Est', DCE: 'Centre' };
const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];

function hhmm(v) {
	return typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : '';
}

// bus_data v1 → buses v2 : { plate, planned, confirmed, demob, cancelled, driver, specific_route, origin, destination }.
function mapBuses(list, drivers) {
	return (list || []).filter(Boolean).map((b) => ({
		plate: b.plaque || '',
		planned: hhmm(b.heure_prevue),
		confirmed: hhmm(b.heure_confirmee),
		demob: hhmm(b.heure_demob),
		cancelled: b.demob_type === 'annulation',
		driver: (b.chauffeur_id && drivers[b.chauffeur_id]) || '',
		specific_route: !!b.is_specific_route,
		origin: b.origine_specifique || '',
		destination: b.destination_specifique || ''
	}));
}

function legacyEvent(app, kind, id, from, to, at, by) {
	const col = app.findCollectionByNameOrId('order_events');
	const ev = new Record(col);
	ev.set('kind', kind);
	ev.set('order', id);
	ev.set('from', from);
	ev.set('to', to);
	if (by) ev.set('by', by);
	ev.set('legacy', true);
	ev.set('at', at || toDate(new Date().toISOString()));
	app.save(ev);
}

const ROLES = ['admin', 'sysop', 'moderator', 'otto_agent', 'user', 'reader'];

function importUsers(app, dir, report) {
	const users = readJson(`${dir}/auth_users.json`);
	const hashes = {};
	// Empreintes exportées à part (hors Git). Sans elles, les comptes reçoivent un mot de passe aléatoire.
	if (exists(`${dir}/auth_password_hashes.json`)) {
		for (const h of readJson(`${dir}/auth_password_hashes.json`)) hashes[h.id] = h.encrypted_password;
	} else {
		report.anomalies.push('auth_password_hashes.json absent : mots de passe non repris');
	}
	const profiles = {};
	for (const p of readJson(`${dir}/data/profiles.json`)) profiles[p.id] = p;

	const col = app.findCollectionByNameOrId('users');
	for (const u of users) {
		const p = profiles[u.id] || {};
		const r = new Record(col);
		r.set('id', u.id);
		r.set('email', u.email);
		r.set('emailVisibility', true);
		r.set('verified', !!u.email_confirmed_at);
		r.set('name', p.full_name || '');
		r.set('username', p.username || '');
		r.set('role', ROLES.indexOf(p.role) !== -1 ? p.role : 'reader');
		const perms = p.permissions || {};
		r.set('grants', Object.keys(perms).filter((k) => perms[k] === true));
		r.set('denies', Object.keys(perms).filter((k) => perms[k] === false));
		r.set('fonction', p.fonction || '');
		r.set('district', p.district || '');
		r.set('banned_until', toDate(p.banned_until));
		r.set('preferences', { theme: p.theme || 'default', dashboard: p.dashboard_config || [] });
		// Mot de passe provisoire (champ obligatoire), remplacé juste après par l'empreinte d'origine.
		r.setPassword($security.randomString(40));

		const m = /\/avatars\/(.+)$/.exec(p.avatar_url || '');
		if (m) {
			const path = `${dir}/storage/avatars/${decodeURIComponent(m[1])}`;
			if (exists(path)) {
				r.set('avatar', $filesystem.fileFromPath(path));
				report.avatars++;
			}
		}
		app.save(r);
		keepCreated(app, 'users', u.id, u.created_at);

		const hash = hashes[u.id];
		if (hash && /^\$2[aby]\$\d{2}\$/.test(hash)) {
			app.db()
				.newQuery('UPDATE users SET password = {:hash} WHERE id = {:id}')
				.bind({ hash: hash, id: u.id })
				.execute();
			report.password_hashes++;
		}
		report.users++;
	}
}

function importCompanies(app, dir, report) {
	const col = app.findCollectionByNameOrId('bus_companies');
	const map = {};
	for (const s of readJson(`${dir}/data/societes_bus.json`)) {
		const r = new Record(col);
		r.set('legacy_id', s.id);
		const name = (s.nom || '').trim();
		if (!name) report.anomalies.push(`societes_bus ${s.id} : nom vide`);
		r.set('name', name || `Société sans nom n°${s.id}`);
		r.set('address', s.adresse || '');
		r.set('phone', s.telephone || '');
		r.set('email', s.email || '');
		app.save(r);
		map[s.id] = r.id;
		report.bus_companies++;
	}
	return map;
}

function importCompanyChildren(app, dir, companies, report) {
	const drivers = {};
	const specs = [
		['bus_drivers', 'chauffeurs_bus', (r, x) => { r.set('name', (x.nom || '').trim() || '?'); r.set('phone', x.tel || ''); }],
		['bus_contacts', 'contacts_bus', (r, x) => { r.set('name', (x.nom || '').trim() || '?'); r.set('phone', x.tel || ''); }],
		['bus_company_lines', 'lignes_bus', (r, x) => r.set('line', String(x.ligne || '').trim() || '?')]
	];
	for (const [name, table, fill] of specs) {
		const col = app.findCollectionByNameOrId(name);
		report[name] = 0;
		for (const x of readJson(`${dir}/data/${table}.json`)) {
			if (!companies[x.societe_id]) {
				report.anomalies.push(`${table} ${x.id} : société ${x.societe_id} inconnue`);
				continue;
			}
			const r = new Record(col);
			r.set('legacy_id', x.id);
			r.set('company', companies[x.societe_id]);
			fill(r, x);
			app.save(r);
			if (name === 'bus_drivers') drivers[x.id] = r.id;
			report[name]++;
		}
	}
	return drivers;
}

function importTaxiCompanies(app, dir, report) {
	const col = app.findCollectionByNameOrId('taxi_companies');
	const byName = {};
	report.taxi_companies = 0;
	const arr = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
	for (const t of readJson(`${dir}/data/taxis.json`)) {
		const r = new Record(col);
		r.set('legacy_id', t.id);
		r.set('name', (t.nom || '').trim() || `Taxi sans nom n°${t.id}`);
		r.set('places', arr(t.lieux));
		r.set('phones', arr(t.contacts));
		r.set('emails', arr(t.mail));
		r.set('addresses', arr(t.adresse));
		r.set('notes', arr(t.remarques));
		app.save(r);
		keepCreated(app, 'taxi_companies', r.id, t.created_at);
		byName[(t.nom || '').trim().toLowerCase()] = r.id;
		report.taxi_companies++;
	}
	return byName;
}

function importPmrClients(app, dir, userIds, report) {
	const col = app.findCollectionByNameOrId('pmr_clients');
	report.pmr_clients = 0;
	for (const c of readJson(`${dir}/data/pmr_clients.json`)) {
		const r = new Record(col);
		r.set('legacy_id', c.id);
		r.set('last_name', c.nom || '');
		r.set('first_name', c.prenom || '');
		r.set('phone', c.telephone || '');
		// Type normalisé (NV, CRF…) ; un libellé libre devient AUTRE + détail.
		const t = String(c.type || '').trim();
		const code = t.replace(/^\d+\s*/, '').toUpperCase();
		if (['NV', 'CRF', 'CRE', 'CRP', 'MR'].indexOf(code) !== -1) r.set('type', code);
		else if (t) {
			r.set('type', 'AUTRE');
			r.set('type_detail', t.slice(0, 200));
		}
		r.set('notes', c.remarques || '');
		if (c.updated_by && userIds[c.updated_by]) r.set('updated_by', c.updated_by);
		app.save(r);
		keepCreated(app, 'pmr_clients', r.id, c.created_at);
		report.pmr_clients++;
	}
}

function importLineStations(app, dir, report) {
	const col = app.findCollectionByNameOrId('line_stations');
	report.line_stations = 0;
	for (const l of readJson(`${dir}/data/ligne_data.json`)) {
		if (!l.ligne_nom || !l.gare) continue;
		const r = new Record(col);
		r.set('legacy_id', l.id);
		r.set('line', String(l.ligne_nom).trim());
		r.set('station', String(l.gare).trim());
		r.set('position', l.ordre || 0);
		if (DISTRICT_CODES[l.district]) r.set('district', DISTRICT_CODES[l.district]);
		app.save(r);
		report.line_stations++;
	}
}

// --- Module PMR : zones (graine), matériel (pmr_data), prestations (movement_interventions analysées) ---
const ZONES = [
	{ code: 'FMS', label: 'Mons', district: 'Sud-Ouest' },
	{ code: 'FTY', label: 'Tournai', district: 'Sud-Ouest' },
	{ code: 'FCR', label: 'Charleroi', district: 'Sud-Ouest' }
];

function importPmr(app, dir, report) {
	const pmr = require(`${__hooks}/lib/pmr.js`);
	const data = readJson(`${dir}/data/pmr_data.json`);
	const moves = readJson(`${dir}/data/daily_movements.json`);
	const inter = readJson(`${dir}/data/movement_interventions.json`);
	// Gares de chaque zone, telles que la v1 les utilisait (matériel + interventions).
	const stations = {};
	for (const z of ZONES) stations[z.code] = {};
	for (const d of data) if (stations[d.zone] && d.gare) stations[d.zone][pmr.norm(d.gare)] = true;
	for (const i of inter) if (stations[i.zone] && i.station) stations[i.zone][pmr.norm(i.station)] = true;
	const zoneIds = {};
	const zcol = app.findCollectionByNameOrId('pmr_zones');
	for (const z of ZONES) {
		const r = new Record(zcol);
		r.set('code', z.code);
		r.set('label', z.label);
		r.set('district', z.district);
		r.set('stations', Object.keys(stations[z.code]).sort());
		app.save(r);
		zoneIds[z.code] = r.id;
	}
	report.pmr_zones = ZONES.length;

	const ecol = app.findCollectionByNameOrId('pmr_equipment');
	const MONTHS = { janv: 1, jan: 1, fevr: 2, fev: 2, feb: 2, mars: 3, mar: 3, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6, juil: 7, jul: 7, aout: 8, aug: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12 };
	const validUntil = (v) => {
		const m = /^([a-zéû]+)\.?-(\d{2}|\d{4})$/i.exec(String(v || '').trim());
		if (!m) return '';
		const mo = MONTHS[pmr.norm(m[1]).toLowerCase()];
		if (!mo) return '';
		const y = m[2].length === 2 ? 2000 + parseInt(m[2], 10) : parseInt(m[2], 10);
		const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
		return `${y}-${String(mo).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
	};
	const STATE = { OK: 'ok', HS: 'hs', 'En attente': 'en_attente' };
	report.pmr_equipment = 0;
	report.pmr_equipment_validity_unread = 0;
	for (const d of data) {
		const r = new Record(ecol);
		r.set('legacy_id', d.id);
		r.set('station', String(d.gare || '?').trim().toUpperCase());
		r.set('platform', d.quai && d.quai !== 'N/A' ? String(d.quai) : '');
		if (zoneIds[d.zone]) r.set('zone', zoneIds[d.zone]);
		const a = String(d.type_assistance || '').toLowerCase();
		if (['3h', 'full', 'light', 'taxi'].indexOf(a) !== -1) r.set('assistance', a);
		r.set('ramp_type', d.type_rampe && d.type_rampe !== 'N/A' ? d.type_rampe : '');
		r.set('ramp_id', d.rampe_id && d.rampe_id !== '000' && d.rampe_id !== 'N/A' ? String(d.rampe_id) : '');
		r.set('state', STATE[d.etat_rampe] || 'ok');
		r.set('repair_requested', !!d.reparation_demandee);
		r.set('padlock', d.cadenas && d.cadenas !== 'N/A' ? String(d.cadenas) : '');
		const v = validUntil(d.validite);
		r.set('valid_until', v);
		if (!v && d.validite && d.validite !== '000') report.pmr_equipment_validity_unread++;
		r.set('ramp_note', d.remarque_rampe || '');
		r.set('station_restrictions', d.restrictions_gare || '');
		r.set('station_info', d.remarque_gare || '');
		app.save(r);
		keepCreated(app, 'pmr_equipment', r.id, d.created_at);
		report.pmr_equipment++;
	}

	// Prestations : une par segment IN / OUT du texte DICOS ; sans segment lisible, une prestation « à vérifier ».
	const days = {};
	for (const m of moves) days[m.id] = String(m.date).slice(0, 10);
	const acol = app.findCollectionByNameOrId('pmr_assists');
	report.pmr_assists = 0;
	report.pmr_interventions_unparsed = 0;
	for (const i of inter) {
		const day = days[i.movement_id];
		if (!day) continue;
		const p = pmr.parseDicos(i.pmr_details);
		const segs = p.segments.length ? p.segments : [{ direction: '', train: '', time: '' }];
		if (!p.segments.length) report.pmr_interventions_unparsed++;
		for (const seg of segs) {
			const r = new Record(acol);
			r.set('day', day);
			r.set('time', seg.time);
			r.set('period', seg.time ? pmr.periodOf(seg.time) : i.period === 'afternoon' ? 'apres_midi' : 'matin');
			r.set('direction', seg.direction);
			r.set('train', seg.train);
			r.set('station', String(i.station || '').trim().toUpperCase());
			if (zoneIds[i.zone]) r.set('zone', zoneIds[i.zone]);
			r.set('dicos_ref', p.ref);
			r.set('pax', p.pax);
			if (p.type) r.set('pmr_type', p.type);
			r.set('status', day < new Date().toISOString().slice(0, 10) ? 'realisee' : 'prevue');
			r.set('legacy_id', String(i.id));
			app.save(r);
			// Texte d'origine (peut contenir un nom) : collection à part, lisible avec pmr:read seulement.
			const lg = new Record(app.findCollectionByNameOrId('pmr_assist_legacy'));
			lg.set('assist', r.id);
			lg.set('text', String(i.pmr_details || '').slice(0, 2000));
			app.save(lg);
			keepCreated(app, 'pmr_assists', r.id, i.created_at);
			report.pmr_assists++;
		}
	}
}

function importB201(app, dir, userIds, report) {
	const col = app.findCollectionByNameOrId('b201_reports');
	report.b201_reports = 0;
	for (const b of readJson(`${dir}/data/b201_reports.json`)) {
		const r = new Record(col);
		r.set('day', String(b.report_date).slice(0, 10));
		r.set('notes', {});
		r.set('manual', []);
		r.set('legacy', b.report_data || {});
		if (b.created_by && userIds[b.created_by]) r.set('updated_by', b.created_by);
		app.save(r);
		keepCreated(app, 'b201_reports', r.id, b.created_at);
		report.b201_reports++;
	}
}

function importBusOrders(app, dir, companies, drivers, users, report) {
	const col = app.findCollectionByNameOrId('bus_orders');
	const today = new Date().toISOString().slice(0, 10);
	for (const o of readJson(`${dir}/data/otto_commandes.json`)) {
		const r = new Record(col);
		const status = busStatus(o, today);
		r.set('legacy_id', o.id);
		r.set('number', o.id);
		r.set('status', status);
		r.set('c3_type', o.c3_type);
		r.set('reason', o.motif || '');
		r.set('order_date', toDate(o.date_commande));
		r.set('call_time', o.heure_appel ? o.heure_appel.slice(0, 5) : '');
		r.set('lines', o.lignes || []);
		r.set('stops', o.arrets || []);
		r.set('stops_mode', o.arrets_mode === 'manuel' ? 'manuel' : 'auto');
		r.set('stops_manual', o.arrets_manuel || '');
		r.set('relation', o.relation || '');
		r.set('origin', o.origine || '');
		r.set('destination', o.destination || '');
		r.set('round_trip', !!o.is_aller_retour);
		r.set('direct', o.is_direct !== false);
		r.set('bus_count', o.nombre_bus || 0);
		r.set('bus_capacity', o.capacite_bus || 0);
		r.set('passengers', o.nombre_voyageurs || 0);
		r.set('pmr_count', o.nombre_pmr || 0);
		// Les anciennes colonnes à plat (plaque, heures, plaques[]) sont déjà reprises dans bus_data.
		r.set('buses', mapBuses(o.bus_data, drivers));
		if (o.societe_id && companies[o.societe_id]) r.set('company', companies[o.societe_id]);
		const author = o.user_id && users[o.user_id];
		if (author) {
			r.set('created_by', o.user_id);
			if (DISTRICTS.indexOf(author.district) !== -1) r.set('district', author.district);
		}
		if (o.validated_by && users[o.validated_by]) r.set('validated_by', o.validated_by);
		const sentAt = toDate(o.sent_at) || (status !== 'brouillon' ? toDate(o.created_at) : '');
		r.set('sent_at', status !== 'brouillon' ? sentAt : '');
		if (status !== 'brouillon' && o.validated_by && users[o.validated_by]) r.set('sent_by', o.validated_by);
		r.set('sent_by_name', o.sent_by_name || '');
		app.save(r);
		keepCreated(app, 'bus_orders', r.id, o.created_at);
		legacyEvent(app, 'bus', r.id, '', 'brouillon', toDate(o.created_at), author ? o.user_id : '');
		if (status !== 'brouillon') legacyEvent(app, 'bus', r.id, 'brouillon', status, sentAt, '');
		report.bus_orders++;
	}
}

function importTaxiOrders(app, dir, taxiByName, usersByName, report) {
	const col = app.findCollectionByNameOrId('taxi_orders');
	const rows = readJson(`${dir}/data/taxi_commands.json`).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
	let n = 0;
	for (const t of rows) {
		const r = new Record(col);
		r.set('number', ++n);
		const company = taxiByName[(t.taxi_nom || '').trim().toLowerCase()];
		if (company) r.set('taxi_company', company);
		const author = usersByName[(t.redacteur || '').trim().toLowerCase()];
		if (author) {
			r.set('created_by', author.id);
			if (DISTRICTS.indexOf(author.district) !== -1) r.set('district', author.district);
		}
		r.set('status', ['brouillon', 'envoye', 'confirme', 'en_cours', 'termine', 'annule'].indexOf(t.status) !== -1 ? t.status : 'brouillon');
		r.set('author', t.redacteur || '');
		r.set('trip_at', toDate(t.date_trajet));
		r.set('return_at', toDate(t.date_retour));
		r.set('trip_type', t.type_trajet || '');
		r.set('from_station', t.gare_origine || '');
		r.set('to_station', t.gare_arrivee || '');
		r.set('via_station', t.gare_via || '');
		r.set('return_from', t.gare_retour_origine || '');
		r.set('return_to', t.gare_retour_arrivee || '');
		r.set('taxi_name', t.taxi_nom || '');
		r.set('taxi_email', t.taxi_email || '');
		r.set('taxi_phone', t.taxi_tel || '');
		r.set('taxi_address', t.taxi_adresse || '');
		r.set('is_pmr', !!t.is_pmr);
		r.set('pmr_type', t.pmr_type || '');
		r.set('pmr_last_name', t.pmr_nom || '');
		r.set('pmr_first_name', t.pmr_prenom || '');
		r.set('pmr_phone', t.pmr_tel || '');
		r.set('pmr_file', t.pmr_dossier || '');
		r.set('pmr_reason', t.pmr_motif || '');
		r.set('passenger_name', t.passager_nom || '');
		r.set('relation_number', t.relation_number || '');
		r.set('billing', t.facturation || '');
		r.set('reason', t.motif || '');
		r.set('passengers', t.nombre_passagers || 0);
		r.set('pmr_count', t.nombre_pmr || 0);
		r.set('vehicles', t.nombre_vehicules || 0);
		app.save(r);
		keepCreated(app, 'taxi_orders', r.id, t.created_at);
		legacyEvent(app, 'taxi', r.id, '', r.getString('status'), toDate(t.created_at), author ? author.id : '');
		report.taxi_orders++;
	}
}

// Historique d'audit de la v1 (audit_logs, avec différentiel) conservé en lecture, marqué « legacy ».
function importAudit(app, dir, report) {
	const col = app.findCollectionByNameOrId('audit_log');
	const actions = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' };
	for (const a of readJson(`${dir}/data/audit_logs.json`)) {
		const r = new Record(col);
		r.set('action', actions[a.action_type] || 'update');
		r.set('collection', a.table_name || '?');
		r.set('record', String(a.record_id || '?'));
		r.set('user', a.user_id || '');
		r.set('changes', a.changes || {});
		r.set('legacy', true);
		r.set('at', toDate(a.timestamp));
		app.save(r);
		report.audit_legacy++;
	}
}

// Collections du module Commandes, dans l'ordre de purge (dépendances d'abord).
const PMR_COLLECTIONS = ['pmr_events', 'pmr_assist_legacy', 'pmr_assists', 'pmr_equipment', 'pmr_zones'];
const ORDER_COLLECTIONS = [
	'order_events',
	'order_templates',
	'b201_reports',
	'taxi_orders',
	'bus_orders',
	'bus_drivers',
	'bus_contacts',
	'bus_company_lines',
	'bus_companies',
	'taxi_companies',
	'pmr_clients',
	'line_stations'
];

/**
 * scope = 'all' : tout (comptes compris) ; scope = 'pmr' : zones, matériel, prestations (fiches clients gardées) ;
 * scope = 'commandes' : Commandes + PMR (les prestations pointent vers les fiches clients réimportées), les comptes
 * existants sont gardés (rejouer l'import sur une base qui a déjà ses comptes, sans les empreintes).
 */
function run(app, dir, reset, scope) {
	scope = scope || 'all';
	const report = { scope: scope, users: 0, password_hashes: 0, avatars: 0, bus_companies: 0, bus_orders: 0, taxi_orders: 0, audit_legacy: 0, anomalies: [] };
	// Purge dans une transaction séparée : PocketBase efface les fichiers des fiches supprimées APRÈS la
	// validation. Dans la même transaction que l'import, il effacerait les avatars tout juste réimportés
	// (mêmes identifiants, donc mêmes dossiers).
	if (reset) {
		app.runInTransaction((tx) => {
			// Les prestations PMR pointent vers pmr_clients : purgées avec le module Commandes (qui réimporte les fiches).
			const names =
				scope === 'pmr' ? PMR_COLLECTIONS : scope === 'commandes' ? [...PMR_COLLECTIONS, ...ORDER_COLLECTIONS] : ['audit_log', ...PMR_COLLECTIONS, ...ORDER_COLLECTIONS];
			for (const name of names) {
				// SQL direct : pas de hooks (historique, audit) ni de cascade à rejouer pendant la purge.
				tx.db().newQuery(`DELETE FROM ${name}`).execute();
			}
			// Comptes : suppression par l'API pour effacer aussi leurs avatars.
			if (scope === 'all') for (const r of tx.findAllRecords('users')) tx.delete(r);
		});
	}
	app.runInTransaction((tx) => {
		if (scope === 'pmr') {
			importPmr(tx, dir, report);
			tx.db().newQuery("UPDATE pmr_clients SET last_activity = created WHERE last_activity = '' OR last_activity IS NULL").execute();
			return;
		}
		if (scope === 'all') importUsers(tx, dir, report);
		const userIds = {};
		const users = {};
		const usersByName = {};
		for (const u of tx.findAllRecords('users')) {
			userIds[u.id] = true;
			users[u.id] = { id: u.id, district: u.getString('district') };
			const name = u.getString('name').trim().toLowerCase();
			if (name) usersByName[name] = users[u.id];
		}
		const companies = importCompanies(tx, dir, report);
		const drivers = importCompanyChildren(tx, dir, companies, report);
		const taxiByName = importTaxiCompanies(tx, dir, report);
		importPmrClients(tx, dir, userIds, report);
		importLineStations(tx, dir, report);
		importBusOrders(tx, dir, companies, drivers, users, report);
		importTaxiOrders(tx, dir, taxiByName, usersByName, report);
		importB201(tx, dir, userIds, report);
		importPmr(tx, dir, report);
		// Dernière activité des fiches : leur date de création BACO (`updated` vaut la date de l'import ; aucun lien
		// n'est repris de BACO).
		tx.db().newQuery("UPDATE pmr_clients SET last_activity = created WHERE last_activity = '' OR last_activity IS NULL").execute();
		if (scope === 'all') importAudit(tx, dir, report);
	});
	return report;
}

module.exports = { run, toDate, busStatus, mapBuses };
