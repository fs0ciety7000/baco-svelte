import { inBelgium } from "@/lib/ops/tiles";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";

// Fonds de carte de la carte PN (option B du 8 octobre 2026) : tuiles raster relayées par le serveur CSM
// (le navigateur ne parle qu'au domaine CSM). Réservé à `carte_pn:read`, limité à la Belgique et aux zooms utiles
// (pas de relais ouvert), cache mémoire + cache du navigateur (règles d'usage d'OpenStreetMap : User-Agent
// identifiant, pas de téléchargement en masse, attribution affichée sur la carte).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TILES = 800;
const TTL = 7 * 24 * 3600_000;
const tiles = new Map<string, { at: number; body: ArrayBuffer; type: string }>();

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "carte_pn:read")) return new Response("Introuvable", { status: 404 });
  const p = await params;
  const [z, x, y] = [p.z, p.x, p.y].map((v) => (/^\d{1,6}$/.test(v) ? Number(v) : NaN)) as [
    number,
    number,
    number,
  ];
  if (!inBelgium(z, x, y)) return new Response("Hors zone", { status: 404 });
  const key = `${z}/${x}/${y}`;
  const headers = {
    "cache-control": "private, max-age=604800",
    "x-content-type-options": "nosniff",
  };
  const hit = tiles.get(key);
  if (hit && Date.now() - hit.at < TTL)
    return new Response(hit.body, { headers: { ...headers, "content-type": hit.type } });
  try {
    const url = env.TILES_URL.replace("{z}", String(z))
      .replace("{x}", String(x))
      .replace("{y}", String(y));
    const res = await fetch(url, {
      headers: { "user-agent": env.CSM_USER_AGENT },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(png|jpeg|webp)$/.test(type))
      return new Response("Tuile indisponible", { status: 502 });
    const body = await res.arrayBuffer();
    tiles.delete(key);
    tiles.set(key, { at: Date.now(), body, type });
    if (tiles.size > MAX_TILES) tiles.delete(tiles.keys().next().value as string);
    return new Response(body, { headers: { ...headers, "content-type": type } });
  } catch {
    if (hit) return new Response(hit.body, { headers: { ...headers, "content-type": hit.type } });
    return new Response("Tuile indisponible", { status: 502 });
  }
}
