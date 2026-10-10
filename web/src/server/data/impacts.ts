import "server-only";

import { brusselsDay } from "@/lib/orders/time";
import { DUTY_SHORT } from "@/lib/ops/log";
import { can } from "@/lib/permissions";
import { missionImpact, type Impact } from "@/lib/pmr/train-delay";
import type { SessionUser } from "@/server/auth";

import { listGroups } from "./groups";
import { dicosSyncState, listAssists, listTrainStates } from "./pmr";

// Widget d'accueil « Missions impactées » (demande du 10 oct. 2026) : missions PMR et groupes du jour dont le train est en
// retard (≥ 5 min) ou supprimé à la gare assistée, limitées aux districts du jour de l'agent (sinon son district, sinon
// tous). Pire situation d'abord.

export type ImpactedMission = {
  id: string;
  kind: "pmr" | "groupe";
  train: string;
  time: string;
  route: string;
  detail: string;
  impact: Impact;
  href: string;
};

function myDistrictCodes(user: SessionUser, today: string): string[] {
  const names =
    user.duty_day === today && user.duty_districts?.length
      ? user.duty_districts
      : user.district
        ? [user.district]
        : [];
  return names.map((n) => DUTY_SHORT[n]).filter((c): c is string => Boolean(c));
}

export async function impactedMissions(user: SessionUser): Promise<ImpactedMission[] | null> {
  if (!can(user, "deplacements:read")) return null;
  const today = brusselsDay();
  const states = await listTrainStates(today, today);
  if (!Object.keys(states).length) return [];
  const codes = myDistrictCodes(user, today);
  const mine = (dep: string, arr: string) =>
    !codes.length || codes.includes(dep) || codes.includes(arr);
  const [assists, groups] = await Promise.all([
    listAssists(
      { from: today, to: today, hideCancelled: true },
      // Le widget n'affiche aucun nom : pas de lecture du détail nominatif.
      { canPmr: false },
    ).catch(() => ({ rows: [] })),
    can(user, "pmr:read")
      ? listGroups({ from: today, to: today, hideCancelled: true }).catch(() => ({ rows: [] }))
      : { rows: [] },
  ]);
  const out: ImpactedMission[] = [];
  for (const a of assists.rows) {
    if (a.status === "realisee" || !mine(a.district, a.arrDistrict)) continue;
    const impact = missionImpact(a, states);
    if (!impact || impact.left) continue;
    out.push({
      id: a.id,
      kind: "pmr",
      train: a.train,
      time: a.time,
      route: `${a.station || "?"} → ${a.otherStation || "?"}`,
      detail: `${a.pax} × ${a.pmrType || "PMR"}`,
      impact,
      href: `/pmr?q=${encodeURIComponent(a.train.replace(/\D/g, ""))}`,
    });
  }
  for (const g of groups.rows) {
    if (g.status === "realisee" || !mine(g.district, g.arrDistrict)) continue;
    const impact = missionImpact(g, states);
    if (!impact || impact.left) continue;
    out.push({
      id: g.id,
      kind: "groupe",
      train: g.train,
      time: g.time || g.arrTime,
      route: `${g.station || "?"} → ${g.otherStation || "?"}`,
      detail: `Groupe · ${g.adults + g.children + g.seniors} pers.`,
      impact,
      href: `/groupes?q=${encodeURIComponent(g.train.replace(/\D/g, ""))}`,
    });
  }
  return out.sort(
    (x, y) =>
      Number(y.impact.cancelled) - Number(x.impact.cancelled) ||
      y.impact.delay - x.impact.delay ||
      x.time.localeCompare(y.time),
  );
}

// Widget d'accueil « Aujourd'hui en PMR » (demande du 10 oct. 2026) : volumes du jour, prochaines prises en charge dans
// les districts de l'agent (avec le retard du train), fraîcheur de la synchro DICOS. Aucun nom.

export type TodayPmr = {
  missions: number;
  groups: number;
  impacted: number;
  lastSync: string | null;
  next: {
    id: string;
    kind: "pmr" | "groupe";
    train: string;
    time: string;
    station: string;
    io: "IN" | "OUT";
    detail: string;
    impact: Impact | null;
    href: string;
  }[];
};

export async function todayPmr(user: SessionUser): Promise<TodayPmr | null> {
  if (!can(user, "deplacements:read")) return null;
  const today = brusselsDay();
  const codes = myDistrictCodes(user, today);
  const nowHm = new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const [assists, groups, states, sync] = await Promise.all([
    listAssists({ from: today, to: today, hideCancelled: true }, { canPmr: false }).catch(() => ({
      rows: [],
    })),
    can(user, "pmr:read")
      ? listGroups({ from: today, to: today, hideCancelled: true }).catch(() => ({ rows: [] }))
      : { rows: [] },
    listTrainStates(today, today),
    dicosSyncState("missions", today, today).catch(() => null),
  ]);
  const legs: TodayPmr["next"] = [];
  const push = (
    m: {
      id: string;
      train: string;
      transport: string;
      day: string;
      station: string;
      otherStation: string;
      time: string;
      arrTime: string;
      district: string;
      arrDistrict: string;
      inAssist: boolean;
      outAssist: boolean;
      status: string;
    },
    kind: "pmr" | "groupe",
    detail: string,
  ) => {
    if (m.status === "realisee") return;
    const impact = missionImpact(m, states);
    const add = (io: "IN" | "OUT", station: string, time: string, district: string) => {
      if (!time || time < nowHm) return;
      if (codes.length && !codes.includes(district)) return;
      legs.push({
        id: `${m.id}-${io}`,
        kind,
        train: m.transport === "taxi" ? "Taxi" : m.train,
        time,
        station,
        io,
        detail,
        impact,
        href:
          kind === "pmr"
            ? `/pmr?q=${encodeURIComponent(m.train.replace(/\D/g, "") || station)}`
            : `/groupes?q=${encodeURIComponent(m.train.replace(/\D/g, "") || station)}`,
      });
    };
    if (m.inAssist || !m.outAssist) add("IN", m.station, m.time, m.district);
    if (m.outAssist) add("OUT", m.otherStation, m.arrTime, m.arrDistrict);
  };
  for (const a of assists.rows) push(a, "pmr", `${a.pax} × ${a.pmrType || "PMR"}`);
  for (const g of groups.rows)
    push(g, "groupe", `Groupe · ${g.adults + g.children + g.seniors} pers.`);
  legs.sort((x, y) => x.time.localeCompare(y.time));
  const impacted = [...assists.rows, ...groups.rows].filter((m) => missionImpact(m, states)).length;
  return {
    missions: assists.rows.length,
    groups: groups.rows.length,
    impacted,
    lastSync: sync?.lastAt ?? null,
    next: legs.slice(0, 6),
  };
}
