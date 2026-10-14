// Numéro de dossier DICOS d'un taxi PMR (demande du 14 oct. 2026) : format AAAA-MM-JJ-NNNN (ex. 2026-10-14-0134), le
// même que `pmr_assists.dicos_ref`. Validation « douce » : une saisie hors format n'empêche jamais l'enregistrement, un
// message l'explique ; une saisie sans ambiguïté est remise au format (« 20261014134 », « 2026-10-14-134 »,
// « 2026/10/14/134 »).

export const DOSSIER_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;
export const DOSSIER_HINT = "Format AAAA-MM-JJ-NNNN (ex. 2026-10-14-0134)";

export type DossierCheck = { value: string; ok: boolean; message?: string };

function build(y: string, m: string, d: string, n: string): string | null {
  const mm = m.padStart(2, "0");
  const dd = d.padStart(2, "0");
  if (y.length !== 4 || mm.length !== 2 || dd.length !== 2 || n.length < 1 || n.length > 4)
    return null;
  const year = Number(y);
  const month = Number(mm);
  const day = Number(dd);
  if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mm}-${dd}-${n.padStart(4, "0")}`;
}

/** Remet un n° de dossier au format si c'est sans ambiguïté ; sinon renvoie la saisie telle quelle avec un message. */
export function normalizeDossier(raw: string): DossierCheck {
  const s = raw.trim();
  if (!s) return { value: "", ok: true };
  // Groupes séparés (tiret, barre, point, espace) : 4 + 1-2 + 1-2 + 1-4 chiffres.
  const groups = s.split(/[\s./_-]+/).filter(Boolean);
  if (groups.length === 4 && groups.every((g) => /^\d+$/.test(g))) {
    const [y, m, d, n] = groups as [string, string, string, string];
    const v = m.length <= 2 && d.length <= 2 ? build(y, m, d, n) : null;
    if (v) return { value: v, ok: true };
  }
  // Chiffres seuls : la date fait toujours 8 chiffres (AAAAMMJJ), le reste (1 à 4 chiffres) est le numéro.
  if (/^\d{9,12}$/.test(s)) {
    const v = build(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8), s.slice(8));
    if (v) return { value: v, ok: true };
  }
  return { value: s, ok: false, message: `N° de dossier inattendu. ${DOSSIER_HINT}.` };
}
