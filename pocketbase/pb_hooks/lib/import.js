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
function busStatus(row) {
	if (row.status === 'brouillon') return 'brouillon';
	if (row.kanban_status === 'termine') return 'termine';
	return 'envoye';
}

const ROLES = ['admin', 'sysop', 'moderator', 'otto_agent', 'user', 'reader'];

function importUsers(app, dir, report) {
	const users = readJson(`${dir}/auth_users.json`);
	const hashes = {};
	for (const h of readJson(`${dir}/auth_password_hashes.json`)) hashes[h.id] = h.encrypted_password;
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

function importBusOrders(app, dir, companies, userIds, report) {
	const col = app.findCollectionByNameOrId('bus_orders');
	for (const o of readJson(`${dir}/data/otto_commandes.json`)) {
		const r = new Record(col);
		r.set('legacy_id', o.id);
		r.set('status', busStatus(o));
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
		r.set('buses', o.bus_data || []);
		if (o.societe_id && companies[o.societe_id]) r.set('company', companies[o.societe_id]);
		if (o.user_id && userIds[o.user_id]) r.set('created_by', o.user_id);
		if (o.validated_by && userIds[o.validated_by]) r.set('validated_by', o.validated_by);
		r.set('sent_at', toDate(o.sent_at));
		r.set('sent_by_name', o.sent_by_name || '');
		app.save(r);
		keepCreated(app, 'bus_orders', r.id, o.created_at);
		report.bus_orders++;
	}
}

function importTaxiOrders(app, dir, report) {
	const col = app.findCollectionByNameOrId('taxi_orders');
	for (const t of readJson(`${dir}/data/taxi_commands.json`)) {
		const r = new Record(col);
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

function run(app, dir, reset) {
	const report = { users: 0, password_hashes: 0, avatars: 0, bus_companies: 0, bus_orders: 0, taxi_orders: 0, audit_legacy: 0, anomalies: [] };
	// Purge dans une transaction séparée : PocketBase efface les fichiers des fiches supprimées APRÈS la
	// validation. Dans la même transaction que l'import, il effacerait les avatars tout juste réimportés
	// (mêmes identifiants, donc mêmes dossiers).
	if (reset) {
		app.runInTransaction((tx) => {
			for (const name of ['audit_log', 'taxi_orders', 'bus_orders', 'bus_companies', 'users']) {
				for (const r of tx.findAllRecords(name)) tx.delete(r);
			}
		});
	}
	app.runInTransaction((tx) => {
		importUsers(tx, dir, report);
		const userIds = {};
		for (const u of tx.findAllRecords('users')) userIds[u.id] = true;
		const companies = importCompanies(tx, dir, report);
		importBusOrders(tx, dir, companies, userIds, report);
		importTaxiOrders(tx, dir, report);
		importAudit(tx, dir, report);
	});
	return report;
}

module.exports = { run, toDate, busStatus };
