// Import différentiel BACO → CSM (commande csm-import-delta, voir pb_hooks/import.pb.js et docs/DEPLOIEMENT-V2.md §7).
//
// Rapatrie ce qui a été saisi dans BACO après la sauvegarde Supabase qui a servi à construire la base CSM, sans écraser
// ce que les agents ont fait dans CSM depuis :
//   - ligne BACO absente de CSM (clé : legacy_id ou clé propre à la table) et nouvelle → créée ;
//   - présente et identique (après correspondance) → rien ;
//   - présente, différente, et non modifiée dans CSM depuis l'import → mise à jour (champs repris de BACO seulement) ;
//   - présente, différente, et modifiée dans CSM → CONFLIT, non écrasée, listée dans le rapport ;
//   - jamais de suppression (une ligne supprimée dans BACO reste dans CSM ; une fiche supprimée dans CSM n'est pas recréée).
// Une transaction par table (une seule, annulée à la fin, en --dry-run). Relancer ne duplique rien.
//
// « Modifiée dans CSM » : `updated` > date de l'import initial (--imported-at), sauf si les champs repris ont encore la
// valeur que l'import différentiel précédent y a écrite (empreinte gardée dans app_settings `import_delta`) ou celle
// que la sauvegarde de base (--base) aurait produite (aucun champ repris n'a été touché dans CSM).
//
// Correspondances ligne → fiche : celles de lib/import.js (import complet), et pour les référentiels celles du script
// d'import des référentiels du 8 octobre (hors dépôt), reprises ici.

const imp = require(`${__hooks}/lib/import.js`);

// Tables BACO non reprises dans CSM (gamification supprimée, modules abandonnés, données recalculées) : le rapport
// signale seulement leurs lignes nouvelles ou modifiées.
const NOT_MIGRATED = [
	'admin_audit_view', 'app_backups', 'app_error_logs', 'app_settings', 'changelog', 'custom_emojis', 'darts_games',
	'favoris', 'gare_coordinates', 'infractions', 'leave_requests', 'notifications', 'planning', 'presences',
	'procedure_versions', 'profile_comments', 'profile_likes', 'remise_bus', 'remise_intervention', 'remise_pmr',
	'remise_taxi', 'remises', 'team_board', 'temp_geo_data', 'user_preferences', 'user_presence', 'audit_log'
];

const REGISTRY_KEY = 'import_delta';

// --- Outils ---

function canon(v) {
	if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
	if (v && typeof v === 'object') {
		return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
	}
	return JSON.stringify(v === undefined ? null : v);
}

function ms(v) {
	if (!v) return NaN;
	return new Date(String(v).replace(' ', 'T')).getTime();
}

function loadRows(dir, table) {
	const path = `${dir}/data/${table}.json`;
	return imp.exists(path) ? imp.readJson(path) : null;
}

const norm = (s) => String(s === null || s === undefined ? '' : s).trim();

// Valeur comparable d'un champ d'une fiche (types normalisés : JSON trié, nombres, listes).
function val(rec, f) {
	const field = rec.collection().fields.getByName(f);
	const type = field ? field.type() : 'text';
	if (type === 'json') {
		const raw = rec.getString(f);
		try {
			return canon(raw ? JSON.parse(raw) : null);
		} catch (_) {
			return raw;
		}
	}
	if (type === 'bool') return rec.getBool(f) ? 'true' : 'false';
	if (type === 'number') return String(rec.getFloat(f));
	if (type === 'relation' || type === 'select' || type === 'file') return rec.getStringSlice(f).join(',');
	return rec.getString(f);
}

function fingerprint(rec, fields) {
	return $security.sha256(canon(fields.slice().sort().map((f) => [f, val(rec, f)])));
}

// Fiche « brouillon » qui note les champs posés par une correspondance.
function capture(col) {
	const rec = new Record(col);
	const fields = [];
	return {
		rec: rec,
		fields: fields,
		set(k, v) {
			if (fields.indexOf(k) === -1) fields.push(k);
			rec.set(k, v);
		},
		getString(k) {
			return rec.getString(k);
		}
	};
}

function diffFields(fresh, existing) {
	return fresh.fields.filter((f) => val(fresh.rec, f) !== val(existing, f));
}

function tableReport(coll, table, spec) {
	return {
		collection: coll,
		source: table,
		key: spec.keyLabel || 'legacy_id',
		timestamps: spec.ts && spec.ts.length ? spec.ts.join(', ') : 'aucun',
		created: 0,
		updated: 0,
		identical: 0,
		conflicts: 0,
		ignored: 0,
		out_of_delta: 0,
		deleted_in_baco: 0,
		items: []
	};
}

// --- Contexte : tables de correspondance lues dans CSM (relues avant chaque table : les précédentes ont pu créer) ---

function byLegacy(app, coll) {
	const map = {};
	for (const r of app.findAllRecords(coll)) {
		const k = r.getString('legacy_id');
		if (k && k !== '0') map[k] = r;
	}
	return map;
}

function buildContext(app) {
	const ctx = { users: {}, userIds: {}, usersByName: {}, districtOf: {}, companies: {}, drivers: {}, taxiByName: {}, zoneIds: {} };
	for (const u of app.findAllRecords('users')) {
		ctx.userIds[u.id] = true;
		ctx.users[u.id] = { id: u.id, district: u.getString('district') };
		ctx.districtOf[u.id] = u.getString('district');
		const name = u.getString('name').trim().toLowerCase();
		if (name) ctx.usersByName[name] = ctx.users[u.id];
	}
	for (const r of app.findAllRecords('bus_companies')) if (r.getInt('legacy_id') > 0) ctx.companies[r.getInt('legacy_id')] = r.id;
	for (const r of app.findAllRecords('bus_drivers')) if (r.getInt('legacy_id') > 0) ctx.drivers[r.getInt('legacy_id')] = r.id;
	for (const r of app.findAllRecords('taxi_companies')) ctx.taxiByName[r.getString('name').trim().toLowerCase()] = r.id;
	for (const r of app.findAllRecords('pmr_zones')) ctx.zoneIds[r.getString('code')] = r.id;
	return ctx;
}

