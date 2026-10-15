import "server-only";

import { z } from "zod";

import { b201NotesOf, notesDistricts, parseVersions, type B201District } from "@/lib/ops/b201";
import { can } from "@/lib/permissions";
import { addDays, periodOf, type Period } from "@/lib/orders/time";

import type { SessionUser } from "../auth";
import { listOrders, pbForRequest, type OrderRow } from "./orders";

// Remise de service B201 : une par jour (Europe/Brussels), transports lus depuis les commandes du jour
// (statut ≠ brouillon et ≠ annulé ; un bus annulé n'apparaît pas — décision du 8 octobre 2026).

export const SERVICES = [
  { id: "bus", label: "Bus" },
  { id: "taxi", label: "Taxis" },
  { id: "taxi_pmr", label: "Taxis PMR" },
] as const;
export type Service = (typeof SERVICES)[number]["id"];

export type B201Entry = {
  key: string;
  period: Period;
  service: Service;
  time: string;
  company: string;
  origin: string;
  destination: string;
  ref: string;
  /** Lien vers la commande ; absent pour une saisie manuelle. */
  orderId?: string;
  kind?: "bus" | "taxi";
  number?: number;
  status?: OrderRow["status"];
  district: string;
};

export const manualEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9]{6,20}$/),
  period: z.enum(["matin", "apres_midi", "nuit"]),
  service: z.enum(["bus", "taxi", "taxi_pmr"]),
  time: z.string().regex(/^$|^\d{2}:\d{2}$/),
  company: z.string().trim().max(200),
  origin: z.string().trim().max(200),
  destination: z.string().trim().max(200),
  ref: z.string().trim().max(200),
});
export type ManualEntry = z.infer<typeof manualEntrySchema>;

type BusLine = { planned?: string; confirmed?: string; cancelled?: boolean };

