/// <reference path="../pb_data/types.d.ts" />
// Rôles v2 (demande du 11 oct. 2026) : Administrateur et Sysop (tout), Modérateur (PACO/RCCA + suppression partout et
// Nouveautés, sans l'administration), PACO/RCCA (lecture partout, écriture et modification, jamais de suppression),
// Invité (lecture des commandes bus et taxi). Les comptes moderator, user, otto_agent et reader existants deviennent
// PACO/RCCA (choix de l'utilisateur ; l'admin rend le rôle Modérateur à qui doit l'avoir).
//
// Droits par module en quatre actions : `X:read` (lecture), `X:write` (écriture = création), `X:update`
// (modification), `X:delete` (suppression). Le rôle donne les droits par défaut ; `grants` / `denies` les ajoutent ou
// les retirent compte par compte (héritage, comme avant). `X:update` est nouveau : un droit d'écriture accordé ou
// retiré avant ce changement l'est aussi pour la modification. Les suppressions ne passent plus que par `X:delete`
// (admin, sysop ou droit accordé), sauf les fiches personnelles (notifications, trains suivis, passkeys, sessions,
// jetons) et la coche « encodé » de l'ALEA (décocher n'efface pas de donnée métier).
//
// Districts : `users.districts` (un, deux ou les trois, réglé par l'admin) sert de filtre et d'alertes, comme les
// districts du jour mais en réglage permanent ; `district` (premier district) reste pour la compatibilité.
//
// Les règles sont réécrites à partir des règles en place : les listes de rôles produites par `can()` deviennent
// « paco » (+ « guest » pour la lecture bus / taxi), les modifications testent `X:update`, les suppressions `X:delete`.

const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
const OLD_ROLES = ['moderator', 'user', 'otto_agent', 'reader'];
const ROLES = ['admin', 'sysop', 'moderator', 'paco', 'guest', 'disabled', 'connector'];
const ACTIVE_ROLES = ['admin', 'sysop', 'moderator', 'paco', 'guest'];
const MODERATOR = '@request.auth.role = "moderator"';
const DISTRICTS = ['Sud-Ouest', 'Sud-Est', 'Centre'];
// Lecture accordée à l'invité par défaut.
const GUEST_READ = ['otto:read', 'generate_taxi:read'];

// Suppression : admin, sysop, modérateur (sauf droit retiré) ou droit accordé.
function canDelete(perm) {
	return `${ACTIVE} && (${ADMIN} || (${MODERATOR} && @request.auth.denies !~ '"${perm}"') || @request.auth.grants ~ '"${perm}"')`;
}

// Suppressions : droit `X:delete` (les anciennes règles « admin seul » et « coordinateurs » s'y rangent).
const DELETE_RULES = {
	bus_orders: canDelete('otto:delete'),
	taxi_orders: canDelete('generate_taxi:delete'),
	bus_companies: canDelete('otto:delete'),
	bus_drivers: canDelete('otto:delete'),
	bus_contacts: canDelete('otto:delete'),
	bus_company_lines: canDelete('otto:delete'),
	taxi_companies: canDelete('generate_taxi:delete'),
	order_templates: `(kind = "bus" && ${canDelete('otto:delete')}) || (kind = "taxi" && ${canDelete('generate_taxi:delete')})`,
	b201_reports: canDelete('b201:delete'),
	line_stations: canDelete('lignes:delete'),
	spi_points: canDelete('lignes:delete'),
	pmr_clients: canDelete('pmr:delete'),
	pmr_equipment: canDelete('pmr:delete'),
	pmr_assists: canDelete('deplacements:delete'),
	level_crossings: canDelete('carte_pn:delete'),
	ops_log: canDelete('journal:delete'),
	directory_contacts: canDelete('repertoire:delete'),
	ptcar: canDelete('ptcar:delete'),
	ebp_views: canDelete('ebp:delete'),
	documents: canDelete('documents:delete'), // refus si référencé par une procédure : hook referentiels.pb.js
	procedures: canDelete('documents:delete'),
	changelog: `${ACTIVE} && (${ADMIN} || ${MODERATOR})`
};

function rolesFor(perm) {
	const list = ['paco'];
	if (GUEST_READ.indexOf(perm) !== -1) list.push('guest');
	return list.map((r) => `@request.auth.role = "${r}"`).join(' || ');
}

function rewrite(rule, kind) {
	if (rule === null || rule === undefined) return rule;
	let s = String(rule);
	// B201 : écrite par les coordinateurs et les agents rattachés à un district → tout PACO/RCCA.
	s = s
		.split('(@request.auth.role = "moderator" || ((@request.auth.role = "user" || @request.auth.role = "otto_agent") && @request.auth.district != ""))')
		.join('@request.auth.role = "paco"');
	// Listes de rôles de `can()` : ((r1 || r2…) && denies !~ '"perm"').
	s = s.replace(
		/\((@request\.auth\.role = "(?:moderator|user|otto_agent|reader)"(?: \|\| @request\.auth\.role = "(?:moderator|user|otto_agent|reader)")*)\) && @request\.auth\.denies !~ '"([a-z0-9_]+:[a-z]+)"'/g,
		(_, roles, perm) => `(${rolesFor(perm)}) && @request.auth.denies !~ '"${perm}"'`
	);
	// Rôle seul (coordinateurs) → PACO/RCCA.
	s = s.replace(/@request\.auth\.role = "(?:moderator|user|otto_agent|reader)"/g, '@request.auth.role = "paco"');
	// Doublons nés du remplacement (« paco || paco »).
	s = s.replace(/@request\.auth\.role = "paco"(?: \|\| @request\.auth\.role = "paco")+/g, '@request.auth.role = "paco"');
	// Modification : droit `X:update` (le connecteur DICOS garde `dicos:write`).
	if (kind === 'update') s = s.replace(/'"((?!dicos:)[a-z0-9_]+):write"'/g, `'"$1:update"'`);
	// Le modérateur a tout ce qu'a un PACO/RCCA (parenthèses : l'atome peut être dans un « et »).
	s = s.split('@request.auth.role = "paco"').join(`(@request.auth.role = "paco" || ${MODERATOR})`);
	return s;
}

