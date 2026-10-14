import { addDays, brusselsDay } from "@/lib/orders/time";
import { quinyxBatchSchema, type QuinyxBatch } from "@/lib/quinyx/model";
import { readExtensionRelease } from "@/server/extension";
import { connectorRequest, ingestQuinyx } from "@/server/quinyx-ingest";

// Ingestion des horaires Quinyx (14 oct. 2026) : un lot = un groupe Quinyx et une période, envoyé par l'extension
// après lecture du planning publié. Tri et conversion côté serveur (`mapQuinyxBatch`), idempotent (identifiant de
// prestation Quinyx unique). Corps borné, débit borné par jeton.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 2_000_000;

export async function POST(request: Request) {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(len) && len > MAX_BODY)
    return Response.json({ error: "Corps trop volumineux." }, { status: 413 });
  const r = await connectorRequest(request, "quinyx-ingest", 20);
  if (r instanceof Response) return r;
  let batch: QuinyxBatch;
  try {
    const text = await readBounded(request, MAX_BODY);
    if (text === null) return Response.json({ error: "Corps trop volumineux." }, { status: 413 });
    batch = quinyxBatchSchema.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: "Corps invalide (planning Quinyx)." }, { status: 400 });
  }
  // Période : de J-10 à J+70 au plus, 62 jours au plus (un lot ne réécrit ni l'historique ni l'avenir lointain).
  const today = brusselsDay();
  if (
    batch.to < batch.from ||
    daysBetween(batch.from, batch.to) > 62 ||
    batch.from < addDays(today, -10) ||
    batch.to > addDays(today, 70)
  )
    return Response.json({ error: "Période invalide." }, { status: 400 });
  try {
    const out = await ingestQuinyx(r.pb, batch, r.who, r.version);
    if ("error" in out) return Response.json({ error: out.error }, { status: out.status });
    const release = await readExtensionRelease().catch(() => null);
    return Response.json({ ...out, extension: { latest: release?.version ?? null } });
  } catch {
    return Response.json({ error: "Écriture impossible dans CSM." }, { status: 502 });
  }
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
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