// --- Spécifications des tables, dans l'ordre des dépendances ---
// table : table BACO ; coll : collection CSM ; ts : colonnes d'horodatage BACO ; audit : la table figure dans le journal
// d'audit de BACO (audit_log / audit_logs) ; index(app) → { clé: fiche } ; key(row) → clé ; prepare(row, ctx) → texte si
// la ligne n'est pas reprise ; fill(r, row, ctx) ; onCreate / afterCreate / afterUpdate(app, rec, row, ctx, avant).

function legacyIndex(coll) {
	return (app) => byLegacy(app, coll);
}

const SPECS = [
	{
		coll: 'bus_companies', table: 'societes_bus', ts: [], audit: true,
		fill: (r, s) => imp.fillCompany(r, s)
	},
	...imp.COMPANY_CHILDREN.map(([coll, table, fill]) => ({
		coll: coll, table: table, ts: [], audit: true,
		prepare: (x, ctx) => (ctx.companies[x.societe_id] ? '' : `société ${x.societe_id} inconnue`),
		fill: (r, x, ctx) => {
			r.set('legacy_id', x.id);
			r.set('company', ctx.companies[x.societe_id]);
			fill(r, x);
		}
	})),
	{
		coll: 'taxi_companies', table: 'taxis', ts: ['created_at'], audit: true,
		fill: (r, t) => imp.fillTaxiCompany(r, t),
		afterCreate: (app, rec, t) => imp.keepCreated(app, 'taxi_companies', rec.id, t.created_at)
	},
	{
		coll: 'pmr_clients', table: 'pmr_clients', ts: ['created_at', 'updated_at'], audit: true,
		fill: (r, c, ctx) => imp.fillPmrClient(r, c, ctx.userIds),
		afterCreate: (app, rec, c) => {
			imp.keepCreated(app, 'pmr_clients', rec.id, c.created_at);
			app.db().newQuery("UPDATE pmr_clients SET last_activity = created WHERE id = {:id}").bind({ id: rec.id }).execute();
		}
	},
	{
		coll: 'line_stations', table: 'ligne_data', ts: [],
		prepare: (l) => (imp.lineStationValid(l) ? '' : 'ligne ou gare vide'),
		fill: (r, l) => imp.fillLineStation(r, l)
	},
	{
		coll: 'pmr_equipment', table: 'pmr_data', ts: ['created_at'], audit: true,
		fill: (r, d, ctx) => imp.fillEquipment(r, d, ctx.zoneIds),
		afterCreate: (app, rec, d) => imp.keepCreated(app, 'pmr_equipment', rec.id, d.created_at)
	},
	{
		coll: 'bus_orders', table: 'otto_commandes', ts: ['created_at', 'sent_at'],
		fill: (r, o, ctx) => imp.fillBusOrder(r, o, imp.busStatus(o, ctx.today), ctx.companies, ctx.drivers, ctx.users),
		afterCreate: (app, rec, o, ctx) => {
			imp.keepCreated(app, 'bus_orders', rec.id, o.created_at);
			imp.busOrderEvents(app, rec, o, rec.getString('status'), ctx.users);
		},
		afterUpdate: (app, rec, o, ctx, before) => {
			if (before.status !== rec.getString('status')) imp.legacyEvent(app, 'bus', rec.id, before.status, rec.getString('status'), imp.toDate(new Date().toISOString()), '');
		}
	},
	{
		// Pas de legacy_id sur taxi_orders : clé = date de création BACO (rétablie à l'import, à la milliseconde).
		coll: 'taxi_orders', table: 'taxi_commands', ts: ['created_at'], keyLabel: 'created (date de création BACO)',
		key: (t) => imp.toDate(t.created_at),
		index: (app) => {
			const map = {};
			for (const r of app.findAllRecords('taxi_orders')) map[r.getString('created')] = r;
			return map;
		},
		fill: (r, t, ctx) => imp.fillTaxiOrder(r, t, ctx.taxiByName, ctx.usersByName),
		afterCreate: (app, rec, t, ctx) => {
			imp.keepCreated(app, 'taxi_orders', rec.id, t.created_at);
			const author = ctx.usersByName[(t.redacteur || '').trim().toLowerCase()];
			imp.legacyEvent(app, 'taxi', rec.id, '', rec.getString('status'), imp.toDate(t.created_at), author ? author.id : '');
		},
		afterUpdate: (app, rec, t, ctx, before) => {
			if (before.status !== rec.getString('status')) imp.legacyEvent(app, 'taxi', rec.id, before.status, rec.getString('status'), imp.toDate(new Date().toISOString()), '');
		}
	},
	{
		coll: 'b201_reports', table: 'b201_reports', ts: ['created_at'], keyLabel: 'day',
		key: (b) => String(b.report_date).slice(0, 10),
		index: (app) => {
			const map = {};
			for (const r of app.findAllRecords('b201_reports')) map[r.getString('day')] = r;
			return map;
		},
		onCreate: (r) => {
			r.set('notes', {});
			r.set('manual', []);
		},
		fill: (r, b, ctx) => imp.fillB201(r, b, ctx.userIds),
		afterCreate: (app, rec, b) => imp.keepCreated(app, 'b201_reports', rec.id, b.created_at)
	},
	{ coll: 'pmr_assists', table: 'movement_interventions', ts: ['created_at'], custom: 'assists', keyLabel: 'legacy_id (intervention)' },
	{
		coll: 'ops_log', table: 'main_courante', ts: ['created_at', 'updated_at'], audit: true,
		prepare: (m, ctx) => (imp.opsLogValid(m, ctx.districtOf) ? '' : 'auteur inconnu ou message vide'),
		onCreate: (r) => {
			r.set('category', 'info');
			r.set('status', 'active');
		},
		fill: (r, m, ctx, app) => imp.fillOpsLog(app, r, m, ctx.districtOf),
		afterCreate: (app, rec, m) => imp.keepCreated(app, 'ops_log', rec.id, m.created_at)
	},
	{ coll: 'ops_log_reads', table: 'log_reactions', ts: ['created_at'], custom: 'reads', keyLabel: 'entrée + agent' },
	{
		coll: 'level_crossings', table: 'pn_data', ts: [],
		prepare: (p) => (imp.pnKey(p) ? '' : 'PN illisible (ligne ou numéro)'),
		unique: (app, p) => {
			const k = imp.pnKey(p).split('|');
			const found = app.findRecordsByFilter('level_crossings', 'line = {:l} && number = {:n}', '', 1, 0, { l: k[0], n: k[1] });
			return found && found.length ? found[0] : null;
		},
		onCreate: (r) => r.set('active', true),
		fill: (r, p) => imp.fillLevelCrossing(r, p)
	},
	{ coll: 'audit_log', table: 'audit_logs', ts: ['timestamp'], custom: 'audit', keyLabel: 'date + table + fiche + action' },
	{
		coll: 'directory_contacts', table: 'contacts_repertoire', ts: [], audit: true,
		fill: (r, c) => {
			r.set('legacy_id', Number(c.id) || 0);
			r.set('name', norm(c.nom) || '(sans nom)');
			r.set('phone', norm(c.tel));
			r.set('email', norm(c.email));
			r.set('category', norm(c.categorie_principale) || 'Autre');
			r.set('zone', norm(c.zone));
			r.set('group', norm(c.groupe));
		}
	},
	{
		coll: 'spi_points', table: 'spi_data', ts: [],
		fill: (r, s) => {
			r.set('legacy_id', Number(s.id) || 0);
			r.set('line', norm(s.ligne_nom) || '?');
			r.set('place', norm(s.lieu));
			r.set('zone', norm(s.zone));
			r.set('address', norm(s.adresse));
			r.set('notes', norm(s.remarques));
		}
	},
	{
		coll: 'ptcar', table: 'ptcar_abbreviations', ts: ['created_at'],
		unique: (app, p) => {
			const found = app.findRecordsByFilter('ptcar', 'abbr = {:a}', '', 1, 0, { a: norm(p.abbr) });
			return found && found.length ? found[0] : null;
		},
		fill: (r, p) => {
			r.set('legacy_id', Number(p.id) || 0);
			r.set('abbr', norm(p.abbr));
			r.set('name_fr', norm(p.ptcar_fr));
			r.set('name_nl', norm(p.ptcar_nl));
		}
	},
	{ coll: 'ebp_views', table: 'ebp', ts: [], custom: 'ebp', keyLabel: 'contenu (ligne, PtCar, abréviation, vue)' },
	{
		coll: 'documents', table: 'document_metadata', ts: ['created_at'], audit: true, keyLabel: 'legacy_id (nom du fichier)',
		key: (d) => norm(d.file_name),
		prepare: (d) => (norm(d.file_name) ? '' : 'nom de fichier vide'),
		fill: (r, d) => {
			const fn = norm(d.file_name);
			r.set('legacy_id', fn);
			r.set('name', fn.replace(/\.[^.]+$/, ''));
			r.set('category', norm(d.categorie));
		},
		afterCreate: (app, rec, d, ctx) => {
			const path = `${ctx.dir}/storage/documents/${norm(d.file_name)}`;
			if (ctx.dryRun) return 'fichier non joint (essai à blanc)';
			if (!imp.exists(path)) return 'fichier absent de la sauvegarde';
			rec.set('file', $filesystem.fileFromPath(path));
			app.save(rec);
			return '';
		}
	},
	{
		coll: 'procedures', table: 'procedures', ts: ['created_at', 'updated_at'], audit: true,
		key: (p) => norm(p.id),
		// Une pièce jointe ajoutée ou retirée dans BACO (liaisons_contenu) ne touche pas la ligne de la procédure.
		touched: (p, o) => {
			const ids = (links) => (links || []).filter((l) => norm(l.source_content_type) === 'procedure' && norm(l.source_content_id) === norm(p.id)).map((l) => norm(l.target_content_id)).sort().join('|');
			const now = ids(loadRows(o.dir, 'liaisons_contenu'));
			if (o.base) return now !== ids(loadRows(o.base, 'liaisons_contenu')) ? 'pièces jointes modifiées dans BACO' : '';
			return (loadRows(o.dir, 'liaisons_contenu') || []).some((l) => norm(l.source_content_id) === norm(p.id) && ms(l.created_at) > o.sinceMs) ? 'pièce jointe ajoutée dans BACO' : '';
		},
		fill: (r, p, ctx) => {
			r.set('legacy_id', norm(p.id));
			r.set('title', norm(p.titre) || '(sans titre)');
			r.set('category', norm(p.categorie));
			r.set('content', norm(p.contenu));
			r.set('attachments', procedureAttachments(ctx, norm(p.id)));
		},
		// Le versioning est un hook de requête (referentiels.pb.js) : la version précédente est archivée ici.
		afterUpdate: (app, rec, p, ctx, before) => {
			if (before.title === rec.getString('title') && before.category === rec.getString('category') && before.content === rec.getString('content')) return;
			const v = new Record(app.findCollectionByNameOrId('procedure_versions'));
			v.set('procedure', rec.id);
			v.set('title', before.title);
			v.set('category', before.category);
			v.set('content', before.content);
			app.save(v);
		}
	}
];

