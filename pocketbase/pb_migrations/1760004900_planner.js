/// <reference path="../pb_data/types.d.ts" />
// Planificateur de tâches PMR, lot P0 (15 oct. 2026, docs/design/CADRAGE-PLANIFICATEUR-PMR.md §3-4-7,
// docs/design/REGLES-PLANIFICATEUR-PMR.md). Remplace les classeurs Excel « planificateur de tâches » DSO / DSE.
//
//   - Quinyx étendu aux agents de gare : `quinyx_groups.purpose` (`equipe` = PACO / RCCA comme avant, `gares` = plannings
//     des gares), `quinyx_agents.purpose`, `quinyx_shifts.post` (CPI / SPI / OPI / PA / EXTRA) et `base` (nom FR de la
//     gare de base, déduit de la section). Le connecteur ne peut pas changer `purpose` d'un groupe (admin seul).
//   - Référentiels : `planner_bases` (10 gares de base, matrice de trajets en voiture, couvertures croisées, postes),
//     `bcs_counters` (guichets B-CS : horaires, 3 PMR light / heure), `planner_templates` (tâches techniques récurrentes :
//     laissée VIDE, les modèles des classeurs sont à vérifier avant reprise).
//   - `planner_tasks` : une tâche par bout assisté (IN / OUT) venue de DICOS (dossier en attente ou mission acceptée), ou
//     encodée à la main / tirée d'un modèle ; attribuée à un agent de gare, un guichet B-CS, un taxi ou le chef de bord.
//
// Droits (rôles v3, clés du catalogue) : lecture `planner:read` ; création / modification `planner:write` ; suppression
// `planner:write` pour une tâche manuelle ou de modèle, sinon `planner:manage` ; référentiels : lecture `planner:read`,
// écriture `planner:manage`. Champs DICOS (source, clé, statut DICOS, vérification de gare, dossier, type, nombre, light,
// train, gare, heures, jour d'une tâche DICOS) : écrits par le compte de service (`connector` + `dicos:write`) ou un
// superuser seulement. Auteurs (`created_by`, `updated_by`) posés par le hook `planner.pb.js`.
//
// Retour arrière : collections supprimées, champs Quinyx retirés, règle de `quinyx_groups` rétablie.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const NS = '@request.auth.role != "screen"';
const has = (p) => `@request.auth.perms ~ '"${p}"'`;
const can = (p) => `(${ACTIVE} && (${ADMIN} || ${has(p)}))`;
// Compte de service de l'extension (ingestion DICOS) : rôle dédié + droit hors catalogue.
const DICOS = `(${ACTIVE} && @request.auth.role = "connector" && @request.auth.grants ~ '"dicos:write"')`;
const unset = (...names) => names.map((n) => `@request.body.${n}:isset = false`).join(' && ');

// Règle de 1760004200 (inchangée depuis), à laquelle on ajoute `purpose` aux champs interdits au connecteur.
const Q_ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const Q_ADMIN = `${Q_ACTIVE} && (@request.auth.role = "admin" || @request.auth.role = "sysop")`;
const Q_CONNECTOR = `${Q_ACTIVE} && @request.auth.role = "connector" && @request.auth.grants ~ '"dicos:write"'`;
const groupRule = (fields) => `(${Q_ADMIN}) || ((${Q_CONNECTOR}) && ${unset(...fields)})`;
const GROUP_FIELDS = ['group_id', 'label', 'district', 'enabled'];

const DICOS_FIELDS = ['source_key', 'dicos_status', 'station_ok', 'assist'];
// Champs d'une tâche venue de DICOS que l'agent ne réécrit pas (il attribue, annote, marque « faite »).
const FROZEN_DICOS = ['day', 'kind', 'start', 'end', 'station', 'station_key', 'other_station', 'train', 'pmr_type', 'pax', 'light', 'dossier'];
const MANUAL = '(source = "manuel" || source = "modele")';
const BODY_MANUAL = '(@request.body.source = "manuel" || @request.body.source = "modele")';
const BODY_DICOS = '(@request.body.source = "dicos_pending" || @request.body.source = "dicos_mission")';

