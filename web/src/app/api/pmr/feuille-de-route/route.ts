import { contentDisposition } from "@/lib/orders/eml";
import { DUTY_SHORT } from "@/lib/ops/log";
import { brusselsDay, isValidDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { buildRoadmap } from "@/server/data/roadmap";
import { roadmapPdf } from "@/server/pdf/order-pdf";

// Feuille de route PDF d'une gare pour un jour (demande du 10 oct. 2026) : `?gare=…&jour=AAAA-MM-JJ`. Données lues avec
// le jeton de l'agent (règles PocketBase) ; jamais mise en cache.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const CODE_TO_NAME = Object.fromEntries(Object.entries(DUTY_SHORT).map(([n, c]) => [c, n]));

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401, headers: HEADERS });
  if (!can(user, "deplacements:read"))
    return new Response("Introuvable", { status: 404, headers: HEADERS });
  const sp = new URL(request.url).searchParams;
  const gare = (sp.get("gare") ?? "").trim().slice(0, 60);
  const jour = sp.get("jour") ?? "";
  const day = isValidDay(jour) ? jour : brusselsDay();
  if (!gare) return new Response("Gare manquante", { status: 400, headers: HEADERS });
  const data = await buildRoadmap(user, day, gare);
  const district = CODE_TO_NAME[sp.get("district") ?? ""] ?? user.district ?? "";
  const pdf = await roadmapPdf({ ...data, district }, { agentName: user.name || user.username });
  return new Response(new Blob([pdf as Uint8Array<ArrayBuffer>]), {
    headers: {
      ...HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        "inline",
        `${day} · Feuille de route · ${data.station}.pdf`,
      ),
    },
  });
}
