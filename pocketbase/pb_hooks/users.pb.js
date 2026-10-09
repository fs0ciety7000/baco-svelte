/// <reference path="../pb_data/types.d.ts" />
// grants / denies toujours des tableaux : les règles d'accès testent `denies !~ '"perm"'`, et un JSON null
// rendrait ce test faux (NULL en SQL), ce qui couperait l'accès de l'agent à tout le module.

onRecordCreate((e) => {
	for (const f of ['grants', 'denies']) {
		// get() renvoie du JSON brut (pas un tableau JS) : on teste sa forme texte.
		const raw = e.record.getString(f).trim();
		if (!raw.startsWith('[')) e.record.set(f, []);
	}
	e.next();
}, 'users');

onRecordUpdate((e) => {
	for (const f of ['grants', 'denies']) {
		// get() renvoie du JSON brut (pas un tableau JS) : on teste sa forme texte.
		const raw = e.record.getString(f).trim();
		if (!raw.startsWith('[')) e.record.set(f, []);
	}
	e.next();
}, 'users');

// Désactivation d'un compte : les jetons déjà émis sont révoqués (nouvelle `tokenKey`), sinon un ancien jeton resterait
// valable jusqu'à son expiration (audit du 9 oct. 2026).
onRecordUpdate((e) => {
	if (e.record.getString('role') === 'disabled' && e.record.original().getString('role') !== 'disabled') {
		e.record.refreshTokenKey();
	}
	e.next();
}, 'users');

// Jetons de connecteur personnels (extension DICOS) supprimés à la désactivation du compte.
onRecordAfterUpdateSuccess((e) => {
	if (e.record.getString('role') === 'disabled') {
		try {
			for (const t of $app.findRecordsByFilter('connector_tokens', 'user = {:u}', '', 0, 0, { u: e.record.id })) {
				$app.delete(t);
			}
		} catch (err) {
			console.log('connector_tokens: suppression impossible', err);
		}
	}
	e.next();
}, 'users');

// Au plus 10 jetons par agent (un par poste / navigateur suffit).
onRecordCreateRequest((e) => {
	const user = e.record.getString('user');
	const n = $app.countRecords('connector_tokens', $dbx.hashExp({ user: user }));
	if (n >= 10) throw new BadRequestError('10 jetons au plus : révoque un ancien appareil.');
	e.next();
}, 'connector_tokens');
