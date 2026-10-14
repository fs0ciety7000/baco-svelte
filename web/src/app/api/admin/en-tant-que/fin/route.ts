import { NextRequest } from "next/server";

import { stopImpersonation } from "@/server/impersonation";

export const dynamic = "force-dynamic";

/**
 * Fin de « Voir en tant que » (bouton « Revenir à mon compte » du bandeau, formulaire HTML) : seule écriture permise
 * pendant le mode (exemptée par le middleware). Trace la fin, efface le cookie `csm_as`, revient sur la fiche du compte.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new Response("Refusé", { status: 403 });
  const targetId = await stopImpersonation();
  return new Response(null, {
    status: 303,
    headers: {
      location: targetId ? `/admin/utilisateurs/${targetId}` : "/",
      "cache-control": "no-store",
    },
  });
}
