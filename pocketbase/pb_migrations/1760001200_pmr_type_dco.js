/// <reference path="../pb_data/types.d.ts" />
// Nouveau type PMR vu dans DICOS le 8 oct. 2026 : `pmr-to` / `orientation-problems` (« difficultés de
// compréhension/orientation ») → code `DCO`. Ajouté au select `pmr_assists.pmr_type`.

migrate(
	(app) => {
		const c = app.findCollectionByNameOrId('pmr_assists');
		const f = c.fields.getByName('pmr_type');
		if (!f.values.includes('DCO')) f.values = [...f.values.filter((v) => v !== 'AUTRE'), 'DCO', 'AUTRE'];
		app.save(c);
	},
	(app) => {
		const c = app.findCollectionByNameOrId('pmr_assists');
		const f = c.fields.getByName('pmr_type');
		f.values = f.values.filter((v) => v !== 'DCO');
		app.save(c);
	}
);
