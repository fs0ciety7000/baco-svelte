/// <reference path="../pb_data/types.d.ts" />
// Profil enrichi (demande du 10 oct. 2026) : avatar visible de tous les agents actifs, fichier PROTÉGÉ (servi par Next
// avec un jeton de fichier, PocketBase n'étant jamais appelé par le navigateur), images seulement, 2 Mo, miniatures ;
// téléphone professionnel modifiable par l'agent (règle `users.updateRule` inchangée : l'agent modifie ses champs hors
// rôle, droits, e-mail, identifiant).

migrate(
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		let avatar = users.fields.getByName('avatar');
		if (!avatar) {
			users.fields.add(new FileField({ name: 'avatar' }));
			avatar = users.fields.getByName('avatar');
		}
		avatar.maxSelect = 1;
		avatar.maxSize = 2 * 1024 * 1024;
		avatar.mimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
		avatar.thumbs = ['96x96', '256x256'];
		avatar.protected = true;
		if (!users.fields.getByName('work_phone')) users.fields.add(new TextField({ name: 'work_phone', max: 40 }));
		app.save(users);
	},
	(app) => {
		const users = app.findCollectionByNameOrId('users');
		const avatar = users.fields.getByName('avatar');
		if (avatar) avatar.protected = false;
		users.fields.removeByName('work_phone');
		app.save(users);
	}
);
