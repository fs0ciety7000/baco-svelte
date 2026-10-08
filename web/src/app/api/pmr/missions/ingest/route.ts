import { timingSafeEqual } from "node:crypto";

import type PocketBase from "pocketbase";
import { z } from "zod";

import { mapDossier, mapMission, missionDay, type MappedMission } from "@/lib/pmr/dicos-mission";
import { isValidDay } from "@/lib/orders/time";
import { districtForStation } from "@/lib/pmr/districts";
import { createPb } from "@/server/pocketbase";
import { env } from "@/server/env";
import { allow } from "@/server/rate-limit";

// Ingestion DICOS (Missions PMR). Authentifiée par un **secret partagé** (en-tête `x-dicos-token`) présenté par
// l'extension — jamais un jeton SNCB. Écriture avec un **compte de service** PocketBase (rôle `connector` + droit
// `dicos:write`, voir 1760000700) : règles et hooks s'appliquent. Idempotent, dédup sur `dicos_id`.
// Deux formats :
// - v3 `{ day, dossiers: [trip-details] }` : dossier complet → une ligne par TRAJET (dicos_id = « j<journeyId> ») ;
// - v2 `{ day, missions: [...] }` : ancien format (extensions pas encore mises à jour), une ligne par mission.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 5_000_000;

const bodySchema = z
  .object({
    day: z.string().refine(isValidDay),
    missions: z.array(z.unknown()).max(1000).optional(),
    dossiers: z.array(z.unknown()).max(500).optional(),
  })
  .refine((b) => b.missions || b.dossiers, "missions ou dossiers requis");

function tokenOk(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CSM_DICOS_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Ne masque QUE le 404 ; toute autre erreur remonte (audit du 8 oct.).
function nullOn404(e: unknown): null {
  if (e && typeof e === "object" && (e as { status?: number }).status === 404) return null;
  throw e;
}

function dayClose(a: string, b: string): boolean {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Number.isFinite(da) && Number.isFinite(db) && Math.abs(da - db) <= 86_400_000;
}

let service: { token: string; id: string; at: number } | null = null;
async function serviceAuth() {
  if (service && Date.now() - service.at < 30 * 60_000) return service;
  const pb = createPb();
  const auth = await pb
    .collection("users")
    .authWithPassword(env.CSM_DICOS_PB_EMAIL, env.CSM_DICOS_PB_PASSWORD);
  service = { token: pb.authStore.token, id: auth.record.id, at: Date.now() };
  return service;
}

type Rec = Record<string, unknown>;
const eq = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");
function changed(next: Rec, cur: Rec, skip: string[] = []): boolean {
  for (const k of Object.keys(next)) if (!skip.includes(k) && !eq(next[k], cur[k])) return true;
  return false;
}

type Counters = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  detailErrors: number;
  errors: string[];
};

/** Upsert d'une ligne (pmr_assists, dédup dicos_id) puis de son détail nominatif (pmr_mission). */
async function upsert(
  pb: PocketBase,
  svcId: string,
  dicosId: string,
  base: Rec,
  mission: MappedMission,
  c: Counters,
) {
  let assistId: string;
  try {
    const existing = await pb
      .collection("pmr_assists")
      .getFirstListItem(pb.filter("dicos_id = {:id}", { id: dicosId }))
      .catch(nullOn404);
    const body = { ...base, source: "dicos", updated_by: svcId };
    if (existing) {
      if (existing.anonymized) {
        c.skipped++;
        return;
      }
      assistId = existing.id;
      if (changed(base, existing as unknown as Rec)) {
        await pb.collection("pmr_assists").update(existing.id, body);
        c.updated++;
      } else c.unchanged++;
    } else {
      const rec = await pb
        .collection("pmr_assists")
        .create({ ...body, dicos_id: dicosId, created_by: svcId });
      assistId = rec.id;
      c.created++;
    }
  } catch {
    c.skipped++;
    if (c.errors.length < 5) c.errors.push(dicosId);
    return;
  }
  try {
    const cur = await pb
      .collection("pmr_mission")
      .getFirstListItem(pb.filter("assist = {:a}", { a: assistId }))
      .catch(nullOn404);
    if (cur) {
      if (changed(mission as Rec, cur as unknown as Rec, ["assist"]))
        await pb.collection("pmr_mission").update(cur.id, mission);
    } else await pb.collection("pmr_mission").create({ ...mission, assist: assistId });
  } catch {
    c.detailErrors++;
    if (c.errors.length < 5) c.errors.push(`${dicosId} (détail)`);
  }
}

