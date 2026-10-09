import { z } from "zod";

import { stationId, trainId } from "@/lib/ops/irail";
import { brusselsDay, brusselsTime, isValidDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { allow } from "@/server/rate-limit";
import { board, composition, disturbances, IrailError, stations, train } from "@/server/irail";

// Relais iRail (trains en direct) : le navigateur n'appelle que le domaine CSM. Droit `live:read` vérifié ici ;
// paramètres validés ; réponse normalisée, jamais le JSON brut d'iRail.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().refine(isValidDay);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ op: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Non connecté" }, 401);
  if (!can(user, "live:read")) return json({ error: "Introuvable" }, 404);
  const { op } = await params;
  // 60 requêtes par minute et par agent (un écran ouvert en consomme 2 à 4). Les perturbations ont leur propre
  // compteur : réponse en cache serveur 5 min (un seul appel iRail quel que soit le nombre d'agents), et deux widgets
  // d'accueil + l'onglet les lisent (le tableau de bord en recharge pouvait atteindre 429, CI du 9 oct.).
  const bucket = op === "perturbations" ? `irail-perturbations:${user.id}` : `irail:${user.id}`;
  if (!allow(bucket, 60, 60_000))
    return json({ error: "Trop de requêtes : réessaie dans un instant." }, 429);
  const sp = new URL(request.url).searchParams;
  try {
    switch (op) {
      case "gares":
        return json({ stations: await stations() });
      case "tableau": {
        const p = z
          .object({
            gare: stationId,
            sens: z.enum(["departure", "arrival"]).default("departure"),
            jour: day.default(brusselsDay()),
            heure: time.default(brusselsTime()),
          })
          .safeParse({
            gare: sp.get("gare") ?? undefined,
            sens: sp.get("sens") ?? undefined,
            jour: sp.get("jour") || undefined,
            heure: sp.get("heure") || undefined,
          });
        if (!p.success) return json({ error: "Paramètres invalides" }, 400);
        const r = await board({
          stationId: p.data.gare,
          kind: p.data.sens,
          day: p.data.jour,
          time: p.data.heure,
        });
        return json(r);
      }
      case "train": {
        const p = z
          .object({ train: trainId, jour: day.default(brusselsDay()) })
          .safeParse({ train: sp.get("train") ?? "", jour: sp.get("jour") || undefined });
        if (!p.success) return json({ error: "Numéro de train illisible" }, 400);
        return json(await train(p.data.train, p.data.jour));
      }
      case "composition": {
        const p = trainId.safeParse(sp.get("train") ?? "");
        if (!p.success) return json({ error: "Numéro de train illisible" }, 400);
        return json(await composition(p.data));
      }
      case "perturbations":
        return json(await disturbances());
      default:
        return json({ error: "Introuvable" }, 404);
    }
  } catch (e) {
    if (e instanceof IrailError && e.message === "introuvable")
      return json({ error: "Aucune donnée iRail pour cette recherche." }, 404);
    if (e instanceof IrailError && e.message === "occupé")
      return json({ error: "iRail est très sollicité : réessaie dans un instant." }, 503);
    return json({ error: "iRail ne répond pas. Réessaie dans un instant." }, 502);
  }
}
