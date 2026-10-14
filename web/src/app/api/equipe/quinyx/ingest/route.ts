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
    const text = await request.text();
    if (text.length > MAX_BODY)
      return Response.json({ error: "Corps trop volumineux." }, { status: 413 });
    batch = quinyxBatchSchema.parse(JSON.parse(text));
  } catch {
    return Response.json({ error: "Corps invalide (planning Quinyx)." }, { status: 400 });
  }
  if (batch.to < batch.from || daysBetween(batch.from, batch.to) > 62)
    return Response.json({ error: "Période invalide (62 jours au plus)." }, { status: 400 });
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