// --- Référentiels pré-remplis (REGLES-PLANIFICATEUR-PMR §1.3, §3.1, §5 ; cadrage §4 ; aucune donnée personnelle) ---
// Matrice des trajets en voiture depuis la base (minutes, aller simple). Couvertures croisées dans les deux sens
// (Mons ↔ Tournai, Liège ↔ Verviers, Libramont ↔ Arlon) : le trajet retour absent de la matrice est repris du sens
// connu (Tournai → Mons 50, Verviers → Liège 45). La Louvière-Sud et Ath sont dans la matrice de Mons (Ath aussi
// Tournai) ; Mons n'a aucun trajet vers Charleroi, Charleroi aucun vers la zone FMS. « Faisceau A Charleroi » (20 min,
// voie de service, pas une gare) n'est pas repris.
const BASES = [
	{
		code: 'FMS', name: 'Mons', district: 'DSO', zone: 'FMS', posts: ['PA', 'CPI', 'OPI', 'EXTRA', 'SPI'], covers: ['FTY', 'FBC'],
		travel: [['Saint-Ghislain', 25], ['Jurbise', 30], ['Soignies', 35], ['Cambron-Casteau', 40], ['La Louvière-Sud', 40], ['Braine-le-Comte', 45], ['Leuze', 45], ['Ath', 50], ['Tournai', 50], ['Lessines', 60], ['Tubize', 60], ['Enghien', 60]]
	},
	{
		code: 'FBC', name: 'Braine-le-Comte', district: 'DSO', zone: 'FMS', posts: ['CPI', 'EXTRA'], covers: [],
		travel: [['Soignies', 20], ['Tubize', 30], ['Enghien', 35], ['La Louvière-Sud', 40]]
	},
	{
		code: 'FTY', name: 'Tournai', district: 'DSO', zone: 'FTY', posts: ['CPI', 'EXTRA', 'SPI'], covers: ['FMS'],
		travel: [['Leuze', 35], ['Mouscron', 35], ['Ath', 40], ['Lessines', 40], ['Cambron-Casteau', 50], ['Enghien', 50], ['Mons', 50], ['Jurbise', 60], ['Soignies', 60]]
	},
	{
		code: 'FCR', name: 'Charleroi-Central', district: 'DSO', zone: 'FCR', posts: ['PA', 'CPI', 'OPI', 'EXTRA', 'SPI'], covers: [],
		travel: [['Marchienne-au-Pont', 20], ['Châtelet', 25], ['Tamines', 30], ['Luttre', 30], ['Fleurus', 30], ['Lobbes', 35], ['Walcourt', 40], ['Nivelles', 40], ["Braine-l'Alleud", 45], ['Mariembourg', 50], ['Waterloo', 60]]
	},
	{
		code: 'FNR', name: 'Namur', district: 'DSE', zone: 'FNR', posts: ['PA', 'CPI', 'OPI', 'EXTRA', 'SPI'], covers: [],
		travel: [['Jambes', 25], ['Ciney', 40], ['Andenne', 40], ['Dinant', 50]]
	},
	{
		code: 'LT', name: 'Ottignies', district: 'DSE', zone: 'LT', posts: ['CPI', 'EXTRA', 'SPI'], covers: [],
		travel: [['Louvain-la-Neuve', 25], ['Wavre', 25], ['Rixensart', 25], ['Genval', 25], ['La Hulpe', 30], ['Gembloux', 40]]
	},
	{
		code: 'FL', name: 'Liège-Guillemins', district: 'DSE', zone: 'FL', posts: ['PA', 'CPI', 'OPI', 'EXTRA', 'SPI'], covers: ['GV'],
		travel: [['Ans', 20], ['Liège-Saint-Lambert', 30], ['Flémalle-Haute', 35], ['Waremme', 40], ['Visé', 40], ['Huy', 45], ['Verviers-Central', 45], ['Welkenraedt', 50]]
	},
	{
		code: 'GV', name: 'Verviers-Central', district: 'DSE', zone: 'GV', posts: ['CPI', 'EXTRA', 'SPI'], covers: ['FL'],
		travel: [['Welkenraedt', 35], ['Spa', 35], ['Eupen', 40], ['Liège-Guillemins', 45], ['Rivage', 50], ['Gouvy', 60], ['Vielsalm', 60]]
	},
	{
		code: 'LRB', name: 'Libramont', district: 'DSE', zone: 'LRB', posts: ['CPI', 'EXTRA', 'SPI'], covers: ['LL'],
		travel: [['Marbehan', 40], ['Rochefort-Jemelle', 40], ['Marloie', 45], ['Arlon', 50], ['Virton', 60], ['Beauraing', 60], ['Bertrix', 60]]
	},
	{
		code: 'LL', name: 'Arlon', district: 'DSE', zone: 'LL', posts: ['CPI', 'OPI', 'EXTRA', 'SPI'], covers: ['LRB'],
		travel: [['Marbehan', 35], ['Virton', 45], ['Libramont', 50], ['Bertrix', 60]]
	}
];

