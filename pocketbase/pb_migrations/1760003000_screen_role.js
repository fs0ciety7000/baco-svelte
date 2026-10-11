/// <reference path="../pb_data/types.d.ts" />
// Rôle « Écran » (`screen`, demande du 11 oct. 2026) : compte d'affichage du poste partagé du bureau, qui ne voit QUE
// l'écran commun `/tv`. Refusé partout par défaut, y compris par un droit accordé (`grants`) : chaque règle en place
// reçoit `&& @request.auth.role != "screen"`, puis quelques lectures sont rouvertes, strictement bornées à ce que `/tv`
// affiche, sans aucune donnée nominative :
// - sa propre fiche `users` (profil relu à chaque requête) et ses sessions (`user_sessions`, règles inchangées) ;
// - `app_settings` clé « maintenance » seulement ;
// - `bus_orders` envoyés ou en cours (bons ouverts, « à confirmer d'urgence ») ;
// - `pmr_assists` non anonymisées (gare, heure, train, type ; jamais `pmr_mission`, `pmr_clients`, `pmr_assist_legacy`) ;
// - `mission_trains`, `alea_marks`, `dicos_syncs` (données d'exploitation) ;
// - `ops_log` actifs urgents, épinglés ou iRail (le panneau « Urgences et consignes »).
// Pas de `taxi_orders` (copie nominative PMR sur le bon) ni de `group_missions` (contact du groupe) : l'écran n'affiche
// ni taxis ni groupes. Aucune écriture.

const SCREEN = '@request.auth.role = "screen"';
const NOT_SCREEN = '@request.auth.role != "screen"';
const ACTIVE_ROLES = ['admin', 'sysop', 'moderator', 'paco', 'guest'];

// Lectures rouvertes à l'écran (liste ET fiche), par collection.
const SCREEN_READ = {
	users: 'id = @request.auth.id',
	app_settings: 'key = "maintenance"',
	bus_orders: '(status = "envoye" || status = "en_cours")',
	pmr_assists: 'anonymized = false',
	mission_trains: 'id != ""',
	alea_marks: 'id != ""',
	dicos_syncs: 'id != ""',
	ops_log: 'status = "active" && (urgent = true || pinned_until != "" || source = "irail")'
};
// Collections dont les règles restent telles quelles (fiches personnelles déjà limitées au propriétaire).
const UNTOUCHED = ['user_sessions'];

function deny(rule) {
	if (rule === null || rule === undefined) return rule;
	// Règle vide = publique : aucune dans CSM, mais on ne l'ouvrirait pas à l'écran sans le dire.
	if (String(rule).trim() === '') return NOT_SCREEN;
	return `(${rule}) && ${NOT_SCREEN}`;
}

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const role = users.fields.getByName('role');
		if (role.values.indexOf('screen') === -1) role.values = role.values.concat(['screen']);
		const disabledRole = users.fields.getByName('disabled_role');
		if (disabledRole.values.indexOf('screen') === -1) disabledRole.values = ACTIVE_ROLES.concat(['screen']);
		app.save(users);

		const cols = app.findAllCollections();
		for (let i = 0; i < cols.length; i++) {
			const c = cols[i];
			if (c.system || c.name.indexOf('_') === 0 || UNTOUCHED.indexOf(c.name) !== -1) continue;
			for (const k of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) c[k] = deny(c[k]);
			const extra = SCREEN_READ[c.name];
			if (extra) {
				c.listRule = `(${c.listRule || 'id = ""'}) || (${SCREEN} && ${extra})`;
				c.viewRule = `(${c.viewRule || 'id = ""'}) || (${SCREEN} && ${extra})`;
			}
			app.save(c);
		}
	},
	(app) => {
		const n = app.countRecords('users', $dbx.exp("role = 'screen' OR disabled_role = 'screen'"));
		if (n) throw new Error('1760003000_screen_role : des comptes « Écran » existent, les supprimer ou changer leur rôle avant.');
		const strip = (rule) => {
			if (rule === null || rule === undefined) return rule;
			let s = String(rule);
			for (const name in SCREEN_READ) s = s.split(` || (${SCREEN} && ${SCREEN_READ[name]})`).join('');
			if (s === NOT_SCREEN) return '';
			if (s.indexOf('(') === 0 && s.endsWith(`) && ${NOT_SCREEN}`)) s = s.slice(1, -`) && ${NOT_SCREEN}`.length);
			return s;
		};
		const cols = app.findAllCollections();
		for (let i = 0; i < cols.length; i++) {
			const c = cols[i];
			if (c.system || c.name.indexOf('_') === 0 || UNTOUCHED.indexOf(c.name) !== -1) continue;
			for (const k of ['listRule', 'viewRule']) {
				let s = c[k];
				if (s && SCREEN_READ[c.name]) {
					s = s.split(` || (${SCREEN} && ${SCREEN_READ[c.name]})`).join('');
					if (s.indexOf('(') === 0 && s.endsWith(')')) s = s.slice(1, -1);
				}
				c[k] = strip(s);
			}
			for (const k of ['createRule', 'updateRule', 'deleteRule']) c[k] = strip(c[k]);
			app.save(c);
		}
		const fresh = app.findCollectionByNameOrId('users');
		fresh.fields.getByName('role').values = fresh.fields.getByName('role').values.filter((v) => v !== 'screen');
		fresh.fields.getByName('disabled_role').values = ACTIVE_ROLES;
		app.save(fresh);
	}
);
