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
