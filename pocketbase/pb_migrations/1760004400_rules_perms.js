/// <reference path="../pb_data/types.d.ts" />
// Rôles v3, lot L2 (14 oct. 2026, docs/design/CADRAGE-ROLES-V3.md §3.1 et annexe B) : les règles d'accès ne testent plus
// le rôle et les grants / denies, mais la liste calculée `users.perms` (lot L1, écrite par le hook seul) :
//
//   can(P) = ACTIVE && (ADMIN || @request.auth.perms ~ '"P"')        (clé toujours entre guillemets)
//
// Restent écrits en dur : ADMIN (admin, sysop), `screen` (poste partagé, lectures bornées), `connector` (compte de service,
// aucune permission de module : `grants ~ '"dicos:write"'`, droit hors catalogue), `disabled`.
//
// Réécriture EXPLICITE, collection par collection (aucun remplacement de motif sur les anciennes règles). Équivalence
// prouvée par scripts/test-rules.mjs (attentes inchangées) et par la commande `perms-check` (perms ↔ ancien calcul).
// Corrections voulues (annexe B du cadrage, validées) :
//   - audit_log : lecture ADMIN seul (le droit `audit:read` n'existe plus depuis le 11 oct.) ;
//   - pmr_zones.delete : `pmr:delete` (comme le web : Modérateur et admins), au lieu d'ADMIN seul ;
//   - stations list / view : `timetable:read` (fermé à l'invité, comme l'onglet Gares et l'export) ;
//   - rail_lines.update : `ptcar:update` seul (comme stations ; la lecture reste `timetable:read`).
// Effet de bord assumé : le compte de service `connector` ne lit plus pmr_zones, spi_points, changelog, train_services,
// train_relations, rail_lines, stations (jamais utilisés par l'ingestion ; seuls quinyx_* gardent sa branche).
//
// Retour arrière : `down` remet les règles v2 exactes (copie dans pb_hooks/lib/rules-v2.js, prise avant cette migration).

