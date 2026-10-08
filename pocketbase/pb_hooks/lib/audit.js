// Écriture d'une ligne d'audit (utilisé par audit.pb.js).
// Les champs sensibles des comptes ne sont jamais recopiés dans le journal.
const HIDDEN = ['password', 'tokenKey', 'passwordConfirm', 'oldPassword', 'created', 'updated'];

function snapshot(record) {
	const out = {};
	const data = JSON.parse(JSON.stringify(record));
	for (const k of Object.keys(data)) {
		if (HIDDEN.indexOf(k) === -1) out[k] = data[k];
	}
	return out;
}

function diff(before, after) {
	const changes = {};
	const keys = Object.keys(Object.assign({}, before, after));
	for (const k of keys) {
		if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
			changes[k] = { old: before[k] === undefined ? null : before[k], new: after[k] === undefined ? null : after[k] };
		}
	}
	return changes;
}

function write(app, action, record, before, after, auth) {
	const changes = diff(before, after);
	if (action === 'update' && Object.keys(changes).length === 0) return;
	const row = new Record(app.findCollectionByNameOrId('audit_log'));
	row.set('action', action);
	row.set('collection', record.collection().name);
	row.set('record', record.id);
	row.set('user', auth ? auth.id : '');
	row.set('changes', changes);
	row.set('at', new Date().toISOString());
	app.save(row);
}

module.exports = { write, diff, snapshot };
