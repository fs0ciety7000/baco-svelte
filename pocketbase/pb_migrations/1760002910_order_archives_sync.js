/// <reference path="../pb_data/types.d.ts" />
// Archives des bons, suite de la relecture du 11 oct. 2026 :
// - `order_pdfs.content_at` : date du contenu (posée à l'archivage seulement) ; `updated` bouge aussi quand l'état R2 est
//   noté, il ne sert donc plus à savoir si un zip est à refaire ;
// - `order_pdfs.r2_tried_at` / `order_pdf_backups.r2_tried_at` : dernier essai d'envoi R2 (rattrapage par ancienneté
//   d'essai, une fiche en échec permanent ne bloque plus les autres) ;
// - `order_pdf_backups.as_of` : plus récent `content_at` des PDF inclus (un PDF rangé pendant le zip reste à inclure).

migrate(
	(app) => {
		const pdfs = app.findCollectionByNameOrId('order_pdfs');
		if (!pdfs.fields.getByName('content_at')) pdfs.fields.add(new DateField({ name: 'content_at' }));
		if (!pdfs.fields.getByName('r2_tried_at')) pdfs.fields.add(new DateField({ name: 'r2_tried_at' }));
		app.save(pdfs);
		const backups = app.findCollectionByNameOrId('order_pdf_backups');
		if (!backups.fields.getByName('as_of')) backups.fields.add(new DateField({ name: 'as_of' }));
		if (!backups.fields.getByName('r2_tried_at')) backups.fields.add(new DateField({ name: 'r2_tried_at' }));
		app.save(backups);
		// Fiches déjà archivées (préversion) : contenu daté de leur création.
		app.db().newQuery("UPDATE order_pdfs SET content_at = created WHERE content_at = '' OR content_at IS NULL").execute();
	},
	(app) => {
		const pdfs = app.findCollectionByNameOrId('order_pdfs');
		pdfs.fields.removeByName('content_at');
		pdfs.fields.removeByName('r2_tried_at');
		app.save(pdfs);
		const backups = app.findCollectionByNameOrId('order_pdf_backups');
		backups.fields.removeByName('as_of');
		backups.fields.removeByName('r2_tried_at');
		app.save(backups);
	}
);