// Pièces jointes d'une procédure : liaisons BACO procédure → document, résolues par nom de fichier.
function procedureAttachments(ctx, procId) {
	const out = [];
	for (const l of ctx.links || []) {
		if (norm(l.source_content_type) !== 'procedure' || norm(l.target_content_type) !== 'document') continue;
		if (norm(l.source_content_id) !== procId) continue;
		const doc = ctx.documents[norm(l.target_content_id)];
		if (doc && out.indexOf(doc) === -1) out.push(doc);
	}
	return out;
}

// --- Sélection des lignes du delta ---

function auditIndex(dir, sinceMs) {
	const touched = {};
	for (const t of ['audit_log', 'audit_logs']) {
		for (const a of loadRows(dir, t) || []) {
			if (!(ms(a.timestamp) > sinceMs)) continue;
			const k = `${a.table_name}:${a.record_id}`;
			touched[k] = true;
		}
	}
	return touched;
}

// Raison pour laquelle une ligne fait partie du delta ('' = hors delta) et si elle est nouvelle.
function selectRow(row, key, spec, o) {
	const created = ms(row[spec.ts[0]]);
	const isCreatedAfter = spec.ts[0] === 'created_at' && created > o.sinceMs;
	for (const c of spec.ts) {
		if (ms(row[c]) > o.sinceMs) return { reason: `${c} postérieur`, isNew: isCreatedAfter || (o.base && !o.baseMap.has(key)) };
	}
	if (spec.audit && o.audit[`${spec.table}:${row.id}`]) {
		return { reason: 'journal d\'audit BACO', isNew: isCreatedAfter || (o.base && !o.baseMap.has(key)) };
	}
	const extra = spec.touched ? spec.touched(row, o) : '';
	if (extra) return { reason: extra, isNew: isCreatedAfter || (o.base && !o.baseMap.has(key)) };
	if (o.base) {
		if (!o.baseMap.has(key)) return { reason: 'absente de la sauvegarde de base', isNew: true };
		if (o.baseMap.get(key) !== canon(row)) return { reason: 'différente de la sauvegarde de base', isNew: false };
		return { reason: '', isNew: false };
	}
	// Sans base ni horodatage de création : identifiant séquentiel au-delà du plus grand repris = ligne nouvelle.
	if (spec.ts.indexOf('created_at') === -1 && typeof row.id === 'number' && row.id > o.maxLegacy) {
		return { reason: 'identifiant au-delà du dernier repris', isNew: true };
	}
	return { reason: '', isNew: false };
}

