import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { spiShapes } from "@/server/data/network";
import { allow } from "@/server/rate-limit";

// Dessin des zones SPI (couche « Zones SPI » de la Carte PN, vue d'administration) : cellules par zone, frontières et
// étiquettes, chargé seulement quand la couche est affichée. Rien de nominatif ; gardé 5 min côté serveur.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Non connecté", { status: 401 });
  if (!can(user, "carte_pn:read") && !can(user, "referentiels:manage"))
    return new Response("Introuvable", { status: 404 });
  if (!allow(`zones-spi:${user.id}`, 30, 60_000))
    return new Response("Trop de demandes", { status: 429 });
  const shapes = await spiShapes();
  return Response.json(shapes, {
    headers: { "cache-control": "private, max-age=120", "x-content-type-options": "nosniff" },
  });
}
