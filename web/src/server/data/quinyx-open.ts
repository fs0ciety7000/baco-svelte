import "server-only";

import type { RecordModel } from "pocketbase";

import { pbDate } from "@/lib/orders/time";
import {
  brusselsClock,
  openPeriod,
  type OpenFilter,
  type OpenFunction,
  type OpenKind,
} from "@/lib/quinyx/model";

import { pbForRequest } from "./orders";

// Services Quinyx non pourvus (23 oct. 2026, `1760005000`) : lecture avec le jeton de l'agent, la règle PocketBase exige
// `quinyx_open:read` (admin / sysop par défaut). Aucune donnée personnelle.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (v: unknown) => pbDate(str(v))?.toISOString() ?? "";

export type OpenShift = {
  id: string;
  groupId: string;
  /** Nom du groupe Quinyx (« OCC Mons ») ; n° du groupe si son nom n'est pas lisible. */
  zone: string;
  day: string;
  start: string;
  end: string;
  /** Heures de Bruxelles « HH:MM ». */
  from: string;
  to: string;
  code: string;
  section: string;
  kind: OpenKind;
  function: OpenFunction;
  district: string;
  lastSeen: string;
};

export type OpenZone = { groupId: string; label: string; district: string };

/** Groupes Quinyx « équipe » (zones du filtre). Vide si l'agent ne lit pas les groupes (`quinyx:read`). */
export async function openZones(): Promise<OpenZone[]> {
  const pb = await pbForRequest();
  const rows = await pb
    .collection("quinyx_groups")
    .getFullList({ filter: 'purpose != "gares"', fields: "group_id,label,district", sort: "label" })
    .catch(() => [] as RecordModel[]);
  return rows.map((r) => ({
    groupId: str(r.group_id),
    label: str(r.label),
    district: str(r.district),
  }));
}

/** Services non pourvus du filtre, triés par jour puis heure (5 000 au plus : une année de deux groupes tient large). */
export async function listOpenShifts(f: OpenFilter, zones?: OpenZone[]): Promise<OpenShift[]> {
  const pb = await pbForRequest();
  const { from, to } = openPeriod(f.year, f.month);
  const parts = [pb.filter("day >= {:f} && day <= {:t}", { f: from, t: to })];
  const any = (field: string, values: string[]) =>
    values.length
      ? `(${values.map((v, i) => pb.filter(`${field} = {:${field}${i}}`, { [`${field}${i}`]: v })).join(" || ")})`
      : "";
  for (const p of [any("group_id", f.groups), any("function", f.functions), any("kind", f.kinds)])
    if (p) parts.push(p);
  const rows = await pb.collection("quinyx_open_shifts").getList(1, 5000, {
    filter: parts.join(" && "),
    sort: "day,start,code",
    fields: "id,group_id,day,start,end,code,section,kind,function,district,last_seen",
  });
  const names = new Map((zones ?? (await openZones())).map((z) => [z.groupId, z.label]));
  return rows.items.map((r) => {
    const start = iso(r.start);
    const end = iso(r.end);
    return {
      id: r.id,
      groupId: str(r.group_id),
      zone: names.get(str(r.group_id)) || `Groupe ${str(r.group_id)}`,
      day: str(r.day),
      start,
      end,
      from: brusselsClock(start),
      to: brusselsClock(end),
      code: str(r.code),
      section: str(r.section),
      kind: (str(r.kind) || "autre") as OpenKind,
      function: (str(r.function) || "paco") as OpenFunction,
      district: str(r.district),
      lastSeen: iso(r.last_seen),
    };
  });
}
