import "server-only";

import type { RecordModel } from "pocketbase";

import { pmrTypeLabel } from "@/lib/orders/mail";
import { can } from "@/lib/permissions";
import { groupLegOf, groupTotal, legOf } from "@/lib/pmr/legs";
import { stationKey } from "@/lib/pmr/model";
import type { SessionUser } from "@/server/auth";

import { listGroups } from "./groups";
import { pbForRequest } from "./orders";
import { equipment, listAssists, type Equipment } from "./pmr";

// Feuille de route du jour par gare (demande du 10 oct. 2026) : prises en charge PMR et groupes à la gare (embarquement
// au départ, débarquement à l'arrivée), rampes de la gare (matériel, par abréviation PtCar) et contacts de l'annuaire qui
// la citent. Nom et téléphone du voyageur seulement avec `pmr:read` (document à détruire après le service).

export type RoadmapRow = {
  time: string;
  train: string;
  io: "IN" | "OUT";
  who: string;
  other: string;
  dossier: string;
  client: string;
  extra: string;
  cancelled: boolean;
};

export type Roadmap = {
  day: string;
  station: string;
  abbr: string;
  rows: RoadmapRow[];
  equipment: Equipment[];
  contacts: { name: string; phone: string; group: string }[];
  withNames: boolean;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const sameStation = (a: string, k: string) => {
  const x = stationKey(a);
  return !!x && (x === k || x.startsWith(`${k} `) || k.startsWith(`${x} `));
};

export async function buildRoadmap(user: SessionUser, day: string, gare: string): Promise<Roadmap> {
  const k = stationKey(gare);
  const canNames = can(user, "pmr:read");
  const pb = await pbForRequest();
  const [assists, groups, ptcar] = await Promise.all([
    can(user, "deplacements:read")
      ? listAssists({ from: day, to: day }, { canPmr: canNames }).then((r) => r.rows)
      : Promise.resolve([]),
    canNames ? listGroups({ from: day, to: day }).then((r) => r.rows) : Promise.resolve([]),
    pb
      .collection("ptcar")
      .getList(1, 20, {
        filter: pb.filter("name_fr ~ {:q} || name_nl ~ {:q} || abbr = {:a}", {
          q: gare,
          a: gare.toUpperCase(),
        }),
        fields: "abbr,name_fr,name_nl",
      })
      .then((r) => r.items)
      .catch(() => [] as RecordModel[]),
  ]);
  const pt =
    ptcar.find((p) => stationKey(str(p.name_fr)) === k || stationKey(str(p.name_nl)) === k) ??
    ptcar.find((p) => str(p.abbr) === gare.toUpperCase()) ??
    null;
  const abbr = pt ? str(pt.abbr) : "";
  const station = pt ? str(pt.name_fr) || gare : gare;

  const rows: RoadmapRow[] = [];
  for (const a of assists) {
    const l = legOf(a);
    const base = {
      train: a.transport === "taxi" ? `Taxi${a.train ? ` ${a.train}` : ""}` : a.train || "—",
      who: `${a.pax} × ${pmrTypeLabel(a.pmrType) || "PMR"}`,
      dossier: a.dicosRef,
      client: canNames ? [a.clientName, a.clientPhone].filter(Boolean).join(" · ") : "",
      extra: [
        a.mission?.meetingPoint ? `RDV ${a.mission.meetingPoint}` : "",
        a.mission?.coach ? `voiture ${a.mission.coach}` : "",
        a.mission?.door ? `porte ${a.mission.door}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      cancelled: a.status === "annulee",
    };
    if (l.inA && sameStation(l.dep, k))
      rows.push({ ...base, time: l.depTime, io: "IN", other: `vers ${l.arr}` });
    if (l.outA && sameStation(l.arr, k))
      rows.push({ ...base, time: l.arrTime, io: "OUT", other: `de ${l.dep}` });
  }
  for (const g of groups) {
    const l = groupLegOf(g);
    const base = {
      train: g.transport === "taxi" ? "Taxi" : g.train || "—",
      who: `Groupe de ${groupTotal(g)}${g.children ? ` (dont ${g.children} enfants)` : ""}`,
      dossier: g.dicosRef,
      client: [g.groupName, g.contactName, g.contactPhone].filter(Boolean).join(" · "),
      extra: [g.meetingPoint ? `RDV ${g.meetingPoint}` : "", g.coach ? `voiture ${g.coach}` : ""]
        .filter(Boolean)
        .join(" · "),
      cancelled: g.status === "annulee",
    };
    if (l.inA && sameStation(l.dep, k))
      rows.push({ ...base, time: l.depTime, io: "IN", other: `vers ${l.arr}` });
    if (l.outA && sameStation(l.arr, k))
      rows.push({ ...base, time: l.arrTime, io: "OUT", other: `de ${l.dep}` });
  }
  rows.sort((x, y) => (x.time || "99").localeCompare(y.time || "99"));

  const [equip, contacts] = await Promise.all([
    canNames && abbr
      ? pb
          .collection("pmr_equipment")
          .getFullList({
            filter: pb.filter("station = {:a}", { a: abbr }),
            sort: "platform",
            expand: "zone",
          })
          .then((r) => r.map(equipment))
          .catch(() => [] as Equipment[])
      : Promise.resolve([] as Equipment[]),
    can(user, "repertoire:read")
      ? pb
          .collection("directory_contacts")
          .getList(1, 15, {
            filter: pb.filter("name ~ {:s} || group ~ {:s} || note ~ {:s}", { s: station }),
            sort: "name",
            fields: "name,phone,group",
          })
          .then((r) =>
            r.items
              .filter((c) =>
                [str(c.name), str(c.group)].some((t) =>
                  ` ${stationKey(t)} `.includes(` ${stationKey(station)} `),
                ),
              )
              .map((c) => ({ name: str(c.name), phone: str(c.phone), group: str(c.group) })),
          )
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  return { day, station, abbr, rows, equipment: equip, contacts, withNames: canNames };
}
