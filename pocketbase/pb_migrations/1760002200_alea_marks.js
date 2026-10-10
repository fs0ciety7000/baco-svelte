/// <reference path="../pb_data/types.d.ts" />
// ALEA « encodé » (demande du 10 oct. 2026) : un agent coche un bloc de l'export ALEA une fois saisi dans ALEA, pour que
// toute l'équipe sache ce qui reste à faire. Une fiche par bloc (`kind` pmr / groupe + clé jour|train|gare|sens), auteur
// forcé, décochable par n'importe quel agent qui écrit des missions. Rien de nominatif ; purgé après 30 jours.

const AUTH = '@request.auth.id != ""';
const ACTIVE = `${AUTH} && @request.auth.role != "disabled"`;
const ADMIN = '(@request.auth.role = "admin" || @request.auth.role = "sysop")';
function can(perm, roles) {
	const granted = `@request.auth.grants ~ '"${perm}"'`;
	const denied = `@request.auth.denies !~ '"${perm}"'`;
	const byRole = roles.map((r) => `@request.auth.role = "${r}"`).join(' || ');
	return `${ACTIVE} && (${ADMIN} || ((${byRole}) && ${denied}) || ${granted})`;
}
const READERS = ['moderator', 'user', 'reader'];
const WRITERS = ['moderator', 'user'];

migrate(
	(app) => {
		app.save(
			new Collection({
				type: 'base',
				name: 'alea_marks',
				listRule: can('deplacements:read', READERS),
				viewRule: can('deplacements:read', READERS),
				createRule: `(${can('deplacements:write', WRITERS)}) && @request.body.marked_by = @request.auth.id`,
				updateRule: null,
				deleteRule: can('deplacements:write', WRITERS),
				fields: [
					{ name: 'day', type: 'text', required: true, max: 10, pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
					{ name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['pmr', 'groupe'] },
					{ name: 'block', type: 'text', required: true, max: 300 },
					{ name: 'marked_by', type: 'relation', required: true, collectionId: app.findCollectionByNameOrId('users').id, maxSelect: 1 },
					{ name: 'created', type: 'autodate', onCreate: true }
				],
				indexes: ['CREATE UNIQUE INDEX idx_alea_marks_block ON alea_marks (kind, block)', 'CREATE INDEX idx_alea_marks_day ON alea_marks (day)']
			})
		);
	},
	(app) => {
		app.delete(app.findCollectionByNameOrId('alea_marks'));
	}
);
