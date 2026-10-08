import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { mapMission, missionDay } from "@/lib/pmr/dicos-mission";
import { isValidDay } from "@/lib/orders/time";
import { createPb } from "@/server/pocketbase";
import { env } from "@/server/env";
import { allow } from "@/server/rate-limit";

// Ingestion des missions DICOS (Missions PMR). Authentifiée par un **secret partagé** (en-tête `x-dicos-token`)
// présenté par l'extension de navigateur — jamais un jeton SNCB. L'écriture se fait avec un **compte de service**
// PocketBase (rôle `connector` + droit `dicos:write`, voir 1760000700) : les règles et hooks s'appliquent.
// Idempotent, dédup sur `dicos_id`, ne réécrit que ce qui change.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 5_000_000; // octets : borne anti-OOM (le lot est déjà plafonné à 1000 missions par zod).

const bodySchema = z.object({
  day: z.string().refine(isValidDay),
  missions: z.array(z.unknown()).max(1000),
});

function tokenOk(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CSM_DICOS_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// `.catch` qui ne masque QUE le 404 (aucune fiche) ; toute autre erreur (droit manquant, panne) est propagée pour ne
// pas la confondre avec « n'existe pas » (sinon un changement de statut échouerait en silence — audit du 8 oct.).
function nullOn404(e: unknown): null {
  if (e && typeof e === "object" && (e as { status?: number }).status === 404) return null;
  throw e;
}

// Deux jours sont « cohérents » s'ils sont à 24 h au plus (missions de nuit listées sous le jour de service).
function dayClose(a: string, b: string): boolean {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Number.isFinite(da) && Number.isFinite(db) && Math.abs(da - db) <= 86_400_000;
}

// Jeton de service mis en cache (ré-authentifié à l'expiration).
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
/** L'assist a-t-il changé par rapport à la fiche existante (hors champs constants source/updated_by) ? */
function assistChanged(base: Rec, cur: Rec): boolean {
  for (const k of [
    "day",
    "time",
    "station",
    "direction",
    "mission_type",
    "train",
    "dicos_ref",
    "pmr_type",
    "status",
  ])
    if (!eq(base[k], cur[k])) return true;
  return false;
}
function missionChanged(m: Rec, cur: Rec): boolean {
  for (const k of Object.keys(m)) if (k !== "assist" && !eq(m[k], cur[k])) return true;
  return false;
}

export async function POST(request: Request) {
  if (!env.CSM_DICOS_TOKEN || !env.CSM_DICOS_PB_EMAIL)
    return Response.json({ error: "Ingestion DICOS non configurée." }, { status: 503 });
  const provided = request.headers.get("x-dicos-token") ?? "";
  if (!provided || !tokenOk(provided))
    return Response.json({ error: "Jeton de connecteur invalide." }, { status: 401 });

  // Débit : au plus 30 lots par minute pour le connecteur (protège PocketBase d'un détenteur du secret).
  if (!allow("dicos-ingest", 30, 60_000))
    return Response.json({ error: "Trop de requêtes, réessayez plus tard." }, { status: 429 });

  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BODY)
    return Response.json({ error: "Corps trop volumineux." }, { status: 413 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Corps invalide (day + missions requis)." }, { status: 400 });
  }

  let svc: { token: string; id: string; at: number };
  try {
    svc = await serviceAuth();
  } catch {
    return Response.json({ error: "Compte de service DICOS indisponible." }, { status: 502 });
  }
  const pb = createPb(svc.token);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let detailErrors = 0;
  const errors: string[] = [];

  for (const raw of body.missions) {
    // Garde de cohérence du lot : on tolère ±1 jour (missions de nuit listées sous le jour de service).
    const md = missionDay(raw);
    if (!md || !dayClose(md, body.day)) {
      skipped++;
      continue;
    }
    let assist: ReturnType<typeof mapMission>["assist"];
    let mission: ReturnType<typeof mapMission>["mission"];
    try {
      ({ assist, mission } = mapMission(raw));
    } catch {
      skipped++;
      continue;
    }
    if (!assist.dicos_id || !assist.day) {
      skipped++;
      continue;
    }
    let assistId: string;
    try {
      const existing = await pb
        .collection("pmr_assists")
        .getFirstListItem(pb.filter("dicos_id = {:id}", { id: assist.dicos_id }))
        .catch(nullOn404);
      const base = {
        day: assist.day,
        time: assist.time,
        station: assist.station,
        direction: assist.direction || null,
        mission_type: assist.mission_type,
        train: assist.train,
        dicos_ref: assist.dicos_ref,
        pax: assist.pax,
        pmr_type: assist.pmr_type || null,
        status: assist.status,
        source: "dicos",
        updated_by: svc.id,
      };
      if (existing) {
        if (existing.anonymized) {
          skipped++;
          continue;
        }
        assistId = existing.id;
        // eq() traite null et "" comme égaux → base.direction/pmr_type (null) == select vide stocké ("").
        if (assistChanged(base, existing as unknown as Rec)) {
          await pb.collection("pmr_assists").update(existing.id, base);
          updated++;
        } else {
          unchanged++;
        }
      } else {
        const rec = await pb
          .collection("pmr_assists")
          .create({ ...base, dicos_id: assist.dicos_id, created_by: svc.id });
        assistId = rec.id;
        created++;
      }
    } catch (e) {
      skipped++;
      if (errors.length < 5) errors.push(assist.dicos_id);
      void e;
      continue;
    }
    // Détail nominatif (pmr_mission), lisible avec pmr:read seulement. Un échec ici ne défait pas l'assist écrit.
    try {
      const existingDetail = await pb
        .collection("pmr_mission")
        .getFirstListItem(pb.filter("assist = {:a}", { a: assistId }))
        .catch(nullOn404);
      if (existingDetail) {
        if (missionChanged(mission as Rec, existingDetail as unknown as Rec))
          await pb.collection("pmr_mission").update(existingDetail.id, mission);
      } else {
        await pb.collection("pmr_mission").create({ ...mission, assist: assistId });
      }
    } catch (e) {
      detailErrors++;
      if (errors.length < 5) errors.push(assist.dicos_id + " (détail)");
      void e;
    }
  }

  return Response.json(
    {
      day: body.day,
      received: body.missions.length,
      created,
      updated,
      unchanged,
      skipped,
      detailErrors,
      errors,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
