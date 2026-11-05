// Annuaire v2 (5 nov. 2026) : Service / Fonction / Zone séparés (migration 1760005200_directory_v2.js).
//
// `mapLegacy(category, group, zone)` traduit les anciens champs texte libres de BACO (catégorie, groupe, zone mélangés :
// « MIA » + « SPI FMS », « RCC-OCC » + « PACO » + « FCR », « B-TO » + « Operator Shunting Yards zone FMS »…) en
// `{ service, function, zone }` (+ `hours` : plage horaire à reporter dans la remarque). Utilisé par :
//   - la migration (reprise des fiches existantes par SQL, sans toucher `updated`) ;
//   - l'import différentiel (`lib/import-delta.js`, champs repris : mêmes valeurs que la migration, donc pas de faux écart) ;
//   - le miroir web `web/src/lib/referentiels/directory-model.ts` (même résultat, vérifié par `directory-model.test.ts`).
// Fonction pure, sans dépendance JSVM.

// Services d'origine (clé figée, libellé, ordre, fonctions proposées) : amorce de `directory_services`.
const SEED = [
	['gares', 'Gares & accueil', 10, ['SPI', 'CPI', 'OPI', 'PA', 'TL/MPI']],
	['trafic', 'Trafic RCC-OCC', 20, ['RTS ROC', 'RTS Block', 'RTS OCC', 'Répartiteurs', 'Permanence 3x8', 'TLI', 'PACO', 'DPD', 'B4YOU', 'CPC']],
	['triage', 'Triage B-TO', 30, ['Operator', 'Collaborator']],
	['pmr', 'Assistance PMR', 40, ['Borne PMR', 'PMR']],
	['support', 'Services support', 50, ['B-CS', 'BAG', 'Agent Fires', 'Help desk', 'B-Clean UP', 'TS', 'Formateurs', 'Soutien psychologique']],
	['etranger', 'Étranger', 60, ['France']]
];

const KEY_RE = /^[a-z][a-z0-9_-]{1,29}$/;
const FUNCTION_MAX = 60;
const ZONE_MAX = 60;
const B_CLEAN_HOURS = '9 h – 17 h';

const clean = (v) =>
	String(v === null || v === undefined ? '' : v)
		.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

// Repli (casse, accents) pour comparer les libellés.
const fold = (v) =>
	clean(v)
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase();

/** Code de zone en majuscules (« fms » → « FMS » ; « FR / LK » gardé tel quel). */
function normZone(zone) {
	return clean(zone).toUpperCase().slice(0, ZONE_MAX);
}

/** Zone nommée par une gare dans un ancien groupe (« Zone Mons ») → code. */
const ZONE_BY_NAME = { mons: 'FMS', charleroi: 'FCR', tournai: 'FTY', namur: 'FNR', liege: 'FL' };
const zoneCode = (word) => ZONE_BY_NAME[fold(word)] || normZone(word);

function out(service, fn, zone, hours) {
	const r = { service: service, function: clean(fn).slice(0, FUNCTION_MAX), zone: normZone(zone) };
	if (hours) r.hours = hours;
	return r;
}

/**
 * Anciens champs BACO → `{ service, function, zone, hours? }`. Un cas inconnu donne un service vide (« à classer ») et la
 * fonction = l'ancien groupe.
 */
function mapLegacy(category, group, zone) {
	const c = fold(category);
	const g = clean(group);
	const gf = fold(group);
	const z = normZone(zone);

	if (gf === 'france') return out('etranger', 'France', z);
	if (gf === 'help desk' || gf === 'helpdesk') return out('support', 'Help desk', z);
	if (gf === 'borne pmr' || c === 'borne pmr') return out('pmr', 'Borne PMR', z);

	if (c === 'mia') {
		const m = /^(spi|cpi|opi|pa)\s+(.+)$/i.exec(g);
		if (m) return out('gares', m[1].toUpperCase(), z || m[2]);
		if (/^tl\s*\/\s*mpi$/i.test(g)) return out('gares', 'TL/MPI', z);
		return out('', g, z);
	}
	if (c === 'rcc-occ' && g) return out('trafic', gf === 'repartiteurs' ? 'Répartiteurs' : g, z);
	if (c === 'b-to') {
		const m = /^(operator|collaborator)\b.*?\bzone\s+(\S+)\s*$/i.exec(g);
		if (m) return out('triage', m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(), z || zoneCode(m[2]));
		const zm = /^zone\s+(\S+)$/i.exec(g);
		if (zm) return out('triage', '', z || zoneCode(zm[1]));
		return out('triage', g, z);
	}
	if (c === 'autre') {
		if (gf === 'pmr') return out('pmr', 'PMR', z);
		if (/^b-clean up\b/i.test(g)) return out('support', 'B-Clean UP', z, B_CLEAN_HOURS);
		if (gf === 'charleroi') return out('support', '', z || 'FCR');
		return out('support', g, z);
	}
	return out('', g, z);
}

/** Remarque après reprise : la plage horaire (« 9 h – 17 h ») en tête si elle n'y figure pas déjà. */
function legacyNote(note, mapped) {
	const n = String(note === null || note === undefined ? '' : note);
	if (!mapped || !mapped.hours) return n;
	const has = /9\s*h?\s*(00)?\s*(-|–|à)\s*17\s*h?/i.test(n);
	if (has) return n;
	return (n.trim() ? `${mapped.hours} · ${n}` : mapped.hours).slice(0, 1000);
}

/** Liste de fonctions proposées nettoyée : texte, sans doublon (casse), 40 au plus. Null si la valeur n'est pas une liste. */
function cleanFunctions(list) {
	if (!Array.isArray(list)) return null;
	const seen = {};
	const outList = [];
	for (const v of list) {
		if (typeof v !== 'string') continue;
		const s = clean(v).slice(0, FUNCTION_MAX);
		const k = fold(s);
		if (!s || seen[k]) continue;
		seen[k] = true;
		outList.push(s);
		if (outList.length >= 40) break;
	}
	return outList;
}

module.exports = { SEED, KEY_RE, FUNCTION_MAX, B_CLEAN_HOURS, mapLegacy, legacyNote, normZone, cleanFunctions, clean };
