/// <reference path="../pb_data/types.d.ts" />
// B201 par district (décision de l'utilisateur du 15 oct. 2026) : les notes du jour deviennent UNE fiche par jour ET par
// district de l'équipe (DSO, DSE, DCE), chacune avec ses versions, son auteur et son verrou optimiste.
//  - `b201_notes` (nouvelle) : day, district, content (Markdown, 20 000), versions (JSON, écrites par le hook
//    `b201.pb.js` seulement), updated_by (forcé = l'appelant) ; index unique (day, district). Règles `b201:*` comme
//    `b201_reports` (lecture, création, modification, suppression), jour et district figés après création.
//  - `b201_reports` reste la fiche du JOUR : transports hors outil (`manual`), archive BACO (`notes`, `legacy`) et notes
//    écrites avant le 15 oct. (`content`, `versions`), qui n'ont pas de district évident. Elles ne sont ni déplacées ni
//    recopiées : le web les affiche en lecture seule sous « Notes communes (avant le 15 oct.) », une seule fois au-dessus des
//    notes des districts (et dans le PDF). `content` n'est plus modifiable par l'API (corps refusé s'il contient
//    `content`) : les nouvelles notes vont dans `b201_notes`.
// Aucune donnée réécrite à la montée (rien n'est perdu, ni `updated` ni l'audit touchés).
// Retour arrière : les notes par district sont reversées dans `b201_reports.content` (par SQL, sous un titre « ### Notes
// DSO »…, à la suite des notes communes ; fiche du jour créée si besoin), puis `b201_notes` est supprimée et les règles
// de `b201_reports` rendues.

const DISTRICTS = ['DSO', 'DSE', 'DCE'];
const FROZEN = ' && @request.body.content:isset = false';

migrate(
	(app) => {
		const ACTIVE = '@request.auth.id != "" && @request.auth.role != "disabled"';
		const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
		const NS = '@request.auth.role != "screen"';
		const can = (p) => `(${ACTIVE} && (${ADMIN} || @request.auth.perms ~ '"${p}"'))`;
		const users = app.findCollectionByNameOrId('users');
		app.save(
			new Collection({
				type: 'base',
				name: 'b201_notes',
				listRule: `${can('b201:read')} && ${NS}`,
				viewRule: `${can('b201:read')} && ${NS}`,
				createRule: `(${can('b201:write')} && @request.body.updated_by = @request.auth.id) && ${NS}`,
				updateRule:
					`(${can('b201:update')} && @request.body.day:changed = false && @request.body.district:changed = false` +
					` && @request.body.updated_by = @request.auth.id) && ${NS}`,
				deleteRule: `${can('b201:delete')} && ${NS}`,
				fields: [
					{ name: 'day', type: 'text', required: true, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'district', type: 'select', required: true, values: DISTRICTS, maxSelect: 1 },
					{ name: 'content', type: 'text', max: 20000 },
					{ name: 'versions', type: 'json', maxSize: 200000 },
					{ name: 'updated_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true },
					{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_b201_notes_day_district ON b201_notes (day, district)']
			})
		);
		// Fiche du jour : les notes communes (avant le 15 oct.) ne sont plus écrites par l'API.
		const reports = app.findCollectionByNameOrId('b201_reports');
		if (!String(reports.createRule).includes(FROZEN)) reports.createRule = `${reports.createRule}${FROZEN}`;
		if (!String(reports.updateRule).includes(FROZEN)) reports.updateRule = `${reports.updateRule}${FROZEN}`;
		app.save(reports);
	},
	(app) => {
		// Notes par district → fiche du jour (aucune perte), sans toucher `updated` des fiches existantes ni l'audit.
		const rows = arrayOf(new DynamicModel({ day: '', district: '', content: '' }));
		app
			.db()
			.newQuery(
				"SELECT day, district, COALESCE(content, '') AS content FROM b201_notes WHERE TRIM(COALESCE(content, '')) != '' ORDER BY day, CASE district WHEN 'DSO' THEN 0 WHEN 'DSE' THEN 1 ELSE 2 END"
			)
			.all(rows);
		const byDay = {};
		for (const r of rows) (byDay[r.day] = byDay[r.day] || []).push(`### Notes ${r.district}\n${r.content.trim()}`);
		for (const day of Object.keys(byDay)) {
			const found = arrayOf(new DynamicModel({ id: '', content: '' }));
			app
				.db()
				.newQuery("SELECT id, COALESCE(content, '') AS content FROM b201_reports WHERE day = {:day} LIMIT 1")
				.bind({ day })
				.all(found);
			const extra = byDay[day].join('\n\n');
			if (found.length) {
				const before = found[0].content.trim();
				const c = (before ? `${before}\n\n${extra}` : extra).slice(0, 20000);
				app.db().newQuery('UPDATE b201_reports SET content = {:c} WHERE id = {:id}').bind({ c, id: found[0].id }).execute();
			} else {
				app
					.db()
					.newQuery(
						"INSERT INTO b201_reports (id, day, content, versions, manual, notes, legacy, created, updated) VALUES (substr(lower(hex(randomblob(8))), 1, 15), {:day}, {:c}, '[]', '[]', 'null', 'null', strftime('%Y-%m-%d %H:%M:%fZ', 'now'), strftime('%Y-%m-%d %H:%M:%fZ', 'now'))"
					)
					.bind({ day, c: extra.slice(0, 20000) })
					.execute();
			}
		}
		app.delete(app.findCollectionByNameOrId('b201_notes'));
		const reports = app.findCollectionByNameOrId('b201_reports');
		reports.createRule = String(reports.createRule).split(FROZEN).join('');
		reports.updateRule = String(reports.updateRule).split(FROZEN).join('');
		app.save(reports);
	}
);
