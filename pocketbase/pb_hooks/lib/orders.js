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

// Transitions réservées aux coordinateurs : admin, sysop, modérateur et PACO/RCCA (rôles v2 du 11 oct. 2026).
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

function isCoordinator(auth) {
	if (!auth) return false;
	if (auth.isSuperuser()) return true;
	const role = auth.getString('role');
	return role === 'admin' || role === 'sysop' || role === 'moderator' || role === 'paco';
}

function now() {
	return new Date().toISOString().replace('T', ' ');
}

/** Lève une erreur 400 si la transition n'est pas permise ; renvoie true si le statut change. */
function checkTransition(app, record, from, to, auth) {
	if (from === to) {
		if (from === 'annule' && !isCoordinator(auth)) {
			throw new BadRequestError('Commande annulée : rétablissez-la avant de la modifier.');
		}
		// Bon finalisé (e-mail parti, PDF archivé) : on le rouvre (→ terminé) avant toute modification.
		if (from === 'envoye') throw new BadRequestError('Bon finalisé : rouvre-le avant de le modifier.');
		return false;
	}
	let allowed = (TRANSITIONS[from] || []).indexOf(to) !== -1;
	if (!allowed && (COORDINATOR[from] || []).indexOf(to) !== -1) {
		if (!isCoordinator(auth)) throw new ForbiddenError('Transition réservée aux coordinateurs.');
		allowed = true;
	}
	// Rétablir une commande annulée : vers son statut précédent, coordinateur.
	if (!allowed && from === 'annule' && to === record.original().getString('status_before_cancel')) {
		if (!isCoordinator(auth)) throw new ForbiddenError('Rétablir une commande est réservé aux coordinateurs.');
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

module.exports = { checkTransition, stamp, writeEvent, nextNumber, recipient, isCoordinator, companyUses, TRANSITIONS, COORDINATOR };
