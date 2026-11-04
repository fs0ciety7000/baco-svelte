"use server";

import { compareVersions, seenVersion } from "@/lib/changelog";
import { isScreen } from "@/lib/permissions";
import { tourPending, tourPrefValue } from "@/lib/tour/steps";
import { requireUser } from "@/server/auth";
import { currentVersion } from "@/server/changelog";
import { createPb } from "@/server/pocketbase";
import { readSessionToken } from "@/server/session";

/**
 * Visite guidée vue (lancée, reportée ou fermée) : `users.preferences.tour = { seen, version }` avec le jeton de l'agent.
 * La fenêtre « CSM a été mis à jour » n'est pas montrée en plus à la première connexion : la version livrée est notée
 * comme vue dans la même écriture (jamais en arrière). Rien pendant « Voir en tant que » ni pour l'Écran.
 */
export async function markTourSeen(): Promise<void> {
  const user = await requireUser();
  if (user.impersonatedBy || isScreen(user)) return;
  const pb = createPb(await readSessionToken());
  const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
  const preferences = (record.preferences as Record<string, unknown> | null) ?? {};
  if (!tourPending(preferences)) return;
  const next: Record<string, unknown> = { ...preferences, tour: tourPrefValue() };
  const latest = currentVersion();
  const seen = seenVersion(preferences);
  if (latest && (!seen || compareVersions(seen, latest) < 0)) next.changelogSeen = latest;
  await pb.collection("users").update(user.id, { preferences: next });
}
