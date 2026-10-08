/// <reference path="../pb_data/types.d.ts" />
// Module Référentiels : versioning ATOMIQUE des procédures + refus de suppression d'un document référencé.
// Les hooks JSVM sont isolés ; aucune logique partagée nécessaire ici.

// À chaque modification d'une procédure, on archive l'état PRÉCÉDENT dans procedure_versions (snapshot atomique dans
// la même transaction : fin du versioning manuel non atomique de BACO, BUG-8). « Restaurer » = une modification de
// plus, donc historisée elle aussi (BUG-7 : plus de fausse restauration).
onRecordUpdateRequest((e) => {
	const orig = e.record.original();
	const snap = {
		pid: orig.id,
		title: orig.getString('title'),
		category: orig.getString('category'),
		content: orig.getString('content'),
		by: orig.getString('updated_by')
	};
	e.next();
	// On n'archive une version que si le texte a réellement changé (une modif des seules pièces jointes, ou un
	// enregistrement à l'identique, ne gonfle pas l'historique).
	const changed =
		snap.title !== e.record.getString('title') ||
		snap.category !== e.record.getString('category') ||
		snap.content !== e.record.getString('content');
	if (!changed) return;
	const v = new Record(e.app.findCollectionByNameOrId('procedure_versions'));
	v.set('procedure', snap.pid);
	v.set('title', snap.title);
	v.set('category', snap.category);
	v.set('content', snap.content);
	if (snap.by) v.set('by', snap.by);
	e.app.save(v);
}, 'procedures');

// Un document référencé par au moins une procédure ne se supprime pas (BUG-6/9 : plus d'orphelin ni de lien cassé).
// `findRecordsByFilter` ne lève pas quand il n'y a aucune ligne (contrairement à findFirst…) : une vraie erreur DB
// remonte donc et n'ouvre pas la suppression par erreur (fail-closed).
onRecordDeleteRequest((e) => {
	const refs = e.app.findRecordsByFilter('procedures', 'attachments ~ {:id}', '', 1, 0, { id: e.record.id });
	if (refs && refs.length)
		throw new BadRequestError('Document référencé par une procédure : détachez-le avant de le supprimer.');
	e.next();
}, 'documents');
