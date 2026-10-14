/// <reference path="../pb_data/types.d.ts" />
// Rôles et permissions v3 (docs/design/CADRAGE-ROLES-V3.md).

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
