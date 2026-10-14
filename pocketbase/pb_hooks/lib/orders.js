// Cycle de vie des commandes bus et taxi, v3 (décision de l'utilisateur du 14 oct. 2026, migration `1760003400`) :
// brouillon (« Brouillon / en cours ») → terminé (bus démobilisés) → envoyé (« Envoyé / finalisé » : e-mail
// semi-automatique au fournisseur, PDF archivé), ou annulé. Plus de « confirmé » ni d'« en cours ».

const KIND = { bus_orders: 'bus', taxi_orders: 'taxi' };

// Transitions permises à tout agent qui écrit des commandes.
const TRANSITIONS = {
	brouillon: ['termine', 'annule'],
	termine: ['envoye', 'brouillon', 'annule'],
	envoye: [],
	annule: []
};

// Transitions réservées aux coordinateurs (`bus:reopen` / `taxi:reopen`) : admin, sysop, modérateur et PACO/RCCA par défaut.
// Rouvrir un bon finalisé (les PACO/RCCA le gardent, décision du 11 oct. 2026).
const COORDINATOR = {
	envoye: ['termine']
};

// Horodatage posé à l'arrivée dans un statut.
const STAMP = {
	termine: ['ended_at', 'ended_by'],
	envoye: ['sent_at', 'sent_by'],
	annule: ['cancelled_at', 'cancelled_by']
};

// Rôles v3, lot L2 : « coordinateur » d'un bon = permission `bus:reopen` (bons bus) ou `taxi:reopen` (bons taxi), lue dans
// `users.perms` (PACO/RCCA, Modérateur et admins par défaut, comme les rôles v2) ; superuser : oui.
function isCoordinator(auth, record) {
	const kind = record && record.collection().name === 'taxi_orders' ? 'taxi:reopen' : 'bus:reopen';
	return require(`${__hooks}/lib/perms.js`).has(auth, kind);
}

function now() {
	return new Date().toISOString().replace('T', ' ');
}

/** Lève une erreur 400 si la transition n'est pas permise ; renvoie true si le statut change. */
function checkTransition(app, record, from, to, auth) {
	if (from === to) {
		if (from === 'annule' && !isCoordinator(auth, record)) {
			throw new BadRequestError('Commande annulée : rétablissez-la avant de la modifier.');
		}
		// Bon finalisé (e-mail parti, PDF archivé) : on le rouvre (→ terminé) avant toute modification.
		if (from === 'envoye') throw new BadRequestError('Bon finalisé : rouvre-le avant de le modifier.');
		return false;
	}
	let allowed = (TRANSITIONS[from] || []).indexOf(to) !== -1;
	if (!allowed && (COORDINATOR[from] || []).indexOf(to) !== -1) {
		if (!isCoordinator(auth, record)) throw new ForbiddenError('Transition réservée aux coordinateurs.');
		allowed = true;
	}
	// Rétablir une commande annulée : vers son statut précédent, coordinateur.
	if (!allowed && from === 'annule' && to === record.original().getString('status_before_cancel')) {
		if (!isCoordinator(auth, record)) throw new ForbiddenError('Rétablir une commande est réservé aux coordinateurs.');
		allowed = true;
	}
	if (!allowed) throw new BadRequestError(`Transition impossible : ${from} → ${to}.`);

	if (to === 'annule' && !record.getString('cancel_reason').trim()) {
		throw new BadRequestError("Le motif d'annulation est obligatoire.");
	}
	// Plus de refus sans adresse e-mail (9 oct. 2026) : sans adresse, le bon part en PDF par un autre canal.
	return true;
}

/** Adresse du fournisseur (société de bus, ou société de taxi / adresse saisie). */
function recipient(app, record) {
	const name = record.collection().name;
	if (name === 'bus_orders') {
		const id = record.getString('company');
		if (!id) return '';
		try {
			return app.findRecordById('bus_companies', id).getString('email').trim();
		} catch (_) {
			return '';
		}
	}
	const typed = record.getString('taxi_email').trim();
	if (typed) return typed;
	const id = record.getString('taxi_company');
	if (!id) return '';
	try {
		const raw = app.findRecordById('taxi_companies', id).getString('emails');
		const list = JSON.parse(raw || '[]');
		return Array.isArray(list) ? list.filter((m) => String(m).trim()).join(';') : '';
	} catch (_) {
		return '';
	}
}

