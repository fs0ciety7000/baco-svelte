/// <reference path="../pb_data/types.d.ts" />
// Suppression des bons bus / taxi (demande de l'utilisateur, 14 oct. 2026) : titulaires de `otto:delete` /
// `generate_taxi:delete` (Modérateur, admins) comme avant, OU le créateur du bon (`created_by`) qui a le droit d'écriture
// du module (`otto:write` / `generate_taxi:write`), tant que le bon n'est pas « envoyé / finalisé ». La fenêtre de 8 h après
// la création est contrôlée par le hook (`checkDelete`, lib/orders.js) : les règles n'ont pas d'arithmétique sur `@now`.
// `order_events` part avec le bon (hook) ; les liens du Journal sont vidés ; le PDF archivé est gardé.

migrate(
	(app) => {
		const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
		const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
		const NS = '@request.auth.role != "screen"';
		const can = (p) => `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"${p}"'))`;
		for (const [name, m] of [
			['bus_orders', 'otto'],
			['taxi_orders', 'generate_taxi']
		]) {
			const c = app.findCollectionByNameOrId(name);
			c.deleteRule = `(${can(`${m}:delete`)} || (${can(`${m}:write`)} && created_by = @request.auth.id && status != "envoye")) && ${NS}`;
			app.save(c);
		}
	},
	(app) => {
		const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
		const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
		const NS = '@request.auth.role != "screen"';
		const can = (p) => `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"${p}"'))`;
		for (const [name, m] of [
			['bus_orders', 'otto'],
			['taxi_orders', 'generate_taxi']
		]) {
			const c = app.findCollectionByNameOrId(name);
			c.deleteRule = `${can(`${m}:delete`)} && ${NS}`;
			app.save(c);
		}
	}
);
