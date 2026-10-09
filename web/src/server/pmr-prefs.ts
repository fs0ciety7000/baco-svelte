import "server-only";

import { cancelledPref, storedCancelledPref, type CancelledPref } from "@/lib/pmr/cancelled-pref";
import type { SessionUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

/**
 * Choix « masquer les annulées » effectif pour la page, et mémorisation dans les préférences de l'agent (avec son
 * propre jeton) quand le paramètre d'URL le change. Une erreur d'écriture ne bloque jamais l'affichage.
 */
export async function resolveCancelledPref(
  user: SessionUser,
  param: string | undefined,
): Promise<CancelledPref> {
  const stored = storedCancelledPref(user.preferences);
  const effective = cancelledPref(param, stored);
  if (param === effective && effective !== (stored ?? "affichees")) {
    try {
      const pb = await pbForRequest();
      const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
      const prefs = (record.preferences as Record<string, unknown> | null) ?? {};
      const pmr = (prefs.pmr as Record<string, unknown> | undefined) ?? {};
      await pb
        .collection("users")
        .update(user.id, { preferences: { ...prefs, pmr: { ...pmr, cancelled: effective } } });
    } catch {
      // Préférence non enregistrée : le choix vaut quand même pour cette page (paramètre d'URL).
    }
  }
  return effective;
}