migrate(
	(app) => {
		const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
		const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
		const NS = '@request.auth.role != "screen"';
		const SCREEN = '@request.auth.role = "screen"';
		const has = (p) => `@request.auth.perms ~ '"${p}"'`;
		const can = (p) => `(${ACTIVE} && (${ADMIN} || ${has(p)}))`;
		// Compte de service (extension DICOS) : droit hors catalogue, inchangé.
		const DICOS = `(${ACTIVE} && @request.auth.grants ~ '"dicos:write"')`;
		const ADMIN_ONLY = `(${ACTIVE} && ${ADMIN})`;
		// Modération du Journal (ex-« admin, sysop, moderator ») : `journal:moderate`.
		const MOD = `(${ADMIN} || ${has('journal:moderate')})`;

		// Module standard : lecture / création / modification / suppression, suffixes de champs gardés à l'identique.
		const std = (m, sfx = {}) => ({
			listRule: `${can(`${m}:read`)} && ${NS}`,
			viewRule: `${can(`${m}:read`)} && ${NS}`,
			createRule: `(${can(`${m}:write`)}${sfx.create || ''}) && ${NS}`,
			updateRule: `(${can(`${m}:update`)}${sfx.update || ''}) && ${NS}`,
			deleteRule: `${can(`${m}:delete`)} && ${NS}`
		});
		// Fournisseurs (bus / taxi) : `legacy_id` refusé hors de la parenthèse, comme en v2.
		const supplier = (m) => ({
			listRule: `${can(`${m}:read`)} && ${NS}`,
			viewRule: `${can(`${m}:read`)} && ${NS}`,
			createRule: `(${can(`${m}:write`)} && ${NS}) && @request.body.legacy_id:isset = false`,
			updateRule: `(${can(`${m}:update`)} && ${NS}) && @request.body.legacy_id:isset = false`,
			deleteRule: `${can(`${m}:delete`)} && ${NS}`
		});
		const byKind = (field, a) =>
			`((${field} = "bus" && ${can(`otto:${a}`)}) || (${field} = "taxi" && ${can(`generate_taxi:${a}`)}))`;

		const ORDER_FORGED =
			' && @request.body.number:isset = false && @request.body.sent_at:isset = false && @request.body.sent_by:isset = false' +
			' && @request.body.confirmed_at:isset = false && @request.body.confirmed_by:isset = false && @request.body.started_at:isset = false' +
			' && @request.body.started_by:isset = false && @request.body.ended_at:isset = false && @request.body.ended_by:isset = false' +
			' && @request.body.cancelled_at:isset = false && @request.body.cancelled_by:isset = false && @request.body.status_before_cancel:isset = false';
		const BUS_FORGED = `${ORDER_FORGED} && @request.body.sent_by_name:isset = false && @request.body.validated_by:isset = false && @request.body.legacy_id:isset = false`;
		const SEEN = ' && @request.body.last_seen_sync:isset = false && @request.body.last_seen_by:isset = false';
		const EQUIPMENT_FULL = [
			'station',
			'platform',
			'zone',
			'assistance',
			'ramp_type',
			'ramp_id',
			'padlock',
			'valid_until',
			'ramp_note',
			'station_restrictions',
			'station_info',
			'legacy_id'
		]
			.map((f) => `@request.body.${f}:isset = false`)
			.join(' && ');
		const LOG_FORGED =
			' && @request.body.mentions:isset = false && @request.body.edited_at:isset = false && @request.body.legacy_id:isset = false' +
			' && @request.body.notified:isset = false';
		const quinyxRead = `(${can('quinyx:read')} || (${ACTIVE} && @request.auth.role = "connector")) && ${NS}`;
		const readOnly = (p) => ({ listRule: `${can(p)} && ${NS}`, viewRule: `${can(p)} && ${NS}` });

		const RULES = {
			alea_marks: {
				listRule: `(${can('deplacements:read')} && ${NS}) || (${SCREEN} && id != "")`,
				viewRule: `(${can('deplacements:read')} && ${NS}) || (${SCREEN} && id != "")`,
				createRule: `(${can('deplacements:write')} && @request.body.marked_by = @request.auth.id) && ${NS}`,
				deleteRule: `${can('deplacements:write')} && ${NS}`
			},
			audit_log: {
				// Correction : le droit `audit:read` (nominatif PMR) a été retiré du catalogue le 11 oct. 2026.
				listRule: `${ADMIN_ONLY} && ${NS}`,
				viewRule: `${ADMIN_ONLY} && ${NS}`
			},
			b201_reports: std('b201', {
				create: ' && @request.body.updated_by = @request.auth.id',
				update: ' && @request.body.day:changed = false && @request.body.updated_by = @request.auth.id'
			}),
			bus_companies: supplier('otto'),
			bus_company_lines: supplier('otto'),
			bus_contacts: supplier('otto'),
			bus_drivers: supplier('otto'),
			bus_orders: {
				listRule: `(${can('otto:read')} && ${NS}) || (${SCREEN} && (status = "brouillon" || status = "termine"))`,
				viewRule: `(${can('otto:read')} && ${NS}) || (${SCREEN} && (status = "brouillon" || status = "termine"))`,
				createRule: `(${can('otto:write')} && @request.body.created_by = @request.auth.id && @request.body.status = "brouillon"${BUS_FORGED}) && ${NS}`,
				updateRule: `(${can('otto:update')} && @request.body.created_by:changed = false${BUS_FORGED}) && ${NS}`,
				deleteRule: `${can('otto:delete')} && ${NS}`
			},
			changelog: {
				listRule: `${can('changelog:read')} && ${NS}`,
				viewRule: `${can('changelog:read')} && ${NS}`,
				createRule: `(${can('changelog:write')} && @request.body.author = @request.auth.id) && ${NS}`,
				updateRule: `(${can('changelog:write')} && @request.body.author:isset = false) && ${NS}`,
				deleteRule: `${can('changelog:write')} && ${NS}`
			},
			connector_tokens: {
				createRule: `(${can('deplacements:write')} && @request.body.user = @request.auth.id && @request.body.last_used:isset = false && @request.body.last_version:isset = false) && ${NS}`
			},
			dicos_syncs: {
				listRule: `((${can('pmr:read')} || ${DICOS}) && ${NS}) || (${SCREEN} && id != "")`,
				viewRule: `((${can('pmr:read')} || ${DICOS}) && ${NS}) || (${SCREEN} && id != "")`
			},
			directory_contacts: std('repertoire', {
				create: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false',
				update: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.legacy_id:changed = false'
			}),
			documents: std('documents', {
				create: ' && @request.body.uploaded_by = @request.auth.id && @request.body.legacy_id:isset = false',
				update: ' && @request.body.uploaded_by:changed = false && @request.body.legacy_id:isset = false'
			}),
			ebp_views: std('ebp', {
				create: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false',
				update: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.legacy_id:changed = false'
			}),
			group_missions: {
				listRule: `(${can('pmr:read')} || ${DICOS}) && ${NS}`,
				viewRule: `(${can('pmr:read')} || ${DICOS}) && ${NS}`
			},
			level_crossings: std('carte_pn', {
				create: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false',
				update: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false'
			}),
			line_stations: {
				createRule: `${can('lignes:write')} && ${NS}`,
				updateRule: `${can('lignes:update')} && ${NS}`,
				deleteRule: `${can('lignes:delete')} && ${NS}`
			},
			mission_trains: {
				listRule: `(${can('deplacements:read')} && ${NS}) || (${SCREEN} && id != "")`,
				viewRule: `(${can('deplacements:read')} && ${NS}) || (${SCREEN} && id != "")`
			},
			ops_log: {
				listRule: `((${can('journal:read')} && (status = "active" || author = @request.auth.id || ${MOD})) && ${NS}) || (${SCREEN} && status = "active" && (urgent = true || pinned_until != "" || source = "irail"))`,
				viewRule: `((${can('journal:read')} && (status = "active" || author = @request.auth.id || ${MOD})) && ${NS}) || (${SCREEN} && status = "active" && (urgent = true || pinned_until != "" || source = "irail"))`,
				createRule: `(${can('journal:write')} && @request.body.author = @request.auth.id${LOG_FORGED} && (@request.body.status:isset = false || @request.body.status = "active") && @request.body.retired_reason:isset = false && @request.body.source:isset = false && @request.body.external_id:isset = false) && ${NS}`,
				updateRule: `(${can('journal:update')} && (author = @request.auth.id || ${MOD}) && @request.body.author:changed = false${LOG_FORGED} && @request.body.source:isset = false && @request.body.external_id:isset = false && @request.body.reply_to:isset = false) && ${NS}`,
				deleteRule: `${can('journal:delete')} && ${NS}`
			},
			ops_log_events: {
				listRule: `(${can('journal:read')} && (entry.status = "active" || entry.author = @request.auth.id || ${MOD})) && ${NS}`,
				viewRule: `(${can('journal:read')} && (entry.status = "active" || entry.author = @request.auth.id || ${MOD})) && ${NS}`
			},
			ops_log_reads: {
				listRule: `(${can('journal:read')} && (entry.status = "active" || entry.author = @request.auth.id || ${MOD})) && ${NS}`,
				viewRule: `(${can('journal:read')} && (entry.status = "active" || entry.author = @request.auth.id || ${MOD})) && ${NS}`,
				createRule: `(${can('journal:read')} && @request.body.user = @request.auth.id && @request.body.entry.status = "active") && ${NS}`
			},
			order_events: {
				listRule: `${byKind('kind', 'read')} && ${NS}`,
				viewRule: `${byKind('kind', 'read')} && ${NS}`
			},
			order_pdf_backups: readOnly('archives:read'),
			order_pdfs: {
				...readOnly('archives:read'),
				deleteRule: `${can('archives:delete')} && ${NS}`
			},
			order_templates: {
				listRule: `${byKind('kind', 'read')} && ${NS}`,
				viewRule: `${byKind('kind', 'read')} && ${NS}`,
				createRule: `(${byKind('@request.body.kind', 'write')} && @request.body.created_by = @request.auth.id) && ${NS}`,
				updateRule: `(${byKind('kind', 'update')} && @request.body.kind:changed = false && @request.body.created_by:changed = false) && ${NS}`,
				deleteRule: `${byKind('kind', 'delete')} && ${NS}`
			},
			pmr_assist_legacy: readOnly('pmr:read'),
			pmr_assists: {
				listRule: `((${can('deplacements:read')} || ${DICOS}) && ${NS}) || (${SCREEN} && anonymized = false)`,
				viewRule: `((${can('deplacements:read')} || ${DICOS}) && ${NS}) || (${SCREEN} && anonymized = false)`,
				createRule:
					`(((${can('deplacements:write')} && @request.body.created_by = @request.auth.id && @request.body.updated_by = @request.auth.id && @request.body.status = "prevue" && @request.body.anonymized:isset = false && @request.body.legacy_id:isset = false && (@request.body.client:isset = false || @request.body.client = "" || ${can('pmr:read')}))` +
					` || (${DICOS} && @request.body.source = "dicos" && @request.body.dicos_id != "" && @request.body.created_by = @request.auth.id && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.anonymized:isset = false)) && ${NS})${SEEN}`,
				updateRule:
					`(((${can('deplacements:update')} && @request.body.created_by:changed = false && @request.body.updated_by = @request.auth.id && @request.body.anonymized:isset = false && @request.body.legacy_id:isset = false && (@request.body.client:isset = false || ${can('pmr:read')}))` +
					` || (${DICOS} && source = "dicos" && @request.body.updated_by = @request.auth.id && @request.body.created_by:changed = false && @request.body.dicos_id:changed = false && @request.body.legacy_id:isset = false && @request.body.anonymized:isset = false)) && ${NS})${SEEN}`,
				deleteRule: `${can('deplacements:delete')} && ${NS}`
			},
			pmr_clients: std('pmr', {
				create: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.last_activity:isset = false && @request.body.created_by = @request.auth.id',
				update: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.last_activity:isset = false && @request.body.created_by:changed = false'
			}),
			pmr_equipment: {
				...readOnly('pmr:read'),
				createRule: `(${can('pmr:write')} && @request.body.updated_by = @request.auth.id) && ${NS}`,
				// Matériel complet (gare, quai, zone, rampe…) : `pmr_equipment:manage` (ex-« admin, sysop, paco, moderator ») ;
				// les autres agents `pmr:update` ne changent que l'état, la précision, la réparation.
				updateRule: `(${can('pmr:update')} && @request.body.updated_by = @request.auth.id && (${can('pmr_equipment:manage')} || (${EQUIPMENT_FULL}))) && ${NS}`,
				deleteRule: `${can('pmr:delete')} && ${NS}`
			},
			pmr_events: {
				listRule: `((kind = "assist" && ${can('deplacements:read')}) || ((kind = "equipment" || kind = "client") && ${can('pmr:read')})) && ${NS}`,
				viewRule: `((kind = "assist" && ${can('deplacements:read')}) || ((kind = "equipment" || kind = "client") && ${can('pmr:read')})) && ${NS}`
			},
			pmr_mission: {
				listRule: `(${can('pmr:read')} || ${DICOS}) && ${NS}`,
				viewRule: `(${can('pmr:read')} || ${DICOS}) && ${NS}`
			},
			pmr_zones: {
				listRule: `${can('pmr_zones:read')} && ${NS}`,
				viewRule: `${can('pmr_zones:read')} && ${NS}`,
				createRule: `${can('pmr:write')} && ${NS}`,
				updateRule: `${can('pmr:update')} && ${NS}`,
				// Correction : `pmr:delete` comme le web (Modérateur et admins par défaut), au lieu d'ADMIN seul.
				deleteRule: `${can('pmr:delete')} && ${NS}`
			},
			procedure_versions: readOnly('documents:read'),
			procedures: std('documents', {
				create: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false',
				update: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.legacy_id:changed = false'
			}),
			ptcar: std('ptcar', {
				create: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false',
				update: ' && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.legacy_id:changed = false'
			}),
			quinyx_agents: { listRule: quinyxRead, viewRule: quinyxRead },
			quinyx_groups: { listRule: quinyxRead, viewRule: quinyxRead },
			quinyx_shifts: { listRule: quinyxRead, viewRule: quinyxRead },
			rail_lines: {
				...readOnly('timetable:read'),
				// Correction : `ptcar:update` seul, comme stations (l'exclusion de l'invité en dur disparaît).
				updateRule: `${can('ptcar:update')} && @request.body.updated_by = @request.auth.id && ${NS}`
			},
			spi_points: {
				listRule: `${can('spi:read')} && ${NS}`,
				viewRule: `${can('spi:read')} && ${NS}`,
				createRule: `(${can('lignes:write')} && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false) && ${NS}`,
				updateRule: `(${can('lignes:update')} && @request.body.updated_by = @request.auth.id && @request.body.legacy_id:isset = false && @request.body.legacy_id:changed = false) && ${NS}`,
				deleteRule: `${can('lignes:delete')} && ${NS}`
			},
			stations: {
				// Correction : lecture `timetable:read` (fermée à l'invité, comme l'onglet Gares et l'export CSV).
				...readOnly('timetable:read'),
				updateRule: `${can('ptcar:update')} && @request.body.updated_by = @request.auth.id && ${NS}`
			},
			taxi_companies: supplier('generate_taxi'),
			taxi_orders: {
				...readOnly('generate_taxi:read'),
				createRule: `(${can('generate_taxi:write')} && @request.body.created_by = @request.auth.id && @request.body.status = "brouillon"${ORDER_FORGED}) && ${NS}`,
				updateRule: `(${can('generate_taxi:update')} && @request.body.created_by:changed = false${ORDER_FORGED}) && ${NS}`,
				deleteRule: `${can('generate_taxi:delete')} && ${NS}`
			},
			train_relations: readOnly('timetable:read'),
			train_schedules: {
				listRule: `(${can('pmr:read')} || ${DICOS}) && ${NS}`,
				viewRule: `(${can('pmr:read')} || ${DICOS}) && ${NS}`
			},
			train_services: readOnly('timetable:read'),
			train_watches: {
				createRule: `(${can('live:read')} && @request.body.user = @request.auth.id && @request.body.last_state:isset = false) && ${NS}`
			}
		};

		for (const name of Object.keys(RULES)) {
			const c = app.findCollectionByNameOrId(name);
			const rules = RULES[name];
			for (const k of Object.keys(rules)) c[k] = rules[k];
			app.save(c);
		}
	},
	(app) => {
		// Règles v2 exactes, relevées dans `_collections` juste avant cette migration.
		const snapshot = require(`${__hooks}/lib/rules-v2.js`);
		for (const name of Object.keys(snapshot)) {
			const c = app.findCollectionByNameOrId(name);
			const rules = snapshot[name];
			for (const k of Object.keys(rules)) c[k] = rules[k];
			app.save(c);
		}
	}
);
