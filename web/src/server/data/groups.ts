import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { normalizeDistricts } from "@/lib/pmr/district-filter";
import { parseStatuses } from "@/lib/pmr/model";
import { brusselsDay, isValidDay } from "@/lib/orders/time";

import { isAbsentFromDicos } from "@/lib/pmr/sync-state";

import { districtFilter, resolveStationTerms, stationFilter } from "../stations";
import { pbForRequest } from "./orders";
import { dicosSessions, statusFilter } from "./pmr";

export const GROUP_STATUSES = ["prevue", "realisee", "annulee"] as const;

// Missions de groupe DICOS (lecture seule, droit `pmr:read` — règle PocketBase `1760001500`).

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" ? v : 0);

export type GroupMission = {
  id: string;
  day: string;
  time: string;
  station: string;
  district: string;
  otherStation: string;
  arrTime: string;
  arrDistrict: string;
  inAssist: boolean;
  outAssist: boolean;
  inStatus: string;
  outStatus: string;
  transport: string;
  train: string;
  dicosRef: string;
  groupName: string;
  adults: number;
  children: number;
  seniors: number;
  status: "prevue" | "realisee" | "annulee";
  coach: string;
  meetingPoint: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  lastSeenSync?: string;
  lastSeenBy?: string;
  /** Encore « prévue » mais absente de la dernière synchro complète de l'agent qui l'avait vue. */
  absent?: boolean;
};

function row(r: RecordModel): GroupMission {
  return {
    id: r.id,
    day: str(r.day),
    time: str(r.time),
    station: str(r.station),
    district: str(r.district),
    otherStation: str(r.other_station),
    arrTime: str(r.arr_time),
    arrDistrict: str(r.arr_district),
    inAssist: !!r.in_assist,
    outAssist: !!r.out_assist,
    inStatus: str(r.in_status),
    outStatus: str(r.out_status),
    transport: str(r.transport),
    train: str(r.train),
    dicosRef: str(r.dicos_ref),
    groupName: str(r.group_name),
    adults: num(r.adults),
    children: num(r.children),
    seniors: num(r.seniors),
    status: (["prevue", "realisee", "annulee"].includes(str(r.status))
      ? r.status
      : "prevue") as GroupMission["status"],
    coach: str(r.coach),
    meetingPoint: str(r.meeting_point),
    contactName: `${str(r.contact_last)} ${str(r.contact_first)}`.trim(),
    contactPhone: str(r.contact_phone),
    contactEmail: str(r.contact_email),
    lastSeenSync: str(r.last_seen_sync),
    lastSeenBy: str(r.last_seen_by),
  };
}

export const groupListSchema = z.object({
  from: z.string().refine(isValidDay).optional().catch(undefined),
  to: z.string().refine(isValidDay).optional().catch(undefined),
  /** Un ou plusieurs codes (« DSO », « DSO,DSE ») ; vide = tous les districts. */
  district: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => normalizeDistricts(v)),
  q: z.string().trim().max(60).default(""),
  hideCancelled: z.boolean().default(false),
  status: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => parseStatuses(v, GROUP_STATUSES)),
});

export async function listGroups(input: z.input<typeof groupListSchema>) {
  const p = groupListSchema.parse(input);
  const pb = await pbForRequest();
  const today = brusselsDay();
  const parts = [
    pb.filter("day >= {:a} && day <= {:b}", { a: p.from ?? today, b: p.to ?? p.from ?? today }),
  ];
  if (p.district) parts.push(districtFilter(pb, p.district));
  if (p.status.length && p.status.length < GROUP_STATUSES.length)
    parts.push(statusFilter(pb, p.status));
  // « Masquer les annulées » (sans effet si des statuts précis sont cochés).
  else if (!p.status.length && p.hideCancelled) parts.push('status != "annulee"');
  if (p.q) {
    // Gare tolérante (accents, abréviation PtCar) ; train, groupe et n° de dossier sur la saisie brute.
    const terms = await resolveStationTerms(p.q);
    parts.push(
      stationFilter(pb, ["station", "other_station"], terms, {
        fields: ["train", "group_name", "dicos_ref"],
        q: p.q,
      }),
    );
  }
  const res = await pb.collection("group_missions").getList(1, 500, {
    filter: parts.join(" && "),
    sort: "day,time",
  });
  let rows = res.items.map(row);
  if (rows.some((g) => g.status === "prevue" && g.lastSeenBy)) {
    const sessions = await dicosSessions("groups", [...new Set(rows.map((g) => g.day))]);
    rows = rows.map((g) => (isAbsentFromDicos(g, sessions) ? { ...g, absent: true } : g));
  }
  return { rows, total: res.totalItems };
}