/** Une ligne par bus actif (heure confirmée sinon prévue), une ligne par taxi. */
function entriesFromRows(rows: OrderRow[], buses: Map<string, BusLine[]>): B201Entry[] {
  const out: B201Entry[] = [];
  for (const r of rows) {
    if (r.status === "annule") continue; // Cycle v3 : « brouillon / en cours » = bus engagés, repris.
    if (r.kind === "bus") {
      const list = (buses.get(r.id) ?? []).filter((b) => !b.cancelled);
      const lines = list.length ? list : [{ planned: r.time }];
      lines.forEach((b, i) => {
        const time = b.confirmed || b.planned || r.time;
        out.push({
          key: `bus-${r.id}-${i}`,
          period: periodOf(time),
          service: "bus",
          time,
          company: r.company,
          origin: r.origin,
          destination: r.destination,
          ref: r.relation,
          orderId: r.id,
          kind: "bus",
          number: r.number,
          status: r.status,
          district: r.district,
        });
      });
    } else {
      out.push({
        key: `taxi-${r.id}`,
        period: periodOf(r.time),
        service: r.isPmr ? "taxi_pmr" : "taxi",
        time: r.time,
        company: r.company,
        origin: r.origin,
        destination: r.destination,
        ref: r.relation,
        orderId: r.id,
        kind: "taxi",
        number: r.number,
        status: r.status,
        district: r.district,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export type B201NoteVersion = { at: string; by: string; byName: string; content: string };

/** Notes d'un district pour un jour (fiche `b201_notes`, absente tant que personne n'y a écrit). */
export type DistrictNotes = {
  district: B201District;
  id: string | null;
  content: string;
  updated: string | null;
  updatedByName: string;
  versions: B201NoteVersion[];
};

/**
 * `districts` : un ou plusieurs (noms) pour les transports, vide = tous ; `noteCodes` : codes des districts dont les
 * notes sont lues (DSO, DSE, DCE ; vide = les trois).
 */
export async function b201Data(
  day: string,
  districts: string[],
  user: SessionUser,
  noteCodes: readonly string[] = [],
) {
  const wanted = notesDistricts(noteCodes);
  const ctx = {
    userId: user.id,
    canBus: can(user, "otto:read"),
    canTaxi: can(user, "generate_taxi:read"),
    canPmr: can(user, "pmr:read"),
  };
  const pb = await pbForRequest();
  // La nuit (21 h – 6 h) déborde sur le lendemain matin : on lit aussi le lendemain avant 6 h.
  const [{ rows }, report, noteRows] = await Promise.all([
    listOrders(
      // Remise d'un jour passé : bons archivés compris.
      {
        kind: "all",
        from: day,
        to: addDays(day, 1),
        district: districts,
        limit: 500,
        archived: "include",
      },
      ctx,
    ),
    pb
      .collection("b201_reports")
      .getFirstListItem(pb.filter("day = {:day}", { day }))
      .catch(() => null),
    pb
      .collection("b201_notes")
      .getFullList({ filter: pb.filter("day = {:day}", { day }) })
      .catch(() => []),
  ]);
  const parsed = wanted.map((district) => {
    const r = noteRows.find((n) => n.district === district);
    return { district, r, versions: parseVersions(r?.versions) };
  });
  const names = await authorNames(pb, [
    ...(report?.updated_by ? [String(report.updated_by)] : []),
    ...parsed.flatMap((p) => [
      ...(p.r?.updated_by ? [String(p.r.updated_by)] : []),
      ...p.versions.map((v) => v.by),
    ]),
  ]);
  // Les bus viennent de la liste (pas de 2e requête : un filtre « id = … || … » casse au-delà de ~130 ids).
  const buses = new Map<string, BusLine[]>(
    rows.filter((r) => r.kind === "bus").map((r) => [r.id, r.buses]),
  );
  const all = entriesFromRows(rows, buses).filter((e) => {
    const orderDay = rows.find((r) => r.id === e.orderId)?.day;
    // Avant 6 h : fin de la nuit de la veille ; elle figure sur la B201 du jour précédent.
    if (orderDay === day) return !(e.time && e.time < "06:00");
    // Lendemain : seulement la fin de nuit (avant 6 h).
    return orderDay === addDays(day, 1) && e.period === "nuit" && e.time < "06:00";
  });
  const manual = z
    .array(manualEntrySchema)
    .catch([])
    .parse(report?.manual ?? []);
  const notes: DistrictNotes[] = parsed.map(({ district, r, versions }) => ({
    district,
    id: r?.id ?? null,
    content: typeof r?.content === "string" ? r.content : "",
    updated: (r?.updated as string | undefined) ?? null,
    updatedByName: r?.updated_by ? (names.get(String(r.updated_by)) ?? "") : "",
    versions: versions.map((v) => ({ ...v, byName: names.get(v.by) ?? "" })),
  }));
  return {
    entries: all,
    manual,
    /** Notes de chaque district demandé, dans l'ordre DSO, DSE, DCE. */
    notes,
    /**
     * Notes du jour écrites avant les notes par district (fiche du jour, sans district ; anciens commentaires BACO par
     * période convertis) : lecture seule, affichées une fois sous `COMMON_NOTES_TITLE`.
     */
    common: b201NotesOf(report?.content, report?.notes),
    commonByName: report?.updated_by ? (names.get(String(report.updated_by)) ?? "") : "",
    reportId: report?.id ?? null,
    /** Version de la fiche du jour (transports hors outil : verrou optimiste). */
    updated: (report?.updated as string | undefined) ?? null,
    hasLegacy: !!report && report.legacy && Object.keys(report.legacy as object).length > 0,
  };
}
export type B201Data = Awaited<ReturnType<typeof b201Data>>;

/** Noms affichables des auteurs (annuaire de l'équipe : nom seul) ; inconnu ou illisible = absent. */
async function authorNames(
  pb: Awaited<ReturnType<typeof pbForRequest>>,
  ids: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(ids.filter((id) => /^[a-z0-9-]{15,36}$/.test(id)))].slice(0, 40);
  const out = new Map<string, string>();
  if (!wanted.length) return out;
  const filter = wanted.map((id, i) => pb.filter(`id = {:i${i}}`, { [`i${i}`]: id })).join(" || ");
  const list = await pb
    .collection("users")
    .getFullList({ filter, fields: "id,name,username" })
    .catch(() => []);
  for (const u of list) out.set(u.id, String(u.name || u.username || ""));
  return out;
}

export const SERVICE_LABEL: Record<Service, string> = {
  bus: "Bus",
  taxi: "Taxi",
  taxi_pmr: "Taxi PMR",
};

/** Transports par période (commandes + saisies manuelles), triés par heure. */
export function entriesByPeriod(data: Pick<B201Data, "entries" | "manual">) {
  const manual: B201Entry[] = data.manual.map((m) => ({
    ...m,
    key: `manuel-${m.id}`,
    district: "",
  }));
  const all = [...data.entries, ...manual].sort((a, b) => a.time.localeCompare(b.time));
  return {
    matin: all.filter((e) => e.period === "matin"),
    apres_midi: all.filter((e) => e.period === "apres_midi"),
    nuit: all.filter((e) => e.period === "nuit"),
  };
}
