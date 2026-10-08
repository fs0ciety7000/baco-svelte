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
