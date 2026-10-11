/// <reference path="../pb_data/types.d.ts" />
// Fournisseurs gérés dans CSM (demande du 11 oct. 2026 : Commandes › Fournisseurs) : sociétés de bus (chauffeurs,
// contacts, lignes desservies) et de taxi, jusqu'ici modifiables seulement dans l'admin PocketBase.
//
// Les règles des rôles v2 (`1760002800`) conviennent déjà : création `otto:write` / `generate_taxi:write`,
// modification `:update`, suppression `:delete`. Ajouts :
// - `legacy_id` (identifiant BACO, unique) n'est plus forgeable par l'API, ni en création ni en modification ;
// - `bus_companies.notes` (remarques internes : horaires de permanence, consignes) ;
// - une société citée par un bon ne se supprime pas (hook `orders.pb.js`, le bon garderait un fournisseur vide).

const COMPANIES = ['bus_companies', 'taxi_companies', 'bus_drivers', 'bus_contacts', 'bus_company_lines'];
const NO_LEGACY = '@request.body.legacy_id:isset = false';

function withGuard(rule) {
	if (rule === null || rule === undefined) return rule;
	const s = String(rule);
	return s.indexOf(NO_LEGACY) !== -1 ? s : `(${s}) && ${NO_LEGACY}`;
}

function withoutGuard(rule) {
	if (rule === null || rule === undefined) return rule;
	const s = String(rule);
	const suffix = ` && ${NO_LEGACY}`;
	if (s.endsWith(suffix) && s.startsWith('(')) return s.slice(1, s.length - suffix.length - 1);
	return s;
}

migrate(
	(app) => {
		for (const name of COMPANIES) {
			const c = app.findCollectionByNameOrId(name);
			c.createRule = withGuard(c.createRule);
			c.updateRule = withGuard(c.updateRule);
			if (name === 'bus_companies' && !c.fields.getByName('notes')) {
				c.fields.add(new TextField({ name: 'notes', max: 2000 }));
			}
			app.save(c);
		}
	},
	(app) => {
		for (const name of COMPANIES) {
			const c = app.findCollectionByNameOrId(name);
			c.createRule = withoutGuard(c.createRule);
			c.updateRule = withoutGuard(c.updateRule);
			if (name === 'bus_companies') c.fields.removeByName('notes');
			app.save(c);
		}
	}
);