export async function POST(request: Request) {
  if (!env.CSM_DICOS_TOKEN || !env.CSM_DICOS_PB_EMAIL)
    return Response.json({ error: "Ingestion DICOS non configurée." }, { status: 503 });
  const provided = request.headers.get("x-dicos-token") ?? "";
  if (!provided || !tokenOk(provided))
    return Response.json({ error: "Jeton de connecteur invalide." }, { status: 401 });
  if (!allow("dicos-ingest", 30, 60_000))
    return Response.json({ error: "Trop de requêtes, réessayez plus tard." }, { status: 429 });
  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BODY)
    return Response.json({ error: "Corps trop volumineux." }, { status: 413 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json(
      { error: "Corps invalide (day + missions ou dossiers)." },
      { status: 400 },
    );
  }
  let svc: { token: string; id: string; at: number };
  try {
    svc = await serviceAuth();
  } catch {
    return Response.json({ error: "Compte de service DICOS indisponible." }, { status: 502 });
  }
  const pb = createPb(svc.token);
  const c: Counters = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    detailErrors: 0,
    errors: [],
  };
  let received = 0;

  // v3 : dossiers complets → une ligne par trajet. Tous les trajets du dossier sont repris (y compris ceux d'un
  // autre jour : retour le 14/10 d'un aller le 08/10), chacun sur son propre jour de service.
  for (const raw of body.dossiers ?? []) {
    let legs: ReturnType<typeof mapDossier>["legs"];
    try {
      legs = mapDossier(raw).legs;
    } catch {
      c.skipped++;
      continue;
    }
    for (const { assist, mission } of legs) {
      received++;
      if (!assist.dicos_id || !isValidDay(assist.day)) {
        c.skipped++;
        continue;
      }
      const { dicos_id, source: _s, ...rest } = assist;
      void _s;
      const base: Rec = {
        ...rest,
        district: assist.district || null,
        arr_district: assist.arr_district || null,
        pmr_type: assist.pmr_type || null,
        // Sens « dominant » gardé pour l'historique : départ si IN seul, arrivée si OUT seul.
        direction:
          assist.in_assist && !assist.out_assist
            ? "depart"
            : !assist.in_assist && assist.out_assist
              ? "arrivee"
              : null,
      };
      await upsert(pb, svc.id, `j${dicos_id}`, base, mission, c);
    }
  }

  // v2 : ancien format (une ligne par mission).
  for (const raw of body.missions ?? []) {
    received++;
    const md = missionDay(raw);
    if (!md || !dayClose(md, body.day)) {
      c.skipped++;
      continue;
    }
    let mapped: ReturnType<typeof mapMission>;
    try {
      mapped = mapMission(raw);
    } catch {
      c.skipped++;
      continue;
    }
    const { assist, mission } = mapped;
    if (!assist.dicos_id || !assist.day) {
      c.skipped++;
      continue;
    }
    const base: Rec = {
      day: assist.day,
      time: assist.time,
      station: assist.station,
      other_station: assist.other_station,
      district: assist.district || null,
      // v2 : district de la gare d'arrivée aussi (sinon « ? » dans la liste).
      arr_district: districtForStation(assist.other_station) || null,
      direction: assist.direction || null,
      mission_type: assist.mission_type,
      train: assist.train,
      dicos_ref: assist.dicos_ref,
      pax: assist.pax,
      pmr_type: assist.pmr_type || null,
      status: assist.status,
    };
    await upsert(pb, svc.id, assist.dicos_id, base, mission, c);
  }

  return Response.json(
    { day: body.day, received, ...c },
    { headers: { "cache-control": "no-store" } },
  );
}