// --- Traitement générique d'une table à clé ---

function processKeyed(app, spec, rows, o, rep) {
	const col = app.findCollectionByNameOrId(spec.coll);
	const keyOf = spec.key || ((row) => String(row.id));
	const index = (spec.index || legacyIndex(spec.coll))(app);
	const hasUpdated = !!col.fields.getByName('updated');
	o.maxLegacy = 0;
	for (const k of Object.keys(index)) if (/^\d+$/.test(k) && +k > o.maxLegacy) o.maxLegacy = +k;

	for (const row of rows) {
		const key = keyOf(row);
		const sel = selectRow(row, key, spec, o);
		if (!sel.reason) {
			rep.out_of_delta++;
			continue;
		}
		const skip = spec.prepare ? spec.prepare(row, o.ctx) : '';
		if (skip) {
			rep.ignored++;
			rep.items.push({ action: 'ignored', key: key, reason: skip });
			continue;
		}
		// Champs repris de BACO = ceux posés par la correspondance ; les valeurs initiales propres à CSM (onCreate :
		// catégorie, statut…) ne sont posées qu'à la création et jamais comparées.
		const fresh = capture(col);
		spec.fill(fresh, row, o.ctx, app);
		const mapped = fresh.fields.slice();
		const existing = index[key] || null;

		if (!existing) {
			if (!sel.isNew) {
				rep.conflicts++;
				rep.items.push({ action: 'conflict', key: key, reason: `${sel.reason} mais absente de CSM (supprimée dans CSM ou écartée à l'import) : non recréée` });
				continue;
			}
			const taken = spec.unique ? spec.unique(app, row) : null;
			if (taken) {
				rep.conflicts++;
				rep.items.push({ action: 'conflict', key: key, id: taken.id, reason: 'clé unique déjà prise par une fiche créée dans CSM' });
				continue;
			}
			if (spec.onCreate) spec.onCreate(fresh.rec);
			app.save(fresh.rec);
			const note = spec.afterCreate ? spec.afterCreate(app, fresh.rec, row, o.ctx) : '';
			index[key] = fresh.rec;
			o.remember(spec.coll, fresh.rec, fresh.fields);
			rep.created++;
			rep.items.push({ action: 'created', key: key, id: fresh.rec.id, reason: sel.reason, note: note || undefined });
			continue;
		}

		const fields = mapped.filter((f) => f !== 'legacy_id');
		const changed = diffFields({ rec: fresh.rec, fields: fields }, existing);
		if (!changed.length) {
			rep.identical++;
			continue;
		}
		const unchanged = unchangedInCsm(app, spec, existing, fields, row, key, o, hasUpdated);
		if (!unchanged.ok) {
			rep.conflicts++;
			rep.items.push({ action: 'conflict', key: key, id: existing.id, reason: `${sel.reason} ; fiche modifiée dans CSM depuis l'import`, fields: changed });
			continue;
		}
		const prev = { status: existing.getString('status'), title: existing.getString('title'), category: existing.getString('category'), content: existing.getString('content') };
		for (const f of changed) existing.set(f, fresh.rec.get(f));
		app.save(existing);
		if (spec.afterUpdate) spec.afterUpdate(app, existing, row, o.ctx, prev);
		o.remember(spec.coll, existing, fields);
		rep.updated++;
		rep.items.push({ action: 'updated', key: key, id: existing.id, reason: sel.reason, fields: changed, note: unchanged.how });
	}
}

