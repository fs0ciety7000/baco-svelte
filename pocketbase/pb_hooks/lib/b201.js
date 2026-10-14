// B201 (15 oct. 2026) : notes du jour en Markdown (`b201_reports.content`) et versions du jour (`versions`), écrites
// par le hook `b201.pb.js` seulement (la valeur envoyée par un client est ignorée). Miroir de `web/src/lib/ops/b201.ts`.

const MAX_VERSIONS = 30;
/** Une nouvelle version n'est gardée qu'après 10 min du même auteur (l'enregistrement automatique écrit souvent). */
const SAME_AUTHOR_MS = 10 * 60 * 1000;
const MAX_SIZE = 180000;

function parse(raw) {
	if (raw === null || raw === undefined || raw === '') return [];
	try {
		const v = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
		return Array.isArray(v) ? v.filter((x) => x && typeof x.at === 'string' && typeof x.content === 'string') : [];
	} catch (_) {
		return [];
	}
}

function time(v) {
	const t = Date.parse(String(v || '').replace(' ', 'T'));
	return isNaN(t) ? 0 : t;
}

/**
 * Versions après un enregistrement : l'état précédent est gardé quand le texte change et que l'auteur change, ou que
 * la dernière version gardée a plus de 10 min. Plus récente d'abord, 30 au plus, taille bornée.
 * `prev` = { content, by, at } (fiche avant l'écriture), `next` = nouveau texte, `now` = instant (ms).
 */
function nextVersions(stored, prev, next, now) {
	let list = parse(stored);
	const before = String(prev.content || '');
	if (String(next || '') !== before && before.trim()) {
		const last = list[0];
		const keep = !last || last.by !== prev.by || now - time(last.at) >= SAME_AUTHOR_MS;
		if (keep) list.unshift({ at: String(prev.at || ''), by: String(prev.by || ''), content: before });
	}
	list = list.slice(0, MAX_VERSIONS);
	while (list.length > 1 && JSON.stringify(list).length > MAX_SIZE) list.pop();
	return list;
}

const SECTIONS = [
	['matin', 'Matin'],
	['apres_midi', 'Après-midi'],
	['nuit', 'Nuit'],
	['suivant', 'Pour le service suivant']
];

/** Anciens commentaires par période → Markdown (miroir de `legacyNotesToMarkdown`). */
function legacyToMarkdown(notes) {
	let n = notes;
	if (typeof n === 'string') {
		try {
			n = JSON.parse(n);
		} catch (_) {
			return '';
		}
	}
	if (!n || typeof n !== 'object') return '';
	return SECTIONS.map(([k, title]) => {
		const v = typeof n[k] === 'string' ? n[k].replace(/\r\n?/g, '\n').trim() : '';
		return v ? `### ${title}\n${v}` : '';
	})
		.filter(Boolean)
		.join('\n\n');
}

module.exports = { nextVersions, legacyToMarkdown, parse, MAX_VERSIONS, SAME_AUTHOR_MS };
