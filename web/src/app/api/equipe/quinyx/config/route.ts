import { readExtensionRelease } from "@/server/extension";
import { connectorRequest, enabledGroups } from "@/server/quinyx-ingest";

// Groupes Quinyx à lire par l'extension (configurés dans Administration › Quinyx). Les identifiants de groupe ne sont
// jamais dans le code de l'extension ni dans Git : l'extension les demande ici, avec son jeton de connecteur.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const r = await connectorRequest(request, "quinyx-config", 30);
  if (r instanceof Response) return r;
  try {
    const release = await readExtensionRelease().catch(() => null);
    return Response.json(
      { groups: await enabledGroups(r.pb), extension: { latest: release?.version ?? null } },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Lecture des groupes impossible." }, { status: 502 });
  }
}
