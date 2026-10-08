import { env } from "@/server/env";

// Sonde de santé (Coolify) : le serveur web répond, et PocketBase est joignable depuis le serveur.
export const dynamic = "force-dynamic";

export async function GET() {
  let pocketbase = false;
  try {
    const res = await fetch(`${env.PB_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    pocketbase = res.ok;
  } catch {
    pocketbase = false;
  }
  return Response.json({ ok: true, pocketbase }, { headers: { "cache-control": "no-store" } });
}
