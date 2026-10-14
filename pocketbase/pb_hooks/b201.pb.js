/// <reference path="../pb_data/types.d.ts" />
// B201 (15 oct. 2026) : versions du jour des notes Markdown, tenues par le serveur (lib/b201.js). La valeur `versions`
// envoyée par un client est toujours remplacée : seul ce hook l'écrit.

onRecordCreateRequest((e) => {
	e.record.set('versions', []);
	e.next();
}, 'b201_reports');

onRecordUpdateRequest((e) => {
	const lib = require(`${__hooks}/lib/b201.js`);
	const orig = e.record.original();
	e.record.set(
		'versions',
		lib.nextVersions(
			orig.get('versions'),
			{ content: orig.getString('content'), by: orig.getString('updated_by'), at: orig.getString('updated') },
			e.record.getString('content'),
			Date.now()
		)
	);
	e.next();
}, 'b201_reports');
