import { parseDistricts } from "@/lib/district-param";
import { contentDisposition } from "@/lib/orders/eml";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { DISTRICT_CODES, monthPdf } from "@/server/recap-export";

// Récapitulatif mensuel des bons en PDF (Commandes › Archives, 4 nov. 2026) : bons du mois par semaine, totaux. Sans
// nominatif PMR. `?district=DSO` (répétable) ; aucun = tous. Droit `archives:read`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HEADERS = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ month: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "archives:read")) return new Response("Introuvable", { status: 404 });
  const { month } = await params;
  if (!allow(`recap-pdf:${user.id}`, 20, 60_000))
    return new Response("Trop de demandes, réessaie dans une minute.", { status: 429 });
  const districts = parseDistricts(
    new URL(request.url).searchParams.getAll("district"),
    DISTRICT_CODES,
  );
  const pdf = await monthPdf(user, month, districts).catch(() => null);
  if (!pdf) return new Response("Introuvable", { status: 404 });
  return new Response(Buffer.from(pdf), {
    headers: {
      ...HEADERS,
      "content-type": "application/pdf",
      "content-disposition": contentDisposition(
        "attachment",
        `Récapitulatif des bons ${month}.pdf`,
      ),
    },
  });
}
