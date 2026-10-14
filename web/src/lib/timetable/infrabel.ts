// Données ouvertes d'Infrabel (CC0) : « ruwe gegevens van stiptheid » (J-1, ou fichier mensuel), une ligne par train et
// par point de passage. On n'en garde, par n° de train, que la relation (« IC 14 »), le sens et le n° de ligne
// d'infrastructure à chaque point ; les arrêts et horaires viennent du GTFS (Infrabel reflète le réalisé : détours).

import { lineNorm, relationName } from "./model";

/** Point opérationnel Infrabel : nom long NL (clé des données de ponctualité) → noms commerciaux. */
export type OpPoint = { fr: string; nl: string; station: boolean };

/** Chemin d'un train lu chez Infrabel. */
export type TrainPath = {
  number: number;
  /** Jour de circulation observé (AAAA-MM-JJ). */
  day: string;
  relation: string;
  direction: string;
  /** Lignes empruntées, dans l'ordre (sans répétition consécutive). */
  lines: string[];
  /**
   * Gares (et haltes) traversées : nom commercial FR (`n`), NL s'il diffère (`k`), ligne au départ du point (`l`),
   * position dans `lines` à ce point (`i` : lignes d'un trajet partiel = tranche entre son premier et son dernier arrêt).
   */
  points: { n: string; k?: string; l: string; i?: number }[];
};

/** Table des points opérationnels (CSV `operationele-punten-van-het-netwerk`, séparateur « ; »). */
export function opPointsFrom(rows: Iterable<Record<string, string>>): Map<string, OpPoint> {
  const map = new Map<string, OpPoint>();
  for (const r of rows) {
    const key = String(r.longnamedutch ?? "")
      .trim()
      .toUpperCase();
    if (!key) continue;
    const cls = String(r.classification ?? "").trim();
    map.set(key, {
      fr: String(r.commerciallongnamefrench ?? "").trim(),
      nl: String(r.commerciallongnamedutch ?? "").trim(),
      station: cls === "Station" || cls === "Stopplaats",
    });
  }
  return map;
}

const MONTHS: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/** « 2026-10-13 » ou « 13OCT2026 » → « 2026-10-13 » ; autre → « ». */
export function infrabelDay(raw: string): string {
  const s = String(raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})([A-Z]{3})(\d{4})$/.exec(s.toUpperCase());
  if (m && MONTHS[m[2]!]) return `${m[3]}-${MONTHS[m[2]!]}-${m[1]}`;
  return "";
}

/** « 7:43:00 » → « 07:43:00 ». */
const padTime = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(t ?? "").trim());
  return m ? `${m[1]!.padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}` : "";
};

type Raw = {
  day: string;
  relation: string;
  direction: string;
  pts: { t: string; nl: string; la: string; ld: string }[];
};

/**
 * Collecteur : reçoit les lignes une à une (en flux), garde pour chaque n° de train le jour observé le plus récent.
 * `since` (AAAA-MM-JJ) ignore les jours plus anciens (lecture de la fin d'un fichier mensuel).
 */
export function pathCollector(opts: { since?: string } = {}) {
  const trains = new Map<number, Raw>();
  return {
    add(r: Record<string, string>) {
      const number = Number(r.train_no);
      if (!Number.isInteger(number) || number <= 0) return;
      const day = infrabelDay(r.datdep ?? "");
      if (!day || (opts.since && day < opts.since)) return;
      let t = trains.get(number);
      if (t && t.day > day) return;
      if (!t || t.day < day) {
        t = { day, relation: "", direction: "", pts: [] };
        trains.set(number, t);
      }
      if (!t.relation) t.relation = String(r.relation ?? "").trim();
      if (!t.direction) t.direction = String(r.relation_direction ?? "").trim();
      const da = infrabelDay(r.planned_date_arr ?? "");
      const dd = infrabelDay(r.planned_date_dep ?? "");
      const ta = padTime(r.planned_time_arr ?? "");
      const td = padTime(r.planned_time_dep ?? "");
      const at = td ? `${dd || da || day}T${td}` : ta ? `${da || dd || day}T${ta}` : "";
      t.pts.push({
        t: at,
        nl: String(r.ptcar_lg_nm_nl ?? "")
          .trim()
          .toUpperCase(),
        la: lineNorm(r.line_no_arr ?? ""),
        ld: lineNorm(r.line_no_dep ?? ""),
      });
    },
    /** Chemins normalisés (gares en nom FR grâce aux points opérationnels). */
    paths(ops: Map<string, OpPoint>): TrainPath[] {
      const out: TrainPath[] = [];
      for (const [number, t] of trains) {
        const pts = [...t.pts].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
        const lines: string[] = [];
        const push = (l: string) => {
          if (l && lines[lines.length - 1] !== l) lines.push(l);
        };
        const points: TrainPath["points"] = [];
        for (const p of pts) {
          push(p.la);
          push(p.ld);
          const op = ops.get(p.nl);
          if (op?.station && op.fr) {
            const pt: TrainPath["points"][number] = {
              n: op.fr,
              l: p.ld || p.la,
              i: Math.max(0, lines.length - 1),
            };
            if (op.nl && op.nl !== op.fr) pt.k = op.nl;
            points.push(pt);
          }
        }
        out.push({
          number,
          day: t.day,
          relation: relationName(t.relation),
          direction: t.direction.replace(/^[^:]*:\s*/, ""),
          lines,
          points,
        });
      }
      return out;
    },
    get size() {
      return trains.size;
    },
  };
}
