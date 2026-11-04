import { contentDisposition } from "@/lib/orders/eml";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { weekZip } from "@/server/recap-export";

// Zip d'une semaine de bons (Commandes › Archives, 4 nov. 2026) : PDF de chaque bon bus / taxi (archivé, sinon produit à
// la volée, taxi sans nominatif PMR) + `recap.csv`. Droit `archives:read` ; bloqué en « voir en tant que » (middleware).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ week: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "archives:read")) return new Response("Introuvable", { status: 404 });
  const { week } = await params;
  if (!allow(`recap-zip:${user.id}`, 10, 60_000))
    return new Response("Trop de demandes, réessaie dans une minute.", { status: 429 });
  const zip = await weekZip(user, week).catch(() => null);
  if (!zip) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(zip), {
    headers: {
      ...HEADERS,
      "content-type": "application/zip",
      "content-disposition": contentDisposition("attachment", `Bons ${week}.zip`),
    },
  });
}
