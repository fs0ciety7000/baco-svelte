/// <reference path="../pb_data/types.d.ts" />
// Rôles et permissions v3 (docs/design/CADRAGE-ROLES-V3.md). Logique dans lib/roles.js (require() dans chaque callback).
//
// Collection `roles` (lot L3) : seuls admin / sysop (et un superuser) créent, modifient ou suppriment un rôle ; un rôle
// verrouillé (admin, sysop, écran, connecteur, désactivé) ne se modifie pas par l'API ; un rôle système ne se supprime pas ;
// un rôle encore attribué ne se supprime pas ; `key` est figée ; `perms` ne contient que des clés du catalogue (dépendances
// ajoutées) ; `updated_by` est posé ici. Modifier les permissions d'un rôle recalcule `users.perms` de ses agents dans la
// même transaction, par `app.save()` (les souscriptions temps réel ouvertes suivent).

onRecordCreateRequest((e) => {
	const roles = require(`${__hooks}/lib/roles.js`);
	const perms = require(`${__hooks}/lib/perms.js`);
	roles.requireRoleManager(e.auth);
	const r = e.record;
	if (!e.auth.isSuperuser()) {
		// Un rôle créé depuis l'interface n'est jamais « système » ni verrouillé.
		r.set('system', false);
		r.set('locked', false);
	}
	const bad = roles.unknownKeys(perms.parseList(r.getString('perms')));
	if (bad.length) throw new BadRequestError(`Permission inconnue : ${bad.join(', ')}.`);
	r.set('updated_by', e.auth.isSuperuser() ? '' : e.auth.id);
	e.next();
}, 'roles');

onRecordUpdateRequest((e) => {
	const roles = require(`${__hooks}/lib/roles.js`);
	const perms = require(`${__hooks}/lib/perms.js`);
	roles.requireRoleManager(e.auth);
	const r = e.record;
	const before = r.original();
	if (before.getBool('locked')) throw new ForbiddenError('Rôle verrouillé : il ne se modifie pas.');
	if (r.getBool('system') !== before.getBool('system') || r.getBool('locked') !== before.getBool('locked')) {
		throw new BadRequestError('Les indicateurs « système » et « verrouillé » ne se modifient pas.');
	}
	const bad = roles.unknownKeys(perms.parseList(r.getString('perms')));
	if (bad.length) throw new BadRequestError(`Permission inconnue : ${bad.join(', ')}.`);
	r.set('updated_by', e.auth.isSuperuser() ? '' : e.auth.id);
	e.next();
}, 'roles');

onRecordDeleteRequest((e) => {
	require(`${__hooks}/lib/roles.js`).requireRoleManager(e.auth);
	e.next();
}, 'roles');

// Toute écriture (API, migration, démarrage) : clé valide et figée, permissions normalisées.
onRecordCreate((e) => {
	const roles = require(`${__hooks}/lib/roles.js`);
	const perms = require(`${__hooks}/lib/perms.js`);
	const key = e.record.getString('key');
	if (!roles.KEY_RE.test(key)) throw new BadRequestError('Identifiant de rôle invalide (minuscules, chiffres, - ou _).');
	e.record.set('perms', roles.normalizePerms(key, perms.parseList(e.record.getString('perms'))));
	e.next();
}, 'roles');

onRecordUpdate((e) => {
	const roles = require(`${__hooks}/lib/roles.js`);
	const perms = require(`${__hooks}/lib/perms.js`);
	const before = e.record.original();
	const key = before.getString('key');
	if (e.record.getString('key') !== key) throw new BadRequestError("L'identifiant d'un rôle ne se modifie pas.");
	e.record.set('perms', roles.normalizePerms(key, perms.parseList(e.record.getString('perms'))));
	const changed = JSON.stringify(perms.parseList(before.getString('perms'))) !== JSON.stringify(perms.parseList(e.record.getString('perms')));
	e.next();
	if (changed) roles.recomputeRole(e.app, key);
}, 'roles');

onRecordDelete((e) => {
	const roles = require(`${__hooks}/lib/roles.js`);
	if (e.record.getBool('system')) throw new BadRequestError('Rôle système : il ne se supprime pas.');
	const n = roles.usersOfRole(e.app, e.record.getString('key'));
	if (n.total > 0) {
		throw new BadRequestError(`Rôle attribué à ${n.total} agent${n.total > 1 ? 's' : ''} : réaffecte-${n.total > 1 ? 'les' : 'le'} à un autre rôle avant de le supprimer.`);
	}
	e.next();
}, 'roles');

// Catalogue modifié par un déploiement : clés nouvelles ajoutées aux rôles système qui les portent par défaut (`serve`).
onBootstrap((e) => {
	e.next();
	const args = $os.args || [];
	let serve = false;
	for (let i = 0; i < args.length; i++) if (String(args[i]) === 'serve') serve = true;
	if (!serve) return;
	try {
		const n = require(`${__hooks}/lib/roles.js`).syncCatalog($app);
		if (n) console.log(`roles : ${n} permission(s) nouvelle(s) du catalogue ajoutée(s) aux rôles système`);
	} catch (err) {
		console.log('roles : synchronisation du catalogue impossible', err);
	}
});

// Contrôle d'équivalence sur une vraie base, en LECTURE SEULE (aucune écriture) : ancien calcul des rôles v2 ↔ `users.perms`.
// N'affiche que des nombres, des identifiants et des rôles. Code de retour 1 s'il y a un écart (tâche planifiée Coolify).
//
//   pocketbase perms-check --dir /pb_data
$app.rootCmd.addCommand(
	new Command({
		use: 'perms-check',
		short: 'Compare users.perms à l\'ancien calcul des rôles v2 (lecture seule)',
		run: () => {
			const report = require(`${__hooks}/lib/perms-check.js`).run($app);
			if (report.lines.length) console.log(report.lines.join('\n'));
			console.log(report.summary);
			if (report.gaps || report.nulls) {
				console.log('perms-check : ÉCART');
				$os.exit(1);
			}
			console.log('perms-check : OK');
		}
	})
);
