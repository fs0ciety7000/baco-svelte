/// <reference path="../pb_data/types.d.ts" />
// B201 (15 oct. 2026) : la Relève devient « B201 » (Opérations) et ses notes du jour, en Markdown, remplacent les
// commentaires par période de l'ancienne remise (Ressources › B201). Toujours UNE fiche par jour (index `idx_b201_day`) ;
// le district reste un filtre d'affichage des transports et du PDF.
//  - `content` (texte, 20 000) : notes du jour en Markdown (sous-ensemble sûr du Journal) ;
//  - `versions` (JSON) : versions précédentes du jour `{ at, by, content }`, écrites par le hook `b201.pb.js` seulement.
// Fiches existantes : `notes` (matin, après-midi, nuit, service suivant) converties en Markdown dans `content` (un titre
// par période non vide, texte repris tel quel), par SQL (ni `updated` ni audit touchés). `notes` est GARDÉ tel quel
// (archive, import différentiel) ; le web relit `notes` si `content` est vide (fiche reprise de BACO après la migration).
// Règles inchangées (`b201:*`).

migrate(
	(app) => {
		const col = app.findCollectionByNameOrId('b201_reports');
		if (!col.fields.getByName('content')) col.fields.add(new TextField({ name: 'content', max: 20000 }));
		if (!col.fields.getByName('versions')) col.fields.add(new JSONField({ name: 'versions', maxSize: 200000 }));
		app.save(col);

		const SECTIONS = [
			['matin', 'Matin'],
			['apres_midi', 'Après-midi'],
			['nuit', 'Nuit'],
			['suivant', 'Pour le service suivant']
		];
		const rows = arrayOf(new DynamicModel({ id: '', notes: '' }));
		app.db().newQuery("SELECT id, COALESCE(notes, '') AS notes FROM b201_reports WHERE COALESCE(content, '') = ''").all(rows);
		for (const r of rows) {
			let n = null;
			try {
				n = JSON.parse(r.notes || 'null');
			} catch (_) {
				n = null;
			}
			if (!n || typeof n !== 'object') continue;
			const md = SECTIONS.map(([k, title]) => {
				const v = typeof n[k] === 'string' ? n[k].replace(/\r\n?/g, '\n').trim() : '';
				return v ? `### ${title}\n${v}` : '';
			})
				.filter(Boolean)
				.join('\n\n');
			if (!md) continue;
			app.db().newQuery('UPDATE b201_reports SET content = {:c} WHERE id = {:id}').bind({ c: md.slice(0, 20000), id: r.id }).execute();
		}
		app.db().newQuery("UPDATE b201_reports SET versions = '[]' WHERE versions IS NULL OR versions IN ('', 'null')").execute();
	},
	(app) => {
		const col = app.findCollectionByNameOrId('b201_reports');
		col.fields.removeByName('content');
		col.fields.removeByName('versions');
		app.save(col);
	}
);
