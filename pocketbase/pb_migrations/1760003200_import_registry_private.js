/// <reference path="../pb_data/types.d.ts" />
// Registre de l'import différentiel (`app_settings` clé `import_delta`, `lib/import-delta.js`) : identifiants de fiches et
// empreintes des champs repris (taxis, prestations PMR). Lisible par admin / sysop seulement (audit sécurité du
// 11 oct. 2026 : il était lisible par tout agent actif, invité compris).

const GUARD = '(key != "import_delta" || @request.auth.role = "admin" || @request.auth.role = "sysop")';

migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('app_settings');
		for (const k of ['listRule', 'viewRule']) {
			const rule = c[k];
			if (rule !== null && rule !== undefined && String(rule).indexOf(GUARD) === -1) c[k] = `(${rule}) && ${GUARD}`;
		}
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('app_settings');
		const suffix = ` && ${GUARD}`;
		for (const k of ['listRule', 'viewRule']) {
			const s = String(c[k] ?? '');
			if (s.endsWith(suffix) && s.startsWith('(')) c[k] = s.slice(1, s.length - suffix.length - 1);
		}
		app.save(c);
	}
);
