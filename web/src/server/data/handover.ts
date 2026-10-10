import "server-only";

import type { RecordModel } from "pocketbase";

import { plainText } from "@/lib/ops/chat-markdown";
import type {
  Handover,
  HandoverAlea,
  HandoverLeg,
  HandoverLog,
  HandoverOrder,
} from "@/lib/ops/handover";
import { CLOSE_DAYS } from "@/lib/orders/status";
import {
  addDays,
  brusselsDay,
  brusselsTime,
  daysBetween,
  formatDay,
  pbDate,
} from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { aleaEnds, groupEnds, groupLegOf, groupTotal, legOf } from "@/lib/pmr/legs";
import { aleaGroupBlocks, aleaGroups, type AleaGroup } from "@/lib/pmr/model";
import { missionImpact, type TrainStates } from "@/lib/pmr/train-delay";
import type { SessionUser } from "@/server/auth";

import { listGroups, type GroupMission } from "./groups";
import { pbForRequest, toPbInstant } from "./orders";
import { listAssists, listTrainStates, type Assist } from "./pmr";

// Relève de service (demande du 10 oct. 2026) : tout ce qui reste ouvert, avec les droits de l'agent (jeton, règles
// PocketBase). Fenêtre « à venir » : jusqu'à demain 10 h (la relève couvre aussi la nuit et le début de matinée).

export const HANDOVER_CODES = ["DSO", "DSE", "DCE"] as const;
const NAME_TO_CODE: Record<string, string> = {
  "Sud-Ouest": "DSO",
  "Sud-Est": "DSE",
  Centre: "DCE",
};

