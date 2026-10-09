// Cycle de vie des commandes bus et taxi (docs/design/AUDIT-UX-COMMANDES.md §4, décisions du 8 octobre 2026).
// brouillon → envoyé → confirmé → en cours → terminé, ou annulé. Pas de « facturé ».
// Depuis le 9 oct. 2026 : valider l'envoi passe directement à « terminé » (brouillon → terminé) ; le chemin long reste
// permis pour les commandes déjà « envoyées ».

const KIND = { bus_orders: 'bus', taxi_orders: 'taxi' };

// Transitions permises à tout agent qui écrit des commandes.
const TRANSITIONS = {
	brouillon: ['envoye', 'termine', 'annule'],
	// « Clôturer » un bon jamais confirmé (décision du 9 oct. 2026) : 5 jours après la date de service (voir CLOSE_DAYS).
	envoye: ['brouillon', 'confirme', 'termine', 'annule'],
	confirme: ['envoye', 'en_cours', 'termine', 'annule'],
	en_cours: ['termine'],
	termine: [],
	annule: []
};
// Délai avant de pouvoir clôturer un bon envoyé jamais confirmé (jours après la date de service).
const CLOSE_DAYS = 5;

// Transitions réservées aux coordinateurs (moderator, admin, sysop).
// « en cours → confirmé » aussi : sinon un agent contournerait l'annulation réservée (en cours → confirmé → annulé).
const COORDINATOR = {
	en_cours: ['confirme', 'annule'],
	termine: ['en_cours']
};

// Horodatage posé à l'arrivée dans un statut.
const STAMP = {
	envoye: ['sent_at', 'sent_by'],
	confirme: ['confirmed_at', 'confirmed_by'],
	en_cours: ['started_at', 'started_by'],
	termine: ['ended_at', 'ended_by'],
	annule: ['cancelled_at', 'cancelled_by']
};

function isCoordinator(auth) {
	if (!auth) return false;
	if (auth.isSuperuser()) return true;
	const role = auth.getString('role');
	return role === 'admin' || role === 'sysop' || role === 'moderator';
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
	if (from === 'envoye' && to === 'termine') {
		const raw = record.getString(record.collection().name === 'bus_orders' ? 'order_date' : 'trip_at');
		const day = Date.parse(String(raw).slice(0, 10) + 'T12:00:00Z');
		if (!day || Date.now() - day < CLOSE_DAYS * 86400000) {
			throw new BadRequestError(
				`Clôture possible ${CLOSE_DAYS} jours après la date de service : confirme d'abord le bon (ou annule-le).`
			);
		}
	}

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
	// Envoi validé directement en « terminé » : l'heure d'envoi est aussi posée (suivi, statistiques).
	if (to === 'termine' && from === 'brouillon' && !record.getString('sent_at')) {
		record.set('sent_at', now());
		record.set('sent_by', by);
	}
	if (to === 'annule') record.set('status_before_cancel', from);
	if (from === 'annule') {
		record.set('cancelled_at', '');
		record.set('cancelled_by', '');
		record.set('status_before_cancel', '');
	}
	// Retour en arrière : l'étape quittée n'a plus d'horodatage (l'historique la garde).
	const order = ['brouillon', 'envoye', 'confirme', 'en_cours', 'termine'];
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

module.exports = { checkTransition, stamp, writeEvent, nextNumber, recipient, isCoordinator, TRANSITIONS, COORDINATOR };
