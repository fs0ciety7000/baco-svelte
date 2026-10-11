// Changements DICOS de dernière minute (demande du 11 oct. 2026) : à l'ingestion, une mission (ou un groupe) nouvelle,
// annulée ou dont l'heure change, aujourd'hui et dans les 3 heures, est notifiée aux agents des districts de la gare
// concernée (type `dicos`, sans nom de voyageur). Miroir de `dicosChanges` dans `pocketbase/pb_hooks/lib/alerts.js`
// (hooks de `pmr_assists` et `group_missions`) : toute modification se fait des deux côtés. Pur, testé.

export const DICOS_HORIZON_MIN = 180;

export type ChangeSnapshot = {
  day: string;
  status: string;
  time: string;
  arr_time: string;
  station: string;
  other_station: string;
  district: string;
  arr_district: string;
  in_assist: boolean;
  out_assist: boolean;
};

export type DicosChange = {
  change: "new" | "cancelled" | "time";
  io: "IN" | "OUT";
  station: string;
  time: string;
  /** Ancienne heure (changement d'heure). */
  from: string;
  district: string;
};

type LegPoint = Omit<DicosChange, "change" | "from">;

const minutesOf = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

/** Bouts assistés : IN à la gare de départ (aussi sans sens connu), OUT à la gare d'arrivée. */
export function changeLegs(r: ChangeSnapshot): LegPoint[] {
  const out: LegPoint[] = [];
  if (r.in_assist || !r.out_assist)
    out.push({ io: "IN", station: r.station, time: r.time, district: r.district });
  if (r.out_assist)
    out.push({ io: "OUT", station: r.other_station, time: r.arr_time, district: r.arr_district });
  return out;
}

function soon(day: string, time: string, today: string, nowMin: number): boolean {
  if (day !== today) return false;
  const m = minutesOf(time);
  return m >= 0 && m - nowMin >= 0 && m - nowMin <= DICOS_HORIZON_MIN;
}

/**
 * Changements entre l'état avant (`null` = nouvelle fiche) et après une ingestion. `allowNew` : une synchro complète du
 * jour a déjà eu lieu (sinon la première synchro du matin signalerait toutes les missions comme nouvelles).
 */
export function dicosChanges(
  before: ChangeSnapshot | null,
  after: ChangeSnapshot,
  today: string,
  nowMin: number,
  allowNew: boolean,
): DicosChange[] {
  const out: DicosChange[] = [];
  const push = (change: DicosChange["change"], l: LegPoint, day: string, from = "") => {
    if (soon(day, l.time, today, nowMin)) out.push({ change, ...l, from });
  };
  if (!before) {
    if (allowNew && after.status === "prevue")
      for (const l of changeLegs(after)) push("new", l, after.day);
    return out;
  }
  const wasCancelled = before.status === "annulee";
  const isCancelled = after.status === "annulee";
  if (!wasCancelled && isCancelled) {
    if (before.status === "prevue")
      for (const l of changeLegs(before)) push("cancelled", l, before.day);
    return out;
  }
  if (after.status !== "prevue") return out;
  if (wasCancelled) {
    for (const l of changeLegs(after)) push("new", l, after.day);
    return out;
  }
  if (before.status !== "prevue") return out;
  const prev = changeLegs(before);
  const next = changeLegs(after);
  for (const a of next) {
    const b = prev.find((x) => x.io === a.io);
    if (!b) push("new", a, after.day);
    else if (a.time !== b.time || after.day !== before.day) {
      if (soon(after.day, a.time, today, nowMin) || soon(before.day, b.time, today, nowMin))
        out.push({ change: "time", ...a, from: b.time, district: a.district || b.district });
    }
  }
  for (const b of prev) if (!next.some((x) => x.io === b.io)) push("cancelled", b, before.day);
  return out;
}
