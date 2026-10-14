"use server";

import { compareVersions, isVersion, seenVersion } from "@/lib/changelog";
import { requireUser } from "@/server/auth";
import { currentVersion } from "@/server/changelog";
import { createPb } from "@/server/pocketbase";
import { readSessionToken } from "@/server/session";

/**
 * Fenêtre « CSM a été mis à jour » fermée : note la version vue dans `users.preferences.changelogSeen` (jeton de
 * l'agent). Jamais au-delà de la version livrée, jamais en arrière.
 */
export async function acknowledgeChangelog(version: string): Promise<void> {
  const user = await requireUser();
  if (user.impersonatedBy) return;
  const latest = currentVersion();
  if (!isVersion(version) || !latest || compareVersions(version, latest) > 0) return;
  const pb = createPb(await readSessionToken());
  const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
  const preferences = (record.preferences as Record<string, unknown> | null) ?? {};
  const seen = seenVersion(preferences);
  if (seen && compareVersions(seen, version) >= 0) return;
  await pb
    .collection("users")
    .update(user.id, { preferences: { ...preferences, changelogSeen: version } });
}
