import "server-only";

import type { RecordModel } from "pocketbase";
import { z } from "zod";

import { brusselsDay, isValidDay } from "@/lib/orders/time";

import { pbForRequest } from "./orders";

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
  };
}

export const groupListSchema = z.object({
  from: z.string().refine(isValidDay).optional().catch(undefined),
  to: z.string().refine(isValidDay).optional().catch(undefined),
  district: z
    .string()
    .optional()
    .transform((v) => (["DCE", "DSE", "DSO"] as const).find((x) => x === v)),
  q: z.string().trim().max(60).default(""),
  hideCancelled: z.boolean().default(false),
  status: z
    .string()
    .optional()
    .transform((v) => (["prevue", "realisee", "annulee"] as const).find((x) => x === v)),
});

export async function listGroups(input: z.input<typeof groupListSchema>) {
  const p = groupListSchema.parse(input);
  const pb = await pbForRequest();
  const today = brusselsDay();
  const parts = [
    pb.filter("day >= {:a} && day <= {:b}", { a: p.from ?? today, b: p.to ?? p.from ?? today }),
  ];
  if (p.district)
    parts.push(pb.filter("(district = {:d} || arr_district = {:d})", { d: p.district }));
  if (p.status) parts.push(pb.filter("status = {:s}", { s: p.status }));
  // « Masquer les annulées » (sans effet si un statut précis est demandé).
  else if (p.hideCancelled) parts.push('status != "annulee"');
  if (p.q)
    parts.push(
      pb.filter(
        "(station ~ {:q} || other_station ~ {:q} || train ~ {:q} || group_name ~ {:q} || dicos_ref ~ {:q})",
        { q: p.q },
      ),
    );
  const res = await pb.collection("group_missions").getList(1, 500, {
    filter: parts.join(" && "),
    sort: "day,time",
  });
  return { rows: res.items.map(row), total: res.totalItems };
}