// La fiche CSM a-t-elle gardé, pour les champs repris de BACO, la valeur venue de BACO ?
function unchangedInCsm(app, spec, rec, fields, row, key, o, hasUpdated) {
	if (hasUpdated && rec.getString('updated') <= o.importedAtPb) return { ok: true, how: 'non modifiée dans CSM depuis l\'import' };
	const reg = o.registry.writes[`${spec.coll}:${rec.id}`];
	if (reg && reg === fingerprint(rec, fields)) return { ok: true, how: 'inchangée depuis l\'import différentiel précédent' };
	if (o.base && o.baseRows.has(key)) {
		const b = capture(rec.collection());
		spec.fill(b, o.baseRows.get(key), o.ctx, app);
		if (fingerprint(b.rec, fields) === fingerprint(rec, fields)) {
			return { ok: true, how: hasUpdated ? 'champs repris de BACO non modifiés dans CSM (autres champs modifiés)' : 'champs repris de BACO inchangés dans CSM (comparaison avec la base)' };
		}
	}
	return { ok: false };
}

// --- Tables particulières ---

// Interventions PMR (saisie de la journée, abandonnée le 3 mai 2026) : une intervention donne une ou plusieurs prestations.
function processAssists(app, spec, rows, o, rep) {
	const moves = {};
	for (const m of loadRows(o.dir, 'daily_movements') || []) moves[m.id] = String(m.date).slice(0, 10);
	const existing = {};
	for (const r of app.findAllRecords('pmr_assists')) {
		const k = r.getString('legacy_id');
		if (k) (existing[k] = existing[k] || []).push(r);
	}
	const col = app.findCollectionByNameOrId('pmr_assists');
	for (const i of rows) {
		const key = String(i.id);
		const sel = selectRow(i, key, spec, o);
		if (!sel.reason) {
			rep.out_of_delta++;
			continue;
		}
		const day = moves[i.movement_id];
		if (!day) {
			rep.ignored++;
			rep.items.push({ action: 'ignored', key: key, reason: 'journée inconnue' });
			continue;
		}
		const segs = imp.assistSegments(i, day).list;
		const have = existing[key] || [];
		if (!have.length) {
			if (!sel.isNew) {
				rep.conflicts++;
				rep.items.push({ action: 'conflict', key: key, reason: `${sel.reason} mais absente de CSM : non recréée` });
				continue;
			}
			const ids = segs.map((s) => imp.saveAssist(app, i, s, o.ctx.zoneIds).id);
			rep.created += ids.length;
			rep.items.push({ action: 'created', key: key, id: ids.join(','), reason: sel.reason });
			continue;
		}
		// Comparaison globale : mêmes prestations (ordre indifférent) → rien ; sinon à reprendre à la main.
		const fp = (list) => list.map((x) => x).sort().join('|');
		const want = fp(segs.map((s) => {
			const c = capture(col);
			imp.fillAssist(c, i, s, o.ctx.zoneIds);
			return fingerprint(c.rec, c.fields.filter((f) => f !== 'status'));
		}));
		const got = fp(have.map((r) => {
			const c = capture(col);
			imp.fillAssist(c, i, segs[0], o.ctx.zoneIds);
			return fingerprint(r, c.fields.filter((f) => f !== 'status'));
		}));
		if (want === got) rep.identical++;
		else {
			rep.conflicts++;
			rep.items.push({ action: 'conflict', key: key, id: have.map((r) => r.id).join(','), reason: `${sel.reason} ; intervention BACO modifiée : prestations à reprendre à la main` });
		}
	}
}

// Réactions BACO → « Lu » (une par agent et par entrée), création seulement.
function processReads(app, spec, rows, o, rep) {
	const entries = byLegacy(app, 'ops_log');
	const seen = {};
	for (const r of app.findAllRecords('ops_log_reads')) seen[`${r.getString('entry')}:${r.getString('user')}`] = true;
	const col = app.findCollectionByNameOrId('ops_log_reads');
	for (const x of rows) {
		const sel = selectRow(x, String(x.id), spec, o);
		if (!sel.reason) {
			rep.out_of_delta++;
			continue;
		}
		const entry = entries[String(x.log_id)];
		const key = `${x.log_id}:${x.user_id}`;
		if (!entry || o.ctx.districtOf[x.user_id] === undefined) {
			rep.ignored++;
			rep.items.push({ action: 'ignored', key: key, reason: 'entrée ou agent absent de CSM' });
			continue;
		}
		if (seen[`${entry.id}:${x.user_id}`]) {
			rep.identical++;
			continue;
		}
		const r = new Record(col);
		r.set('entry', entry.id);
		r.set('user', x.user_id);
		app.save(r);
		imp.keepCreated(app, 'ops_log_reads', r.id, x.created_at);
		seen[`${entry.id}:${x.user_id}`] = true;
		rep.created++;
		rep.items.push({ action: 'created', key: key, id: r.id, reason: sel.reason });
	}
}

// Journal d'audit BACO (audit_logs) : ajout seulement, clé = date + table + fiche + action.
function processAudit(app, spec, rows, o, rep) {
	const col = app.findCollectionByNameOrId('audit_log');
	const keyOf = (r) => `${r.getString('at')}|${r.getString('collection')}|${r.getString('record')}|${r.getString('action')}`;
	const seen = {};
	for (const r of app.findRecordsByFilter('audit_log', 'legacy = true', '', 0, 0)) seen[keyOf(r)] = true;
	for (const a of rows) {
		const sel = selectRow(a, String(a.id), spec, o);
		if (!sel.reason) {
			rep.out_of_delta++;
			continue;
		}
		const r = new Record(col);
		imp.fillAudit(r, a);
		const key = keyOf(r);
		if (seen[key]) {
			rep.identical++;
			continue;
		}
		app.save(r);
		seen[key] = true;
		rep.created++;
		rep.items.push({ action: 'created', key: String(a.id), id: r.id, reason: sel.reason });
	}
}

