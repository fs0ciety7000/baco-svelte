import "server-only";

import { DUTY_SHORT } from "@/lib/ops/log";
import type { Timeline, TimelineItem } from "@/lib/ops/timeline";
import { brusselsDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { groupLegOf, groupTotal, legOf } from "@/lib/pmr/legs";
import { stationKey } from "@/lib/pmr/model";
import { missionImpact, type TrainStates } from "@/lib/pmr/train-delay";
import type { SessionUser } from "@/server/auth";

import { listGroups, type GroupMission } from "./groups";
import { listOrders } from "./orders";
import { listAssists, listTrainStates, type Assist } from "./pmr";

// Frise « Ma journée » (demande du 10 oct. 2026) : un élément par prise en charge (embarquement à la gare de départ,
// débarquement à l'arrivée) et par bon de bus / taxi du jour, avec les droits de l'agent. Aucun nom de voyageur.

const matches = (station: string, q: string) => {
  if (!q) return true;
  const k = stationKey(station);
  return k === q || k.startsWith(`${q} `) || k.startsWith(q);
};

export async function buildTimeline(
  user: SessionUser,
  day: string,
  codes: string[],
  gare: string,
): Promise<Timeline> {
  const canPmr = can(user, "deplacements:read");
  const canGroups = can(user, "pmr:read");
  const canBus = can(user, "otto:read");
  const canTaxi = can(user, "taxi:read");
  const q = stationKey(gare);

  const [assists, groups, states, orders] = await Promise.all([
    canPmr
      ? listAssists({ from: day, to: day, hideCancelled: true }, { canPmr: false })
          .then((r) => r.rows)
          .catch(() => [] as Assist[])
      : Promise.resolve([] as Assist[]),
    canGroups
      ? listGroups({ from: day, to: day, hideCancelled: true })
          .then((r) => r.rows)
          .catch(() => [] as GroupMission[])
      : Promise.resolve([] as GroupMission[]),
    // Retards suivis le jour même seulement (cron `mission-trains`).
    canPmr && day === brusselsDay()
      ? listTrainStates(day, day)
      : Promise.resolve({} as TrainStates),
    canBus || canTaxi
      ? listOrders(
          { from: day, to: day, limit: 200 },
          { userId: user.id, canBus, canTaxi, canPmr: false },
        )
          .then((r) => r.rows)
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const items: TimelineItem[] = [];
  const stations = new Set<string>();
  const legItems = (
    m: Assist | GroupMission,
    kind: "pmr" | "groupe",
    leg: ReturnType<typeof legOf>,
    detail: string,
    href: string,
  ) => {
    if (m.status === "annulee") return;
    const train = m.transport === "taxi" ? "Taxi" : m.train || "—";
    const add = (io: "IN" | "OUT", station: string, time: string, district: string) => {
      if (!time || !station || station === "—") return;
      if (codes.length && !codes.includes(district)) return;
      stations.add(station);
      if (!matches(station, q)) return;
      // Retard propre au bout : départ pour l'embarquement, arrivée pour le débarquement.
      const impact = missionImpact(
        { ...m, inAssist: io === "IN", outAssist: io === "OUT" },
        states,
      );
      items.push({
        id: `${kind}-${m.id}-${io}`,
        kind,
        start: time,
        end: "",
        train,
        title: `${io === "IN" ? "Embarquement" : "Débarquement"} à ${station}`,
        detail,
        io,
        station,
        district,
        impact,
        href,
      });
    };
    if (leg.inA) add("IN", leg.dep, leg.depTime, leg.depDistrict);
    if (leg.outA) add("OUT", leg.arr, leg.arrTime, leg.arrDistrict);
  };
  const q4 = (train: string, station: string) =>
    encodeURIComponent(train.replace(/\D/g, "") || station);
  for (const a of assists)
    legItems(
      a,
      "pmr",
      legOf(a),
      `${a.pax} × ${a.pmrType || "PMR"}${a.status === "realisee" ? " · réalisée" : ""}`,
      `/pmr?du=${day}&au=${day}&q=${q4(a.train, a.station)}`,
    );
  for (const g of groups)
    legItems(
      g,
      "groupe",
      groupLegOf(g),
      `Groupe · ${groupTotal(g)} pers.`,
      `/groupes?du=${day}&au=${day}&q=${q4(g.train, g.station)}`,
    );

  for (const o of orders) {
    if (o.status === "brouillon" || o.status === "annule") continue;
    const district = DUTY_SHORT[o.district] ?? "";
    if (codes.length && district && !codes.includes(district)) continue;
    if (o.origin) stations.add(o.origin);
    if (q && !matches(o.origin, q) && !matches(o.destination, q)) continue;
    const planned = o.buses
      .filter((b) => !b.cancelled && b.planned)
      .map((b) => b.planned!)
      .sort();
    const start = planned[0] || o.time;
    if (!start) continue;
    items.push({
      id: `${o.kind}-${o.id}`,
      kind: o.kind,
      start,
      end: planned.length > 1 ? planned[planned.length - 1]! : "",
      train: o.relation || (o.kind === "bus" ? "Bus" : "Taxi"),
      title: `${o.origin || "?"} → ${o.destination || "?"}`,
      detail:
        o.kind === "bus"
          ? `${o.busCount} bus${o.company ? ` · ${o.company}` : ""}${o.number ? ` · n° ${o.number}` : ""}`
          : `${o.company || "Taxi"}${o.number ? ` · n° ${o.number}` : ""}`,
      io: "",
      station: o.origin,
      district,
      impact: null,
      href: `/commandes/${o.kind}/${o.id}`,
    });
  }

  items.sort((x, y) => x.start.localeCompare(y.start) || x.kind.localeCompare(y.kind));
  return {
    day,
    generatedAt: new Date().toISOString(),
    items,
    stations: [...stations].sort((a, b) => a.localeCompare(b, "fr")).slice(0, 200),
  };
}