function withUpdate(list) {
	const out = [];
	for (let i = 0; i < list.length; i++) {
		const p = String(list[i]);
		if (out.indexOf(p) === -1) out.push(p);
		const m = /^([a-z0-9_]+):write$/.exec(p);
		if (m && m[1] !== 'dicos' && out.indexOf(`${m[1]}:update`) === -1) out.push(`${m[1]}:update`);
	}
	return out;
}

function parseList(raw) {
	try {
		const v = JSON.parse(raw || '[]');
		return Array.isArray(v) ? v : [];
	} catch (_) {
		return [];
	}
}

migrate(
	(app) => {
		// 1. Valeurs de rôle : anciennes + nouvelles le temps de convertir les comptes.
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		role.values = ROLES.concat(OLD_ROLES.filter((r) => r !== 'moderator'));
		const disabledRole = users.fields.getByName('disabled_role');
		disabledRole.values = ACTIVE_ROLES.concat(OLD_ROLES.filter((r) => r !== 'moderator'));
		if (!users.fields.getByName('districts')) {
			users.fields.add(new SelectField({ name: 'districts', maxSelect: 3, values: DISTRICTS }));
		}
		app.save(users);

		// 2. Comptes : anciens rôles → PACO/RCCA ; X:write accordé / retiré → X:update aussi ; districts repris.
		const records = app.findAllRecords('users');
		for (let i = 0; i < records.length; i++) {
			const r = records[i];
			const cur = r.getString('role');
			if (OLD_ROLES.indexOf(cur) !== -1) r.set('role', 'paco');
			const dr = r.getString('disabled_role');
			if (OLD_ROLES.indexOf(dr) !== -1) r.set('disabled_role', 'paco');
			r.set('grants', withUpdate(parseList(r.getString('grants'))));
			r.set('denies', withUpdate(parseList(r.getString('denies'))));
			const d = r.getString('district');
			if (d && DISTRICTS.indexOf(d) !== -1) r.set('districts', [d]);
			app.saveNoValidate(r);
		}

		// 3. Valeurs définitives ; districts réservés à l'admin (comme `district`).
		role.values = ROLES;
		disabledRole.values = ACTIVE_ROLES;
		users.updateRule = users.updateRule.replace(
			'@request.body.district:isset = false',
			'@request.body.district:isset = false && @request.body.districts:isset = false'
		);
		app.save(users);

		// 4. Règles de toutes les collections.
		const cols = app.findAllCollections();
		for (let i = 0; i < cols.length; i++) {
			const c = cols[i];
			if (c.system || c.name.indexOf('_') === 0) continue;
			c.listRule = rewrite(c.listRule, 'list');
			c.viewRule = rewrite(c.viewRule, 'view');
			c.createRule = rewrite(c.createRule, 'create');
			c.updateRule = rewrite(c.updateRule, 'update');
			c.deleteRule = Object.prototype.hasOwnProperty.call(DELETE_RULES, c.name)
				? DELETE_RULES[c.name]
				: rewrite(c.deleteRule, 'delete');
			if (c.name === 'changelog') {
				// Nouveautés de l'application : administrateurs et modérateurs.
				c.createRule = `${ACTIVE} && (${ADMIN} || ${MODERATOR}) && @request.body.author = @request.auth.id`;
				c.updateRule = `${ACTIVE} && (${ADMIN} || ${MODERATOR}) && @request.body.author:isset = false`;
			}
			app.save(c);
		}
	},
	(app) => {
		// Retour arrière partiel : PACO/RCCA → agent (user), invité → lecteur ; les règles ne sont pas restaurées
		// (restaurer une sauvegarde pour revenir réellement en arrière).
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		role.values = ROLES.concat(OLD_ROLES.filter((r) => r !== 'moderator'));
		const disabledRole = users.fields.getByName('disabled_role');
		disabledRole.values = ACTIVE_ROLES.concat(OLD_ROLES.filter((r) => r !== 'moderator'));
		app.save(users);
		const records = app.findAllRecords('users');
		for (let i = 0; i < records.length; i++) {
			const r = records[i];
			if (r.getString('role') === 'paco') r.set('role', 'user');
			if (r.getString('role') === 'guest') r.set('role', 'reader');
			if (r.getString('disabled_role') === 'paco') r.set('disabled_role', 'user');
			if (r.getString('disabled_role') === 'guest') r.set('disabled_role', 'reader');
			app.saveNoValidate(r);
		}
	}
);