/** Districts de la relève : `?district=` (code ou « tous »), sinon les districts du jour de l'agent, sinon son district. */
export function handoverDistricts(user: SessionUser, param?: string): string[] {
  if (param === "tous") return [];
  if (param && (HANDOVER_CODES as readonly string[]).includes(param)) return [param];
  const today = brusselsDay();
  const names =
    user.duty_day === today && user.duty_districts?.length
      ? user.duty_districts
      : user.district
        ? [user.district]
        : [];
  return names.map((n) => NAME_TO_CODE[n]).filter((c): c is string => Boolean(c));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const hhmm = (v: string) => {
  const d = pbDate(v);
  return d ? brusselsTime(d) : "";
};

async function orders(
  user: SessionUser,
): Promise<Pick<Handover, "toConfirm" | "toClose" | "running">> {
  const out = {
    toConfirm: [] as HandoverOrder[],
    toClose: [] as HandoverOrder[],
    running: [] as HandoverOrder[],
  };
  const pb = await pbForRequest();
  const today = brusselsDay();
  if (can(user, "otto:read")) {
    const rows = await pb
      .collection("bus_orders")
      .getFullList({
        filter: 'status = "envoye" || status = "en_cours"',
        sort: "order_date",
        fields: "id,status,number,order_date,call_time,origin,destination,relation",
        batch: 200,
      })
      .catch(() => [] as RecordModel[]);
    for (const r of rows) {
      const day = str(r.order_date).slice(0, 10);
      const late = day ? Math.max(0, daysBetween(day, today)) : 0;
      const o: HandoverOrder = {
        id: r.id,
        kind: "bus",
        label: `Bus${r.number ? ` n° ${r.number}` : ""} ${str(r.origin) || "?"} → ${str(r.destination) || "?"}${r.relation ? ` (${str(r.relation)})` : ""}`,
        day: day ? formatDay(day) : "",
        time: str(r.call_time),
        late,
        href: `/commandes/bus/${r.id}`,
      };
      if (r.status === "en_cours") out.running.push(o);
      else if (late >= CLOSE_DAYS) out.toClose.push(o);
      else out.toConfirm.push(o);
    }
  }
  if (can(user, "taxi:read")) {
    const rows = await pb
      .collection("taxi_orders")
      .getFullList({
        filter: 'status = "envoye" || status = "en_cours"',
        sort: "trip_at",
        fields: "id,status,trip_at,from_station,to_station,taxi_name",
        batch: 200,
      })
      .catch(() => [] as RecordModel[]);
    for (const r of rows) {
      const at = pbDate(str(r.trip_at));
      const day = at ? brusselsDay(at) : "";
      const late = day ? Math.max(0, daysBetween(day, today)) : 0;
      const o: HandoverOrder = {
        id: r.id,
        kind: "taxi",
        label: `Taxi ${str(r.from_station) || "?"} → ${str(r.to_station) || "?"}${r.taxi_name ? ` (${str(r.taxi_name)})` : ""}`,
        day: day ? formatDay(day) : "",
        time: at ? brusselsTime(at) : "",
        late,
        href: `/commandes/taxi/${r.id}`,
      };
      if (r.status === "en_cours") out.running.push(o);
      else if (late >= CLOSE_DAYS) out.toClose.push(o);
      else out.toConfirm.push(o);
    }
  }
  return out;
}

function legsOf(
  assists: Assist[],
  groups: GroupMission[],
  states: TrainStates,
  codes: string[],
): HandoverLeg[] {
  const legs: HandoverLeg[] = [];
  const add = (
    m: { id: string; day: string; train: string; transport: string; status: string },
    kind: "pmr" | "groupe",
    l: ReturnType<typeof legOf>,
    detail: string,
    impact: HandoverLeg["impact"],
  ) => {
    if (m.status === "annulee" || m.status === "realisee") return;
    const train = m.transport === "taxi" ? "Taxi" : m.train || "—";
    const push = (io: "IN" | "OUT", station: string, time: string, district: string) => {
      if (codes.length && !codes.includes(district)) return;
      legs.push({
        id: `${m.id}-${io}`,
        kind,
        day: m.day,
        time,
        train,
        station,
        io,
        detail,
        impact,
      });
    };
    if (l.inA) push("IN", l.dep, l.depTime, l.depDistrict);
    if (l.outA) push("OUT", l.arr, l.arrTime, l.arrDistrict);
  };
  for (const a of assists)
    add(a, "pmr", legOf(a), `${a.pax} × ${a.pmrType || "PMR"}`, missionImpact(a, states));
  for (const g of groups)
    add(g, "groupe", groupLegOf(g), `Groupe · ${groupTotal(g)} pers.`, missionImpact(g, states));
  return legs;
}

export async function buildHandover(user: SessionUser, codes: string[]): Promise<Handover> {
  const now = new Date();
  const today = brusselsDay(now);
  const tomorrow = addDays(today, 1);
  const nowHm = brusselsTime(now);
  const canPmr = can(user, "deplacements:read");
  const canGroups = can(user, "pmr:read");
  const pb = await pbForRequest();
  const since = toPbInstant(new Date(now.getTime() - 12 * 3600_000).toISOString());

  const [orderParts, assists, groups, states, marks, logRows] = await Promise.all([
    orders(user),
    canPmr
      ? listAssists({ from: today, to: tomorrow, hideCancelled: true }, { canPmr: false })
          .then((r) => r.rows)
          .catch(() => [] as Assist[])
      : Promise.resolve([] as Assist[]),
    canGroups
      ? listGroups({ from: today, to: tomorrow, hideCancelled: true })
          .then((r) => r.rows)
          .catch(() => [] as GroupMission[])
      : Promise.resolve([] as GroupMission[]),
    canPmr ? listTrainStates(today, today) : Promise.resolve({} as TrainStates),
    canPmr
      ? pb
          .collection("alea_marks")
          .getFullList({
            filter: pb.filter("day = {:d}", { d: today }),
            fields: "kind,block",
            batch: 500,
          })
          .catch(() => [] as RecordModel[])
      : Promise.resolve([] as RecordModel[]),
    can(user, "journal:read")
      ? pb
          .collection("ops_log")
          .getFullList({
            filter: pb.filter(
              'status = "active" && ((urgent = true && created >= {:since}) || pinned_until > {:now} || (source = "irail" && (category = "perturbation" || category = "travaux") && created >= {:since}))',
              { since, now: toPbInstant(now.toISOString()) },
            ),
            sort: "-created",
            fields: "id,body,urgent,pinned_until,source,created,occurred_at",
            batch: 200,
          })
          .catch(() => [] as RecordModel[])
      : Promise.resolve([] as RecordModel[]),
  ]);

  // Missions et groupes à venir : aujourd'hui à partir de maintenant, demain jusqu'à 10 h.
  const allLegs = legsOf(assists, groups, states, codes);
  const upcomingAll = allLegs
    .filter((l) =>
      l.day === today
        ? !l.time || l.time >= nowHm
        : l.day === tomorrow && !!l.time && l.time < "10:00",
    )
    .sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
  // Trains en retard : missions du jour (pas encore passées à la gare assistée).
  const delays = allLegs
    .filter((l) => l.day === today && l.impact && !l.impact.left)
    .sort(
      (a, b) =>
        Number(b.impact!.cancelled) - Number(a.impact!.cancelled) ||
        b.impact!.delay - a.impact!.delay,
    );

  // ALEA du jour non encodés (mêmes blocs que l'export, par district retenu).
  const todayAssists = assists.filter((a) => a.day === today);
  const todayGroups = groups.filter((g) => g.day === today);
  const scope = codes.length ? codes : [""];
  const uniq = (blocks: AleaGroup[]) => [...new Map(blocks.map((b) => [b.key, b])).values()];
  const pmrBlocks = uniq(scope.flatMap((c) => aleaGroups(aleaEnds(todayAssists, c))));
  const groupBlocks = canGroups
    ? uniq(scope.flatMap((c) => aleaGroupBlocks(groupEnds(todayGroups, c))))
    : [];
  const marked = new Set(marks.map((m) => `${str(m.kind)}|${str(m.block)}`));
  const alea: HandoverAlea[] = [
    ...pmrBlocks
      .filter((b) => !marked.has(`pmr|${b.key}`))
      .map((b) => ({ kind: "pmr" as const, b })),
    ...groupBlocks
      .filter((b) => !marked.has(`groupe|${b.key}`))
      .map((b) => ({ kind: "groupe" as const, b })),
  ]
    .sort((x, y) => x.b.time.localeCompare(y.b.time))
    .map(({ kind, b }) => ({ kind, train: b.train, station: b.station, io: b.io, time: b.time }));

  const log: HandoverLog[] = [];
  const disturbances: HandoverLog[] = [];
  for (const r of logRows) {
    const item: HandoverLog = {
      id: r.id,
      time: hhmm(str(r.occurred_at) || str(r.created)),
      label: plainText(str(r.body)).replace(/\s+/g, " ").slice(0, 160),
      urgent: r.urgent === true,
      pinned: !!r.pinned_until && (pbDate(str(r.pinned_until))?.getTime() ?? 0) > now.getTime(),
    };
    if (r.source === "irail" && !item.pinned && !item.urgent) disturbances.push(item);
    else log.push(item);
  }

  return {
    generatedAt: now.toISOString(),
    today,
    districts: codes,
    ...orderParts,
    upcoming: upcomingAll.slice(0, 40),
    upcomingTotal: upcomingAll.length,
    delays,
    alea: alea.slice(0, 40),
    aleaTotal: alea.length,
    log,
    disturbances,
  };
}
