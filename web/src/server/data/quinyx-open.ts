import "server-only";

import type { RecordModel } from "pocketbase";

import { pbDate } from "@/lib/orders/time";
import {
  alignRows,
  brusselsClock,
  openPeriod,
  type AlignRow,
  type OpenFilter,
  type OpenFunction,
  type OpenKind,
} from "@/lib/quinyx/model";

import { pbForRequest } from "./orders";

// Services Quinyx non pourvus (23 oct. 2026, `1760005000`) : lecture avec le jeton de l'agent, la règle PocketBase exige
// `quinyx_open:read` (admin / sysop par défaut). Aucune donnée personnelle.

const str = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (v: unknown) => pbDate(str(v))?.toISOString() ?? "";

/** Poste non aligné tel qu'affiché (heures de Bruxelles « HH:MM » en plus). */
export type OpenShift = AlignRow & { from: string; to: string };

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

type Raw = {
  groupId: string;
  zone: string;
  district: string;
  day: string;
  start: string;
  end: string;
  code: string;
  section: string;
  kind: OpenKind;
  function: OpenFunction;
};

const FIELDS = "group_id,day,start,end,code,section,kind,function,district";

/**
 * Postes non alignés du filtre : services sans agent + postes couverts par l'agent de l'autre OCC (« +SE / +SO »), triés
 * par jour puis heure. La période entière est lue pour toutes les zones (une fusion relie deux zones), puis filtrée.
 */
export async function listOpenShifts(f: OpenFilter, zones?: OpenZone[]): Promise<OpenShift[]> {
  const pb = await pbForRequest();
  const zs = zones ?? (await openZones());
  const names = new Map(zs.map((z) => [z.groupId, z.label]));
  const { from, to } = openPeriod(f.year, f.month);
  const filter = pb.filter("day >= {:f} && day <= {:t}", { f: from, t: to });
  const raw = (r: RecordModel): Raw => ({
    groupId: str(r.group_id),
    zone: names.get(str(r.group_id)) || `Groupe ${str(r.group_id)}`,
    district: str(r.district),
    day: str(r.day),
    start: iso(r.start),
    end: iso(r.end),
    code: str(r.code),
    section: str(r.section),
    kind: (str(r.kind) || "autre") as OpenKind,
    function: (str(r.function) || "paco") as OpenFunction,
  });
  const [open, covers] = await Promise.all([
    pb
      .collection("quinyx_open_shifts")
      .getList(1, 5000, { filter, sort: "day,start", fields: FIELDS }),
    pb
      .collection("quinyx_covers")
      .getList(1, 5000, { filter, sort: "day,start", fields: `${FIELDS},cover` })
      .catch(() => ({ items: [] as RecordModel[] })),
  ]);
  return alignRows(
    open.items.map(raw),
    covers.items.map((r) => ({ ...raw(r), cover: str(r.cover) })),
    zs,
  )
    .filter(
      (r) =>
        (!f.groups.length || f.groups.includes(r.groupId)) &&
        (!f.functions.length || f.functions.includes(r.function)) &&
        (!f.kinds.length || f.kinds.includes(r.kind)) &&
        (!f.statuses.length || f.statuses.includes(r.status)),
    )
    .map((r) => ({ ...r, from: brusselsClock(r.start), to: brusselsClock(r.end) }));
}