// Guichets B-CS (REGLES §5, feuille `B-CS`) : [gare, semaine (N67), week-end (R67), type, base]. Fins d'horaire 14:36…
// 14:46 / 15:36… = artefact de recopie Excel → 14:35 / 15:35. Vide = fermé. Base = gare de base qui couvre le guichet
// (zone de la feuille B-CS ; La Louvière-Sud = Mons, réponse de l'utilisateur du 15 oct. 2026).
const ONLY = 'B-CS ONLY';
const PT = 'B-CS + B-PT';
const BCS = [
	['Ath', '07:15-14:35', '08:15-15:35', ONLY, 'FTY'],
	['Braine-le-Comte', '07:15-14:35', '08:15-15:35', PT, 'FBC'],
	["Braine-l'Alleud", '07:15-14:35', '', ONLY, 'FCR'],
	['Enghien', '07:15-14:35', '', ONLY, 'FTY'],
	['La Louvière-Centre', '07:15-14:35', '', ONLY, 'FCR'],
	['La Louvière-Sud', '07:15-14:35', '08:15-15:35', ONLY, 'FMS'],
	['Mouscron', '07:15-14:35', '', ONLY, 'FTY'],
	['Nivelles', '07:15-14:35', '08:15-15:35', ONLY, 'FCR'],
	['Soignies', '07:15-14:35', '08:15-15:35', ONLY, 'FMS'],
	['Tamines', '07:15-14:35', '', ONLY, 'FCR'],
	['Tournai', '07:15-20:15', '07:15-20:05', PT, 'FTY'],
	['Tubize', '07:15-14:35', '', ONLY, 'FMS'],
	['Andenne', '07:15-10:35', '', ONLY, 'FNR'],
	['Ciney', '07:15-10:35', '', ONLY, 'FNR'],
	['Dinant', '07:15-10:35', '', ONLY, 'FNR'],
	['Gembloux', '07:15-14:35', '08:15-15:35', ONLY, 'LT'],
	['Genval', '07:15-14:35', '', ONLY, 'LT'],
	['Louvain-la-Neuve', '07:15-20:05', '', ONLY, 'LT'],
	['Ottignies', '07:15-20:05', '08:15-15:35', PT, 'LT'],
	['Eupen', '07:15-14:35', '07:15-14:35', ONLY, 'GV'],
	['Huy', '07:15-14:35', '', ONLY, 'FL'],
	['Liège-Saint-Lambert', '07:15-14:35', '', ONLY, 'FL'],
	['Spa', '08:15-11:35', '', ONLY, 'GV'],
	['Welkenraedt', '08:15-11:35', '', ONLY, 'GV'],
	['Visé', '07:15-10:35', '', ONLY, 'FL'],
	['Waremme', '07:15-10:35', '', ONLY, 'FL'],
	['Verviers-Central', '07:15-20:05', '07:15-14:35', PT, 'GV'],
	['Arlon', '07:15-14:35', '08:15-15:35', PT, 'LL'],
	['Libramont', '07:15-14:35', '', PT, 'LRB'],
	['Marloie', '07:15-10:35', '', ONLY, 'LRB']
];