// Vues EBP : aucune clé dans BACO → clé = contenu. Exige la sauvegarde de base (sinon une ligne corrigée dans CSM serait
// recréée dans sa version BACO).
function processEbp(app, spec, rows, o, rep) {
	if (!o.base) {
		rep.items.push({ action: 'ignored', key: '*', reason: 'table sans identifiant : --base requis' });
		rep.ignored += rows.length;
		return;
	}
	const ck = (line, ptcar, abbr, view) => [norm(line), norm(ptcar), norm(abbr), norm(view)].join('|');
	const inCsm = {};
	for (const r of app.findAllRecords('ebp_views')) inCsm[ck(r.getString('line'), r.getString('ptcar'), r.getString('abbr'), r.getString('ebp_view'))] = true;
	const col = app.findCollectionByNameOrId('ebp_views');
	for (const e of rows) {
		const key = ck(e.Lignes, e.PtCar, e.Abbr, e.Vue_EBP);
		if (o.baseMap.has(canon(e))) {
			rep.out_of_delta++;
			continue;
		}
		if (inCsm[key]) {
			rep.identical++;
			continue;
		}
		const r = new Record(col);
		r.set('line', norm(e.Lignes));
		r.set('ptcar', norm(e.PtCar));
		r.set('abbr', norm(e.Abbr));
		r.set('ebp_view', norm(e.Vue_EBP));
		app.save(r);
		inCsm[key] = true;
		rep.created++;
		rep.items.push({ action: 'created', key: key, id: r.id, reason: 'absente de la sauvegarde de base' });
	}
}

// Comptes BACO : création seulement, en `disabled` (rôle rendu à la réactivation : paco), à valider par un admin.
// Les comptes existants ne sont jamais modifiés (rôles v2, mots de passe, profils gérés dans CSM).
function processUsers(app, o, report) {
	const rep = tableReport('users', 'auth.users + profiles', { ts: ['created_at', 'updated_at'], keyLabel: 'id (UUID Supabase)' });
	report.tables.users = rep;
	const users = imp.exists(`${o.dir}/auth_users.json`) ? imp.readJson(`${o.dir}/auth_users.json`) : [];
	const profiles = {};
	for (const p of loadRows(o.dir, 'profiles') || []) profiles[p.id] = p;
	const hashes = {};
	if (imp.exists(`${o.dir}/auth_password_hashes.json`)) {
		for (const h of imp.readJson(`${o.dir}/auth_password_hashes.json`)) hashes[h.id] = h.encrypted_password;
	}
	const baseIds = {};
	if (o.base && imp.exists(`${o.base}/auth_users.json`)) for (const u of imp.readJson(`${o.base}/auth_users.json`)) baseIds[u.id] = true;
	const col = app.findCollectionByNameOrId('users');
	for (const u of users) {
		const p = profiles[u.id] || {};
		let existing = null;
		try {
			existing = app.findRecordById('users', u.id);
		} catch (_) {}
		const newer = ms(u.created_at) > o.sinceMs || (o.base && !baseIds[u.id]);
		// auth.users.updated_at bouge à chaque connexion : seul le profil compte.
		const touched = ms(p.updated_at) > o.sinceMs;
		if (existing) {
			if (o.registry.writes[`users:${u.id}`]) rep.identical++;
			else if (touched) {
				rep.ignored++;
				rep.items.push({ action: 'ignored', key: u.id, id: u.id, reason: 'profil modifié dans BACO : non repris (comptes existants jamais modifiés par l\'import différentiel)' });
			} else rep.out_of_delta++;
			continue;
		}
		if (!newer) {
			if (touched) {
				rep.conflicts++;
				rep.items.push({ action: 'conflict', key: u.id, reason: 'compte absent de CSM (supprimé dans CSM ?) : non recréé' });
			} else rep.out_of_delta++;
			continue;
		}
		const r = new Record(col);
		imp.fillUser(r, u, p);
		const role = r.getString('role');
		r.set('role', 'disabled');
		r.set('disabled_role', role === 'guest' ? 'guest' : 'paco');
		r.setPassword($security.randomString(40));
		if (!o.dryRun) imp.setAvatar(r, o.dir, p);
		app.save(r);
		imp.keepCreated(app, 'users', u.id, u.created_at);
		const hash = imp.setPasswordHash(app, u.id, hashes[u.id]);
		o.remember('users', r, ['name']);
		rep.created++;
		rep.items.push({
			action: 'created',
			key: u.id,
			id: u.id,
			reason: 'compte créé dans BACO après la sauvegarde',
			note: `désactivé, rôle à la réactivation : ${r.getString('disabled_role')} ; ${hash ? 'mot de passe BACO repris' : 'mot de passe à définir (lien par e-mail)'} ; à valider par un admin`
		});
	}
}

// --- Registre des écritures de l'import différentiel (empreintes des champs repris, pour les relances) ---

function loadRegistry(app) {
	try {
		const r = app.findFirstRecordByFilter('app_settings', 'key = {:k}', { k: REGISTRY_KEY });
		const v = JSON.parse(r.getString('value') || '{}');
		return { writes: v.writes || {}, runs: v.runs || [], imported_at: v.imported_at || '' };
	} catch (_) {
		return { writes: {}, runs: [], imported_at: '' };
	}
}

