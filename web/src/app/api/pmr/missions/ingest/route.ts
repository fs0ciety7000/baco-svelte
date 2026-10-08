import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { mapMission, missionDay } from "@/lib/pmr/dicos-mission";
import { isValidDay } from "@/lib/orders/time";
import { createPb } from "@/server/pocketbase";
import { env } from "@/server/env";

// Ingestion des missions DICOS (Missions PMR). Authentifiée par un **secret partagé** (en-tête `x-dicos-token`)
// présenté par l'extension de navigateur — jamais un jeton SNCB. L'écriture se fait avec un **compte de service**
// PocketBase (droit dicos:write) : les règles et hooks s'appliquent. Idempotent, dédup sur `dicos_id`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  day: z.string().refine(isValidDay),
  missions: z.array(z.unknown()).max(1000),
});

function tokenOk(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(env.CSM_DICOS_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
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

export async function POST(request: Request) {
  if (!env.CSM_DICOS_TOKEN || !env.CSM_DICOS_PB_EMAIL)
    return Response.json({ error: "Ingestion DICOS non configurée." }, { status: 503 });
  const provided = request.headers.get("x-dicos-token") ?? "";
  if (!provided || !tokenOk(provided))
    return Response.json({ error: "Jeton de connecteur invalide." }, { status: 401 });

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
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of body.missions) {
    // Garde : on n'ingère que les missions du jour annoncé (cohérence du lot).
    if (missionDay(raw) !== body.day) {
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
    try {
      const existing = await pb
        .collection("pmr_assists")
        .getFirstListItem(pb.filter("dicos_id = {:id}", { id: assist.dicos_id }))
        .catch(() => null);
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
      let assistId: string;
      if (existing) {
        if (existing.anonymized) {
          skipped++;
          continue;
        }
        await pb.collection("pmr_assists").update(existing.id, base);
        assistId = existing.id;
        updated++;
      } else {
        const rec = await pb
          .collection("pmr_assists")
          .create({ ...base, dicos_id: assist.dicos_id, created_by: svc.id });
        assistId = rec.id;
        created++;
      }
      // Détail nominatif (pmr_mission), lisible avec pmr:read seulement.
      const existingDetail = await pb
        .collection("pmr_mission")
        .getFirstListItem(pb.filter("assist = {:a}", { a: assistId }))
        .catch(() => null);
      if (existingDetail) await pb.collection("pmr_mission").update(existingDetail.id, mission);
      else await pb.collection("pmr_mission").create({ ...mission, assist: assistId });
    } catch (e) {
      skipped++;
      if (errors.length < 5) errors.push(assist.dicos_id);
      void e;
    }
  }

  return Response.json(
    { day: body.day, received: body.missions.length, created, updated, skipped, errors },
    { headers: { "cache-control": "no-store" } },
  );
}