const HOURS = '^$|^([01]\\d|2[0-3]):[0-5]\\d-([01]\\d|2[0-3]):[0-5]\\d$';
const HHMM = '^([01]\\d|2[0-3]):[0-5]\\d$';
const DAY = '^\\d{4}-\\d{2}-\\d{2}$';

migrate(
	(app) => {
		// --- Quinyx étendu aux agents de gare ---
		const groups = app.findCollectionByNameOrId('quinyx_groups');
		groups.fields.add(new SelectField({ name: 'purpose', values: ['equipe', 'gares'], maxSelect: 1 }));
		groups.updateRule = groupRule([...GROUP_FIELDS, 'purpose']);
		app.save(groups);
		app.db().newQuery("UPDATE quinyx_groups SET purpose = 'equipe' WHERE COALESCE(purpose, '') = ''").execute();

		const qAgents = app.findCollectionByNameOrId('quinyx_agents');
		qAgents.fields.add(new SelectField({ name: 'purpose', values: ['equipe', 'gares'], maxSelect: 1 }));
		app.save(qAgents);
		app.db().newQuery("UPDATE quinyx_agents SET purpose = 'equipe' WHERE COALESCE(purpose, '') = ''").execute();

		const qShifts = app.findCollectionByNameOrId('quinyx_shifts');
		qShifts.fields.add(new TextField({ name: 'post', max: 10, pattern: '^$|^(CPI|SPI|OPI|PA|EXTRA)$' }));
		qShifts.fields.add(new TextField({ name: 'base', max: 80 }));
		qShifts.indexes.push('CREATE INDEX idx_quinyx_shifts_day_post ON quinyx_shifts (day, post)');
		app.save(qShifts);

		const users = app.findCollectionByNameOrId('users');
		const assists = app.findCollectionByNameOrId('pmr_assists');

		// --- Référentiels du planificateur ---
		const refRules = {
			listRule: `${can('planner:read')} && ${NS}`,
			viewRule: `${can('planner:read')} && ${NS}`,
			createRule: `${can('planner:manage')} && ${NS}`,
			updateRule: `${can('planner:manage')} && ${NS}`,
			deleteRule: `${can('planner:manage')} && ${NS}`
		};

		const bases = new Collection({
			type: 'base',
			name: 'planner_bases',
			...refRules,
			// Lue aussi par le compte de service : gare de base des prestations Quinyx « gares » (ingestion).
			listRule: `(${can('planner:read')} && ${NS}) || ${DICOS}`,
			viewRule: `(${can('planner:read')} && ${NS}) || ${DICOS}`,
			updateRule: `${can('planner:manage')} && ${NS} && @request.body.code:changed = false`,
			fields: [
				{ name: 'code', type: 'text', required: true, max: 6, pattern: '^[A-Z]{2,6}$' },
				{ name: 'name', type: 'text', required: true, max: 80 },
				{ name: 'district', type: 'select', required: true, values: ['DSO', 'DSE', 'DCE', 'DNO', 'DNE'], maxSelect: 1 },
				{ name: 'zone', type: 'text', max: 6 },
				{ name: 'posts', type: 'json', maxSize: 2000 },
				{ name: 'travel', type: 'json', maxSize: 20000 },
				{ name: 'covers', type: 'json', maxSize: 2000 },
				{ name: 'active', type: 'bool' },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_planner_bases_code ON planner_bases (code)']
		});
		app.save(bases);
		for (const b of BASES) {
			const r = new Record(bases);
			r.set('code', b.code);
			r.set('name', b.name);
			r.set('district', b.district);
			r.set('zone', b.zone);
			r.set('posts', b.posts);
			r.set('travel', b.travel.map(([station, minutes]) => ({ station, minutes })));
			r.set('covers', b.covers);
			r.set('active', true);
			app.save(r);
		}

		const bcs = new Collection({
			type: 'base',
			name: 'bcs_counters',
			...refRules,
			fields: [
				{ name: 'station', type: 'text', required: true, max: 80 },
				{ name: 'weekday_hours', type: 'text', max: 11, pattern: HOURS },
				{ name: 'weekend_hours', type: 'text', max: 11, pattern: HOURS },
				{ name: 'kind', type: 'select', required: true, values: [ONLY, PT], maxSelect: 1 },
				{ name: 'per_hour', type: 'number', onlyInt: true, min: 0, max: 20 },
				{ name: 'light_only', type: 'bool' },
				{ name: 'base', type: 'text', max: 6 },
				{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
			],
			indexes: ['CREATE UNIQUE INDEX idx_bcs_counters_station ON bcs_counters (station)']
		});
		app.save(bcs);
		for (const [station, weekday, weekend, kind, base] of BCS) {
			const r = new Record(bcs);
			r.set('station', station);
			r.set('weekday_hours', weekday);
			r.set('weekend_hours', weekend);
			r.set('kind', kind);
			r.set('per_hour', 3);
			r.set('light_only', true);
			r.set('base', base);
			app.save(r);
		}

		app.save(
			new Collection({
				type: 'base',
				name: 'planner_templates',
				...refRules,
				fields: [
					{ name: 'weekday', type: 'number', required: true, onlyInt: true, min: 1, max: 7 },
					{ name: 'base', type: 'text', required: true, max: 6 },
					{ name: 'post', type: 'text', max: 10 },
					{ name: 'label', type: 'text', required: true, max: 200 },
					{ name: 'kind', type: 'select', required: true, values: ['technique', 'autre'], maxSelect: 1 },
					{ name: 'start', type: 'text', required: true, max: 5, pattern: HHMM },
					{ name: 'end', type: 'text', required: true, max: 5, pattern: HHMM },
					{ name: 'train', type: 'text', max: 20 },
					{ name: 'active', type: 'bool' },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE INDEX idx_planner_templates_day_base ON planner_templates (weekday, base)']
			})
		);

		// --- Tâches ---
		app.save(
			new Collection({
				type: 'base',
				name: 'planner_tasks',
				listRule: `(${can('planner:read')} && ${NS}) || ${DICOS}`,
				viewRule: `(${can('planner:read')} && ${NS}) || ${DICOS}`,
				// Agent : tâche manuelle ou de modèle, sans champ DICOS. Connecteur : tâche DICOS, sans attribution.
				createRule:
					`(${can('planner:write')} && ${NS} && ${BODY_MANUAL} && ${unset(...DICOS_FIELDS)}) || ` +
					`(${DICOS} && ${BODY_DICOS} && ${unset('assignee_kind', 'assignee_agent', 'assignee_label', 'origin', 'note', 'label')})`,
				updateRule:
					`(${can('planner:write')} && ${NS} && ${unset('source', ...DICOS_FIELDS)} && (${MANUAL} || (${unset(...FROZEN_DICOS)}))) || ` +
					`(${DICOS} && source != "manuel" && source != "modele" && ` +
					`(@request.body.source:isset = false || @request.body.source = "dicos_pending" || @request.body.source = "dicos_mission") && ` +
					`${unset('assignee_kind', 'assignee_agent', 'assignee_label', 'origin', 'note', 'label')})`,
				deleteRule: `(${can('planner:write')} && ${NS} && ${MANUAL}) || (${can('planner:manage')} && ${NS})`,
				fields: [
					{ name: 'day', type: 'text', required: true, max: 10, pattern: DAY },
					{ name: 'kind', type: 'select', required: true, values: ['pmr_in', 'pmr_out', 'technique', 'trajet', 'autre'], maxSelect: 1 },
					{ name: 'start', type: 'date', required: true },
					{ name: 'end', type: 'date' },
					{ name: 'station', type: 'text', max: 80 },
					{ name: 'station_key', type: 'text', max: 80 },
					{ name: 'other_station', type: 'text', max: 80 },
					{ name: 'train', type: 'text', max: 20 },
					{ name: 'pmr_type', type: 'select', values: ['NV', 'MR', 'DCO', 'CRF', 'CRE', 'CRP', 'AUTRE'], maxSelect: 1 },
					{ name: 'pax', type: 'number', onlyInt: true, min: 0, max: 50 },
					{ name: 'light', type: 'bool' },
					{ name: 'dossier', type: 'text', max: 15, pattern: '^$|^\\d{4}-\\d{2}-\\d{2}-\\d{4}$' },
					{ name: 'source', type: 'select', required: true, values: ['dicos_pending', 'dicos_mission', 'manuel', 'modele'], maxSelect: 1 },
					{ name: 'source_key', type: 'text', max: 40 },
					{ name: 'dicos_status', type: 'select', values: ['proposal', 'accepted', 'cancelled'], maxSelect: 1 },
					{ name: 'station_ok', type: 'select', values: ['ok', 'pending'], maxSelect: 1 },
					{ name: 'assist', type: 'relation', collectionId: assists.id, maxSelect: 1 },
					{ name: 'assignee_kind', type: 'select', values: ['agent', 'bcs', 'taxi', 'cdb'], maxSelect: 1 },
					{ name: 'assignee_agent', type: 'relation', collectionId: qAgents.id, maxSelect: 1 },
					{ name: 'assignee_label', type: 'text', max: 80 },
					{ name: 'status', type: 'select', required: true, values: ['a_attribuer', 'attribuee', 'faite', 'annulee'], maxSelect: 1 },
					{ name: 'link_key', type: 'text', max: 60 },
					{ name: 'origin', type: 'select', values: ['manuel', 'auto'], maxSelect: 1 },
					{ name: 'label', type: 'text', max: 300 },
					{ name: 'note', type: 'text', max: 1000 },
					{ name: 'created_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: [
					'CREATE INDEX idx_planner_tasks_day ON planner_tasks (day)',
					"CREATE UNIQUE INDEX idx_planner_tasks_source_key ON planner_tasks (source_key) WHERE source_key != ''",
					'CREATE INDEX idx_planner_tasks_agent_day ON planner_tasks (assignee_agent, day)',
					'CREATE INDEX idx_planner_tasks_assist ON planner_tasks (assist)'
				]
			})
		);
	},
	(app) => {
		for (const name of ['planner_tasks', 'planner_templates', 'bcs_counters', 'planner_bases']) {
			try {
				app.delete(app.findCollectionByNameOrId(name));
			} catch (_) {}
		}
		const qShifts = app.findCollectionByNameOrId('quinyx_shifts');
		qShifts.fields.removeByName('post');
		qShifts.fields.removeByName('base');
		qShifts.indexes = qShifts.indexes.filter((i) => !i.includes('idx_quinyx_shifts_day_post'));
		app.save(qShifts);
		const qAgents = app.findCollectionByNameOrId('quinyx_agents');
		qAgents.fields.removeByName('purpose');
		app.save(qAgents);
		const groups = app.findCollectionByNameOrId('quinyx_groups');
		groups.fields.removeByName('purpose');
		groups.updateRule = groupRule(GROUP_FIELDS);
		app.save(groups);
	}
);
