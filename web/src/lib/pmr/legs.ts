import type { GroupMission } from "@/server/data/groups";
import type { Assist } from "@/server/data/pmr";

import type { AleaEnd, GroupEnd } from "./model";

// Trajet d'une mission (gares, heures, districts, assistance IN / OUT) et bouts d'assistance pour l'ALEA. Pur : partagé
// par les écrans (Missions PMR, Groupes) et le serveur (Relève, frise « Ma journée »).

export type Leg = {
  dep: string;
  depTime: string;
  depDistrict: string;
  arr: string;
  arrTime: string;
  arrDistrict: string;
  inA: boolean;
  outA: boolean;
};
export function legOf(a: Assist): Leg {
  if (a.inAssist || a.outAssist || a.arrTime || a.transport)
    return {
      dep: a.station || "—",
      depTime: a.time,
      depDistrict: a.district,
      arr: a.otherStation || "—",
      arrTime: a.arrTime,
      arrDistrict: a.arrDistrict,
      inA: a.inAssist,
      outA: a.outAssist,
    };
  if (a.direction === "arrivee")
    return {
      dep: a.otherStation || "—",
      depTime: "",
      depDistrict: "",
      arr: a.station || "—",
      arrTime: a.time,
      arrDistrict: a.district,
      inA: false,
      outA: true,
    };
  return {
    dep: a.station || "—",
    depTime: a.time,
    depDistrict: a.district,
    arr: a.otherStation || "—",
    arrTime: "",
    arrDistrict: "",
    inA: a.direction === "depart",
    outA: false,
  };
}

export const groupLegOf = (g: GroupMission): Leg => ({
  dep: g.station || "—",
  depTime: g.time,
  depDistrict: g.district,
  arr: g.otherStation || "—",
  arrTime: g.arrTime,
  arrDistrict: g.arrDistrict,
  inA: g.inAssist,
  outA: g.outAssist,
});
export const groupTotal = (g: GroupMission) => g.adults + g.children + g.seniors;
export const groupTrain = (g: GroupMission) =>
  g.transport === "taxi" ? `Taxi${g.train ? ` ${g.train}` : ""}` : g.train || "—";

/** Bouts d'assistance des trajets affichés (annulés exclus ; avec un filtre district, ses gares seulement). */
export function aleaEnds(rows: Assist[], district: string): AleaEnd[] {
  const ends: AleaEnd[] = [];
  for (const a of rows) {
    if (a.status === "annulee") continue;
    const l = legOf(a);
    const train = a.transport === "taxi" ? `Taxi${a.train ? ` ${a.train}` : ""}` : a.train || "—";
    const base = {
      day: a.day,
      train,
      pax: a.pax,
      pmrType: a.pmrType,
      dossier: a.dicosRef,
      fullPax: a.fullPax,
      lightPax: a.lightPax,
    };
    if (l.inA && (!district || l.depDistrict === district))
      ends.push({ ...base, station: l.dep, time: l.depTime, io: "IN" });
    if (l.outA && (!district || l.arrDistrict === district))
      ends.push({ ...base, station: l.arr, time: l.arrTime, io: "OUT" });
  }
  return ends;
}

/** Bouts d'assistance des trajets de groupe (annulés exclus ; avec un filtre district, ses gares seulement). */
export function groupEnds(rows: GroupMission[], district: string): GroupEnd[] {
  const ends: GroupEnd[] = [];
  for (const g of rows) {
    if (g.status === "annulee") continue;
    const l = groupLegOf(g);
    const base = {
      day: g.day,
      train: groupTrain(g),
      total: groupTotal(g),
      children: g.children,
      seniors: g.seniors,
      dossier: g.dicosRef,
    };
    if (l.inA && (!district || l.depDistrict === district))
      ends.push({ ...base, station: l.dep, time: l.depTime, io: "IN" });
    if (l.outA && (!district || l.arrDistrict === district))
      ends.push({ ...base, station: l.arr, time: l.arrTime, io: "OUT" });
  }
  return ends;
}
