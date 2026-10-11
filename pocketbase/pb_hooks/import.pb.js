/// <reference path="../pb_data/types.d.ts" />
// Commande d'import de la sauvegarde Supabase (bascule en une fois, voir docs/CSM-V2.md §1).
//
//   [CSM_IMPORT_RESET=1] pocketbase csm-import /home/user/csm-backup --dir pb_data
// CSM_IMPORT_RESET=1 vide d'abord les collections importées (répétition de la bascule).
// CSM_IMPORT_SCOPE=commandes : seulement le module Commandes, comptes existants conservés.
// CSM_IMPORT_SCOPE=operations : main courante et passages à niveau seuls.
//
// Lit, dans le dossier de sauvegarde : auth_users.json, auth_password_hashes.json, data/*.json, storage/avatars.
// Les empreintes bcrypt ($2a$) sont recopiées telles quelles : les agents gardent leur mot de passe.
// Passe en ligne de commande, jamais par HTTP : aucune route d'import n'est exposée.

$app.rootCmd.addCommand(
	new Command({
		use: 'csm-import <dossier-sauvegarde>',
		short: 'Importe la sauvegarde Supabase de BACO dans CSM',
		run: (cmd, args) => {
			const dir = args[0];
			if (!dir) throw new Error('usage : csm-import <dossier-sauvegarde>');
			const reset = $os.getenv('CSM_IMPORT_RESET') === '1';
			const scope = $os.getenv('CSM_IMPORT_SCOPE') || 'all';
			if (['all', 'commandes', 'pmr', 'operations'].indexOf(scope) === -1) throw new Error('CSM_IMPORT_SCOPE : all, commandes, pmr ou operations');
			const report = require(`${__hooks}/lib/import.js`).run($app, dir, reset, scope);
			console.log(JSON.stringify(report, null, 2));
		}
	})
);

// Import différentiel (bascule : ce qui a été saisi dans BACO après la sauvegarde de l'import initial), voir
// lib/import-delta.js et docs/DEPLOIEMENT-V2.md §7. Jamais de suppression ; conflits listés, jamais écrasés.
//
//   pocketbase csm-import-delta /home/user/csm-backup-gel --base /home/user/csm-backup-prod \
//     [--since 2026-10-10T12:36:11Z] [--imported-at auto] [--dry-run] [--report rapport.json] [--only bus_orders,ops_log] --dir pb_data
const deltaCmd = new Command({
	use: 'csm-import-delta <dossier-sauvegarde>',
	short: 'Rapatrie dans CSM ce qui a été saisi dans BACO après l\'import initial (sans écraser CSM)',
	run: (cmd, args) => {
		const dir = args[0];
		if (!dir) throw new Error('usage : csm-import-delta <dossier-sauvegarde> [--base …] [--since …] [--dry-run]');
		const flag = (name) => cmd.flags().lookup(name).value.string();
		const delta = require(`${__hooks}/lib/import-delta.js`);
		const report = delta.run($app, {
			dir: dir,
			base: flag('base'),
			since: flag('since'),
			importedAt: flag('imported-at'),
			dryRun: flag('dry-run') === 'true',
			only: flag('only') ? flag('only').split(',').map((s) => s.trim()).filter(Boolean) : []
		});
		const text = delta.summary(report);
		const out = flag('report');
		if (out) {
			$os.writeFile(out, JSON.stringify(report, null, 2), 0o600);
			$os.writeFile(out.replace(/\.json$/, '') + '.txt', text + '\n', 0o600);
		}
		console.log(text);
		if (report.errors.length) throw new Error(`${report.errors.length} erreur(s), voir le rapport`);
	}
});
deltaCmd.flags().string('base', '', 'sauvegarde Supabase de l\'import initial (comparaison ligne à ligne ; recommandé)');
deltaCmd.flags().string('since', '', 'date ISO de la sauvegarde de l\'import initial (défaut : report.json de --base)');
deltaCmd.flags().string('imported-at', 'auto', 'date ISO de construction de la base CSM (auto : déduite des fiches importées)');
deltaCmd.flags().bool('dry-run', false, 'essai à blanc : rapport sans écriture (transaction annulée)');
deltaCmd.flags().string('report', '', 'fichier JSON du rapport (un .txt est écrit à côté)');
deltaCmd.flags().string('only', '', 'collections CSM à traiter, séparées par des virgules');
$app.rootCmd.addCommand(deltaCmd);
