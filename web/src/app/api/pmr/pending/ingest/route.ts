import { z } from "zod";

import { addDays, brusselsDay } from "@/lib/orders/time";
import { readExtensionRelease } from "@/server/extension";
import { ingestPending } from "@/server/planner-sync";
import { connectorRequest } from "@/server/quinyx-ingest";

// Dossiers DICOS « à vérifier » (planificateur PMR, 15 oct. 2026, cadrage §7) : l'extension (≥ 1.9.0) lit
// `GET /api/reservations/disableds/to-check` pendant la synchro DICOS et n'envoie que dossier, statut, trains, gares,
// heures, sens, type et nombre de voyageurs, vérifications par gare — jamais le client, les remarques ni le point de
// rencontre. Même authentification que l'ingestion des missions (jeton de connecteur, compte de service), débit et corps
// bornés. Conversion côté serveur (`lib/pmr/dicos-pending.ts`), upsert idempotent, aucune suppression.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2_000_000;

const bodySchema = z.object({ dossiers: z.array(z.unknown()).max(1000) });

export async function POST(request: Request) {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BODY)
    return Response.json({ error: "Corps trop volumineux." }, { status: 413 });
  const r = await connectorRequest(request, "dicos-pending", 20);
  if (r instanceof Response) return r;
  let body: z.infer<typeof bodySchema>;
  try {
    const text = await readBounded(request, MAX_BODY);
    if (text === null) return Response.json({ error: "Corps trop volumineux." }, { status: 413 });
    body = bodySchema.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: "Corps invalide (dossiers en attente)." }, { status: 400 });
  }
  // Jours acceptés : de J-2 à J+60 (les dossiers « à vérifier » portent sur les prochains jours).
  const today = brusselsDay();
  const from = addDays(today, -2);
  const to = addDays(today, 60);
  try {
    const out = await ingestPending(r.pb, body.dossiers, (d) => d >= from && d <= to);
    const release = await readExtensionRelease().catch(() => null);
    return Response.json(
      { ...out, extension: { latest: release?.version ?? null } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Écriture impossible dans CSM." }, { status: 502 });
  }
}

/** Corps lu en flux et coupé au-delà de `max` octets (même sans `content-length`) ; null si trop long. */
async function readBounded(request: Request, max: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => null);
      return null;
    }
    parts.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(parts));
}