function saveRegistry(app, registry) {
	let r;
	try {
		r = app.findFirstRecordByFilter('app_settings', 'key = {:k}', { k: REGISTRY_KEY });
	} catch (_) {
		r = new Record(app.findCollectionByNameOrId('app_settings'));
		r.set('key', REGISTRY_KEY);
	}
	r.set('value', registry);
	app.save(r);
}

// --- Date de l'import initial : la plus récente création d'une fiche portant une clé BACO dans les collections
// remplies par l'API à l'import (leur `created` n'est pas rétabli ; `legacy_id` n'est pas forgeable par un agent), hors
// fiches créées par l'import différentiel, + 1 minute de marge. Gardée dans le registre au premier import réel.
function detectImportedAt(app, registry) {
	if (registry.imported_at) return registry.imported_at;
	let max = '';
	const colls = ['bus_companies', 'bus_drivers', 'bus_contacts', 'bus_company_lines', 'directory_contacts', 'spi_points', 'ptcar', 'level_crossings'];
	const filters = colls.map((c) => [c, 'legacy_id > 0']).concat([['documents', "legacy_id != ''"], ['procedures', "legacy_id != ''"]]);
	for (const [coll, filter] of filters) {
		for (const r of app.findRecordsByFilter(coll, filter, '-created', 50, 0)) {
			if (registry.writes[`${coll}:${r.id}`]) continue;
			const c = r.getString('created');
			if (c > max) max = c;
		}
	}
	if (!max) throw new Error("--imported-at auto : aucune fiche importée trouvée, préciser la date");
	return new Date(ms(max) + 60000).toISOString();
}

// --- Point d'entrée ---

/**
 * opts : { dir, since, importedAt, base, dryRun, only: [collections] }
 * Rend le rapport (JSON) ; `summary(report)` en donne la version texte, sans donnée personnelle.
 */
function run(app, opts) {
	const o = {
		dir: opts.dir,
		base: opts.base || '',
		dryRun: !!opts.dryRun,
		ctx: null
	};
	let since = opts.since;
	if (!since && o.base && imp.exists(`${o.base}/report.json`)) since = imp.readJson(`${o.base}/report.json`).started_at;
	if (!since || isNaN(ms(since))) throw new Error('--since manquant ou illisible (ou --base sans report.json)');
	o.sinceMs = ms(since);
	o.registry = loadRegistry(app);
	const importedAt = !opts.importedAt || opts.importedAt === 'auto' ? detectImportedAt(app, o.registry) : opts.importedAt;
	if (isNaN(ms(importedAt))) throw new Error('--imported-at illisible');
	if (o.registry.imported_at && ms(o.registry.imported_at) !== ms(importedAt)) {
		throw new Error(`--imported-at différent de celui des imports différentiels précédents (${o.registry.imported_at})`);
	}
	o.registry.imported_at = new Date(ms(importedAt)).toISOString();
	o.importedAtPb = imp.toDate(importedAt);
	o.audit = auditIndex(o.dir, o.sinceMs);
	o.remember = (coll, rec, fields) => {
		o.registry.writes[`${coll}:${rec.id}`] = fingerprint(rec, fields.filter((f) => f !== 'legacy_id'));
	};

	const report = {
		mode: o.dryRun ? 'essai à blanc (rien n\'est écrit)' : 'import réel',
		dry_run: o.dryRun,
		started_at: new Date().toISOString(),
		backup: o.dir,
		backup_started_at: imp.exists(`${o.dir}/report.json`) ? imp.readJson(`${o.dir}/report.json`).started_at : '',
		base: o.base,
		since: new Date(o.sinceMs).toISOString(),
		imported_at: new Date(ms(importedAt)).toISOString(),
		tables: {},
		not_migrated: {},
		errors: [],
		notes: [
			'Jamais de suppression : une ligne supprimée dans BACO reste dans CSM (deleted_in_baco), une fiche supprimée dans CSM n\'est pas recréée.',
			'Comptes : seuls les nouveaux comptes sont créés, désactivés, à valider par un admin ; aucun compte existant, rôle ou mot de passe n\'est modifié.'
		]
	};
	if (!o.base) report.notes.push('Sans --base : les modifications des tables sans horodatage ne sont vues que par le journal d\'audit BACO ; vues EBP non traitées.');

	const today = new Date().toISOString().slice(0, 10);
	const only = opts.only && opts.only.length ? opts.only : null;
	const wanted = (coll) => !only || only.indexOf(coll) !== -1;

	const runTable = (tx, fn) => {
		o.ctx = buildContext(tx);
		o.ctx.today = today;
		o.ctx.dir = o.dir;
		o.ctx.dryRun = o.dryRun;
		o.ctx.links = loadRows(o.dir, 'liaisons_contenu') || [];
		o.ctx.documents = {};
		for (const d of tx.findAllRecords('documents')) if (d.getString('legacy_id')) o.ctx.documents[d.getString('legacy_id')] = d.id;
		fn(tx);
		if (!o.dryRun) saveRegistry(tx, o.registry);
	};

	const steps = [];
	if (wanted('users')) steps.push(['users', (tx) => processUsers(tx, o, report)]);
	for (const spec of SPECS) {
		if (!wanted(spec.coll)) continue;
		steps.push([spec.coll, (tx) => {
			const rows = loadRows(o.dir, spec.table);
			const rep = tableReport(spec.coll, spec.table, spec);
			report.tables[spec.coll] = rep;
			if (!rows) {
				rep.items.push({ action: 'ignored', key: '*', reason: `${spec.table}.json absent de la sauvegarde` });
				return;
			}
			const keyOf = spec.custom === 'ebp' ? canon : spec.key || ((row) => String(row.id));
			o.baseMap = new Map();
			o.baseRows = new Map();
			if (o.base) {
				const baseRows = loadRows(o.base, spec.table) || [];
				for (const b of baseRows) {
					const k = spec.custom === 'ebp' ? canon(b) : keyOf(b);
					o.baseMap.set(k, canon(b));
					o.baseRows.set(k, b);
				}
				const now = new Set(rows.map((r) => (spec.custom === 'ebp' ? canon(r) : keyOf(r))));
				for (const k of o.baseMap.keys()) if (!now.has(k)) rep.deleted_in_baco++;
			}
			if (spec.custom === 'assists') processAssists(tx, spec, rows, o, rep);
			else if (spec.custom === 'reads') processReads(tx, spec, rows, o, rep);
			else if (spec.custom === 'audit') processAudit(tx, spec, rows, o, rep);
			else if (spec.custom === 'ebp') processEbp(tx, spec, rows, o, rep);
			else processKeyed(tx, spec, rows, o, rep);
		}]);
	}

	if (o.dryRun) {
		// Essai à blanc : tout dans une transaction annulée à la fin (les validations et contraintes jouent quand même).
		const ROLLBACK = 'csm-import-delta: essai à blanc, annulation';
		try {
			app.runInTransaction((tx) => {
				for (const [name, fn] of steps) {
					try {
						runTable(tx, fn);
					} catch (e) {
						report.errors.push(`${name} : ${e}`);
					}
				}
				throw new Error(ROLLBACK);
			});
		} catch (e) {
			if (String(e).indexOf(ROLLBACK) === -1) report.errors.push(String(e));
		}
	} else {
		for (const [name, fn] of steps) {
			try {
				app.runInTransaction((tx) => runTable(tx, fn));
			} catch (e) {
				// Table annulée en entier ; on s'arrête (les tables suivantes peuvent en dépendre).
				report.errors.push(`${name} : ${e} (table annulée, import arrêté)`);
				if (report.tables[name]) report.tables[name].rolled_back = true;
				break;
			}
		}
		if (!report.errors.length) {
			o.registry.runs.push({ at: report.started_at, since: report.since, backup_started_at: report.backup_started_at, totals: totals(report) });
			app.runInTransaction((tx) => saveRegistry(tx, o.registry));
		}
	}

	// Tables BACO non reprises : lignes nouvelles ou modifiées, pour information.
	for (const t of NOT_MIGRATED) {
		const rows = loadRows(o.dir, t);
		if (!rows) continue;
		let n = 0;
		const baseRows = o.base ? loadRows(o.base, t) || [] : null;
		const baseMap = new Map((baseRows || []).map((b) => [b.id !== undefined ? String(b.id) : canon(b), canon(b)]));
		for (const r of rows) {
			const k = r.id !== undefined ? String(r.id) : canon(r);
			const recent = ['created_at', 'updated_at', 'timestamp'].some((c) => ms(r[c]) > o.sinceMs);
			if (recent || (baseRows && baseMap.get(k) !== canon(r))) n++;
		}
		if (n) report.not_migrated[t] = n;
	}
	report.totals = totals(report);
	report.finished_at = new Date().toISOString();
	return report;
}

