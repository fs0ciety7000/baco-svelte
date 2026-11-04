/**
 * N° de commande d'un bon bus ou taxi (`order_ref`, 4 nov. 2026) : `CMD-` + 6 caractères de l'alphabet de Crockford
 * sans 0 / 1 (ni I, L, O, U), tiré par PocketBase à la création (hook `orders.pb.js`), unique sur les deux types de
 * bon et jamais modifiable. Indépendant du n° TC (`relation`, saisi par l'agent) et du n° de bon séquentiel (`number`).
 */
export const ORDER_REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ORDER_REF_RE = /^CMD-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

export function isOrderRef(v: string): boolean {
  return ORDER_REF_RE.test(v);
}

/**
 * Désignation d'un bon montrée aux agents et aux fournisseurs (décision du 4 nov. 2026 : le n° de commande REMPLACE le
 * n° de bon séquentiel partout où il est affiché ; `number` reste en base pour l'import BACO, les archives et l'unicité).
 * Repli (instance sans le champ, fiche encore sans n°) : « n° 328 », sinon « — ».
 */
export function orderRefLabel(ref: string | null | undefined, number?: number | null): string {
  if (ref) return ref;
  return number ? `n° ${number}` : "—";
}

/**
 * Désignation d'un bon dans la confirmation de suppression : « bus CMD-7K4P2M (TC_123) », « taxi CMD-7K4P2M ». Le n° TC
 * (bus) est ajouté entre parenthèses : il aide à reconnaître le bon mais ne remplace jamais le n° de commande.
 */
export function orderDeleteLabel(
  kind: "bus" | "taxi",
  ref: string | null | undefined,
  number?: number | null,
  relation = "",
): string {
  const rel = relation.trim();
  const tc = kind === "bus" && /^TC_/i.test(rel) ? ` (${rel})` : "";
  return `${kind} ${orderRefLabel(ref, number)}${tc}`;
}

const inAlphabet = (s: string) => [...s].every((c) => ORDER_REF_ALPHABET.includes(c));

/**
 * Saisie de recherche lue comme un n° de commande (complet ou partiel) : « cmd-7k4p », « CMD 7K4P2M », « 7K4P2M ».
 * Rend la forme à chercher (`CMD-7K4P`, `7K4P2M`) ou null. Sans préfixe, il faut les 6 caractères avec au moins une
 * lettre et un chiffre (sinon « 123456 » ou « BRUXEL » seraient pris pour un n° de commande) ; avec le préfixe,
 * 2 caractères suffisent.
 */
export function orderRefQuery(q: string): string | null {
  const t = q.trim().toUpperCase().replace(/\s+/g, "");
  const prefixed = /^CMD-?([0-9A-Z]{0,6})$/.exec(t);
  if (prefixed) {
    const body = prefixed[1] ?? "";
    if (body.length < 2) return t.length >= 3 ? "CMD-" : null;
    return inAlphabet(body) ? `CMD-${body}` : null;
  }
  if (/^[0-9A-Z]{6}$/.test(t) && /[A-Z]/.test(t) && /[0-9]/.test(t) && inAlphabet(t)) return t;
  return null;
}

/**
 * Référence affichée d'un PDF archivé (`order_pdfs.reference`, figée à l'archivage). Les archives d'avant le n° de
 * commande portent « Bon bus n° 328 », « TC_… » ou « Taxi n° 4 » : on montre le n° de commande du bon à la place du
 * n° séquentiel (le n° TC est gardé après lui). La référence stockée n'est pas réécrite (elle sert de clé R2).
 */
export function archiveReference(
  stored: string,
  kind: "bus" | "taxi",
  ref: string | null | undefined,
): string {
  const s = stored.trim();
  if (!ref || s.includes(ref)) return s;
  const prefix = kind === "bus" ? "Bon bus" : "Taxi";
  if (/^(Bon bus|Taxi) n° \d+$/.test(s) || !s) return `${prefix} ${ref}`;
  return `${prefix} ${ref} · ${s}`;
}
