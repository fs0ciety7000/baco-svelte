import { z } from "zod";

import { isValidDay } from "@/lib/orders/time";
import { mapAtmsTrain } from "@/lib/pmr/atms";
import { nullOn404, serviceAuth, tokenOk } from "@/server/dicos-service";
import { env } from "@/server/env";
import { createPb } from "@/server/pocketbase";
import { allow } from "@/server/rate-limit";

// Ingestion des horaires ATMS (temps d'arrêt prévus, export ALEA « Obligatoire », 9 oct. 2026). Même authentification
// que l'ingestion DICOS (secret de connecteur `x-dicos-token`, compte de service `connector` + `dicos:write`). L'extension
// envoie l'itinéraire ATMS d'un train ; le calcul des temps d'arrêt est fait ICI (source unique, `mapAtmsTrain`).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 5_000_000;

const bodySchema = z.object({
  schedules: z
    .array(
      z.object({
        day: z.string().refine(isValidDay),
        train: z.string().regex(/^\d{1,6}$/),
        data: z.unknown(),
      }),
    )
    .min(1)
    .max(60),
});

export async function POST(request: Request) {
  if (!env.CSM_DICOS_TOKEN || !env.CSM_DICOS_PB_EMAIL)
    return Response.json({ error: "Ingestion non configurée." }, { status: 503 });
  const provided = request.headers.get("x-dicos-token") ?? "";
  if (!provided || !tokenOk(provided))
    return Response.json({ error: "Jeton de connecteur invalide." }, { status: 401 });
  if (!allow("atms-ingest", 30, 60_000))
    return Response.json({ error: "Trop de requêtes, réessaie plus tard." }, { status: 429 });
  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BODY)
    return Response.json({ error: "Corps trop volumineux." }, { status: 413 });

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Corps invalide (schedules)." }, { status: 400 });
  }
  let svc: { token: string; id: string };
  try {
    svc = await serviceAuth();
  } catch {
    return Response.json({ error: "Compte de service indisponible." }, { status: 502 });
  }
  const pb = createPb(svc.token);
  const c = { received: 0, stored: 0, skipped: 0 };
  for (const s of body.schedules) {
    c.received++;
    let mapped: ReturnType<typeof mapAtmsTrain>;
    try {
      mapped = mapAtmsTrain(s.data);
    } catch {
      c.skipped++;
      continue;
    }
    if (!mapped.stops.length) {
      c.skipped++;
      continue;
    }
    try {
      const cur = await pb
        .collection("train_schedules")
        .getFirstListItem(pb.filter("day = {:d} && train = {:t}", { d: s.day, t: s.train }))
        .catch(nullOn404);
      const rec = { label: mapped.label.slice(0, 20), stops: mapped.stops, source: "atms" };
      if (cur) await pb.collection("train_schedules").update(cur.id, rec);
      else await pb.collection("train_schedules").create({ ...rec, day: s.day, train: s.train });
      c.stored++;
    } catch {
      c.skipped++;
    }
  }
  return Response.json(c);
}
