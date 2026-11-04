import { contentDisposition } from "@/lib/orders/eml";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { billingXlsx } from "@/server/recap-export";

// Fichier « Transports alternatifs » pour la facturation (Commandes › Archives, 4 nov. 2026) : `2026-11.xlsx` (mois) ou
// `2026-W45.xlsx` (semaine), `?district=DSO` (obligatoire : un fichier par district). Feuilles BUS / TAXI / TAXI PMR /
// Données ; n° de dossier PMR seulement avec `pmr:read`, jamais de nom de voyageur. Droit `archives:read`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "archives:read")) return new Response("Introuvable", { status: 404 });
  const { file } = await params;
  const key = /^(.+)\.xlsx$/.exec(file)?.[1] ?? "";
  const district = (new URL(request.url).searchParams.get("district") ?? "").toUpperCase();
  if (!allow(`recap-xlsx:${user.id}`, 20, 60_000))
    return new Response("Trop de demandes, réessaie dans une minute.", { status: 429 });
  const out = await billingXlsx(user, key, district).catch(() => null);
  if (!out) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(out.bytes), {
    headers: {
      ...HEADERS,
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": contentDisposition("attachment", out.name),
    },
  });
}