/** Pose les horodatages du nouveau statut et nettoie ceux d'un retour en arrière. */
function stamp(record, from, to, auth) {
	const by = auth && !auth.isSuperuser() ? auth.id : '';
	const fields = STAMP[to];
	// Rétablir une commande annulée garde les horodatages d'origine (ex. heure réelle de l'envoi).
	if (fields && from !== 'annule') {
		record.set(fields[0], now());
		record.set(fields[1], by);
	}
	if (to === 'annule') record.set('status_before_cancel', from);
	if (from === 'annule') {
		record.set('cancelled_at', '');
		record.set('cancelled_by', '');
		record.set('status_before_cancel', '');
	}
	// Retour en arrière : l'étape quittée n'a plus d'horodatage (l'historique la garde).
	const order = ['brouillon', 'termine', 'envoye'];
	if (from !== 'annule' && order.indexOf(to) < order.indexOf(from)) {
		const undone = STAMP[from];
		if (undone) {
			record.set(undone[0], '');
			record.set(undone[1], '');
		}
	}
}

function writeEvent(app, record, from, to, auth, note) {
	const col = app.findCollectionByNameOrId('order_events');
	const ev = new Record(col);
	ev.set('kind', KIND[record.collection().name]);
	ev.set('order', record.id);
	ev.set('from', from || '');
	ev.set('to', to);
	ev.set('by', auth && !auth.isSuperuser() ? auth.id : '');
	ev.set('note', note || '');
	ev.set('at', now());
	app.save(ev);
}

/**
 * Numéro lisible suivant (n° de bon), par type de commande. Une seule instruction SQL atomique sur le compteur
 * (`_order_counters`, créé par migration) : pas de doublon quand deux agents créent en même temps. Le MAX garde
 * le compteur au-dessus des numéros importés.
 */
function nextNumber(app, table) {
	const row = new DynamicModel({ n: 0 });
	app.db()
		.newQuery(
			`UPDATE _order_counters SET n = MAX(n, (SELECT COALESCE(MAX(number), 0) FROM ${table})) + 1 WHERE name = {:t} RETURNING n`
		)
		.bind({ t: table })
		.one(row);
	return row.n;
}

/** Nombre de bons qui citent une société (bus : `bus_orders.company`, taxi : `taxi_orders.taxi_company`). */
function companyUses(app, collection, id) {
	const ref = collection === 'bus_companies' ? ['bus_orders', 'company'] : ['taxi_orders', 'taxi_company'];
	const row = new DynamicModel({ n: 0 });
	app.db()
		.newQuery(`SELECT COUNT(*) AS n FROM ${ref[0]} WHERE ${ref[1]} = {:id}`)
		.bind({ id: id })
		.one(row);
	return row.n;
}


// Suppression d'un bon (demande du 14 oct. 2026) : les titulaires de `otto:delete` / `generate_taxi:delete` (Modérateur,
// admins) comme avant ; sinon son créateur (règle : `created_by` = l'agent, droit d'écriture du module, bon pas
// « envoyé / finalisé ») et seulement pendant 8 h après la création (contrôlé ici : la syntaxe des règles n'a pas de
// « @now - 8 h »). Un bon envoyé / finalisé (PDF archivé) ne se supprime que par un titulaire du droit de suppression.
const DELETE_WINDOW_MS = 8 * 3600 * 1000;

function checkDelete(record, auth) {
	if (!auth) throw new ForbiddenError('Suppression refusée.');
	if (auth.isSuperuser()) return;
	const perms = require(`${__hooks}/lib/perms.js`);
	const del = record.collection().name === 'taxi_orders' ? 'generate_taxi:delete' : 'otto:delete';
	if (perms.has(auth, del)) return;
	if (record.getString('created_by') !== auth.id) throw new ForbiddenError('Seul le créateur du bon peut le supprimer.');
	// Bon envoyé (même rouvert ensuite : l'heure d'envoi est effacée à la réouverture, l'historique la garde) : jamais par
	// son créateur (audit sécurité du 14 oct. 2026 : rouvrir puis supprimer contournait la règle).
	const wasSent =
		record.getString('status') === 'envoye' ||
		$app.countRecords('order_events', $dbx.exp("[[order]] = {:o} AND [[to]] = 'envoye'", { o: record.id })) > 0;
	if (wasSent) throw new ForbiddenError('Bon déjà envoyé : suppression réservée aux administrateurs et modérateurs.');
	const created = new Date(record.getString('created').replace(' ', 'T')).getTime();
	if (!(created > 0) || Date.now() - created > DELETE_WINDOW_MS) {
		throw new ForbiddenError('Plus de 8 h après sa création : demande la suppression à un administrateur ou un modérateur.');
	}
}

module.exports = { checkDelete, DELETE_WINDOW_MS, checkTransition, stamp, writeEvent, nextNumber, recipient, isCoordinator, companyUses, TRANSITIONS, COORDINATOR };