function totals(report) {
	const t = { created: 0, updated: 0, identical: 0, conflicts: 0, ignored: 0 };
	for (const k of Object.keys(report.tables)) for (const c of Object.keys(t)) t[c] += report.tables[k][c];
	return t;
}

// Résumé texte : compteurs, identifiants et noms de champs seulement (aucune valeur, donc aucune donnée personnelle).
function summary(report) {
	const L = [];
	L.push(`Import différentiel BACO → CSM — ${report.mode}`);
	L.push(`Sauvegarde : ${report.backup} (prise le ${report.backup_started_at || '?'})`);
	L.push(`Depuis (--since) : ${report.since} ; import initial (--imported-at) : ${report.imported_at}${report.base ? ` ; base : ${report.base}` : ''}`);
	L.push('');
	L.push('Table'.padEnd(20) + 'créés  m.à.j.  identiques  conflits  ignorés  hors delta  suppr. BACO');
	for (const k of Object.keys(report.tables)) {
		const t = report.tables[k];
		L.push(
			k.padEnd(20) +
				String(t.created).padStart(5) + String(t.updated).padStart(8) + String(t.identical).padStart(12) +
				String(t.conflicts).padStart(10) + String(t.ignored).padStart(9) + String(t.out_of_delta).padStart(12) +
				String(t.deleted_in_baco).padStart(13) + (t.rolled_back ? '  (annulée)' : '')
		);
	}
	const tot = report.totals || totals(report);
	L.push(`Total : ${tot.created} créés, ${tot.updated} mis à jour, ${tot.identical} identiques, ${tot.conflicts} conflits, ${tot.ignored} ignorés`);
	const lines = [];
	for (const k of Object.keys(report.tables)) {
		for (const it of report.tables[k].items) {
			if (it.action === 'created' && k !== 'users') continue;
			const what = { conflict: 'CONFLIT', updated: 'mis à jour', ignored: 'ignoré', created: 'créé' }[it.action];
			lines.push(`  [${k}] ${what} ${it.key}${it.id && it.id !== it.key ? ` → ${it.id}` : ''} : ${it.reason}${it.fields ? ` (champs : ${it.fields.join(', ')})` : ''}${it.note ? ` — ${it.note}` : ''}`);
		}
	}
	if (lines.length) {
		L.push('');
		L.push('Détail (hors créations ordinaires) :');
		L.push(...lines);
	}
	const nm = Object.keys(report.not_migrated);
	if (nm.length) {
		L.push('');
		L.push(`Tables BACO non reprises dans CSM avec des lignes récentes : ${nm.map((t) => `${t} (${report.not_migrated[t]})`).join(', ')}`);
	}
	if (report.errors.length) {
		L.push('');
		L.push('ERREURS :');
		for (const e of report.errors) L.push(`  ${e}`);
	}
	return L.join('\n');
}

module.exports = { run, summary, canon, selectRow, NOT_MIGRATED };
