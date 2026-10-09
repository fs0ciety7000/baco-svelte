import type PocketBase from "pocketbase";
import { z } from "zod";

import {
  isPmrMission,
  mapDossier,
  mapGroupList,
  mapMissionList,
  type MappedMission,
} from "@/lib/pmr/dicos-mission";
import { isValidDay } from "@/lib/orders/time";
import {
  ConnectorRateLimited,
  authenticateConnector,
  extensionVersion,
  ingestConfigured,
  nullOn404,
  serviceAuth,
} from "@/server/dicos-service";
import { readExtensionRelease } from "@/server/extension";
import { createPb } from "@/server/pocketbase";
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
    /** Missions de groupe (réservations « Group », 9 oct. 2026). */
    groups: z.array(z.unknown()).max(2000).optional(),
    /** Dernier lot du jour (extension ≥ 1.7.0) ; absent = ancienne extension, lot considéré complet. */
    final: z.boolean().optional(),
  })
  .refine((b) => b.missions || b.dossiers || b.groups, "missions, dossiers ou groupes requis");

function dayClose(a: string, b: string): boolean {
  const da = Date.parse(a + "T00:00:00Z");
  const db = Date.parse(b + "T00:00:00Z");
  return Number.isFinite(da) && Number.isFinite(db) && Math.abs(da - db) <= 86_400_000;
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
  if (!ingestConfigured())
    return Response.json({ error: "Ingestion DICOS non configurée." }, { status: 503 });
  const version = extensionVersion(request);
  let who: Awaited<ReturnType<typeof authenticateConnector>>;
  try {
    who = await authenticateConnector(request.headers.get("x-dicos-token") ?? "", version);
  } catch (e) {
    if (e instanceof ConnectorRateLimited)
      return Response.json({ error: "Trop de requêtes, réessaie plus tard." }, { status: 429 });
    return Response.json({ error: "Compte de service DICOS indisponible." }, { status: 502 });
  }
  if (!who) return Response.json({ error: "Jeton de connecteur invalide." }, { status: 401 });
  const key = who.kind === "personal" ? who.tokenId : "shared";
  if (!allow(`dicos-ingest:${key}`, 30, 60_000))
    return Response.json({ error: "Trop de requêtes, réessaie plus tard." }, { status: 429 });
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

  // v2 (liste + détail par mission) : regroupée en une ligne par TRAJET (`j<journeyId>`, même clé que les dossiers
  // complets). Réservations de groupe et « Stickering » écartées par `mapMissionList`.
  const raws = body.missions ?? [];
  const legs = mapMissionList(raws);
  c.skipped += raws.filter((r) => !isPmrMission(r)).length;
  for (const { assist, mission } of legs) {
    received++;
    if (!assist.dicos_id || !isValidDay(assist.day) || !dayClose(assist.day, body.day)) {
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
      direction:
        assist.in_assist && !assist.out_assist
          ? "depart"
          : !assist.in_assist && assist.out_assist
            ? "arrivee"
            : null,
    };
    await upsert(pb, svc.id, `j${dicos_id}`, base, mission, c);
  }

  // Groupes : une ligne par trajet dans `group_missions` (dédup `j<journeyId>`), écrite par le compte de service.
  const g = { received: 0, created: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const raw of mapGroupList(body.groups ?? [])) {
    g.received++;
    // Heures inconnues côté DICOS (« 0001-01-01 ») : jour de la liste synchronisée.
    const grp = { ...raw, day: raw.day || body.day };
    if (!grp.dicos_id || !isValidDay(grp.day) || !dayClose(grp.day, body.day)) {
      g.skipped++;
      continue;
    }
    const { dicos_id, ...rest } = grp;
    const base: Rec = {
      ...rest,
      district: grp.district || null,
      arr_district: grp.arr_district || null,
    };
    const id = `j${dicos_id}`;
    try {
      const cur = await pb
        .collection("group_missions")
        .getFirstListItem(pb.filter("dicos_id = {:id}", { id }))
        .catch(nullOn404);
      if (cur) {
        if (changed(base, cur as unknown as Rec)) {
          await pb.collection("group_missions").update(cur.id, { ...base, updated_by: svc.id });
          g.updated++;
        } else g.unchanged++;
      } else {
        await pb.collection("group_missions").create({ ...base, dicos_id: id, updated_by: svc.id });
        g.created++;
      }
    } catch {
      g.skipped++;
      if (c.errors.length < 5) c.errors.push(`${id} (groupe)`);
    }
  }

  // Journal des synchros (date « synchronisé il y a X min » des écrans) : jamais bloquant pour l'ingestion.
  const log = (
    kind: "missions" | "groups",
    n: { received: number; created: number; updated: number },
  ) =>
    pb
      .collection("dicos_syncs")
      .create({
        day: body.day,
        kind,
        received: n.received,
        created_count: n.created,
        updated_count: n.updated,
        complete: body.final !== false,
        version,
        synced_by: who.kind === "personal" ? who.userId : "",
      })
      .catch(() => null);
  if (body.dossiers || body.missions) await log("missions", { received, ...c });
  if (body.groups) await log("groups", g);

  const release = await readExtensionRelease();
  return Response.json(
    { day: body.day, received, ...c, groups: g, extension: { latest: release?.version ?? null } },
    { headers: { "cache-control": "no-store" } },
  );
}
