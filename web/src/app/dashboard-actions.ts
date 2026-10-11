"use server";

import { layoutSchema, type DashboardLayout } from "@/design/dashboard-layout";
import { shiftChoiceSchema, shiftDayFor, type ShiftChoice, type ShiftKind } from "@/lib/shift";
import { requireUser } from "@/server/auth";
import { createPb } from "@/server/pocketbase";
import { readSessionToken } from "@/server/session";

/** Enregistre la disposition du tableau de bord dans les préférences de l'agent (avec son propre jeton). */
export async function saveDashboardLayout(input: DashboardLayout): Promise<void> {
  const layout = layoutSchema.parse(input);
  const user = await requireUser();
  const pb = createPb(await readSessionToken());
  const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
  const preferences = {
    ...((record.preferences as Record<string, unknown> | null) ?? {}),
    dashboard: layout,
  };
  await pb.collection("users").update(user.id, { preferences });
}

/** Service du jour (widget « Fin de service ») ; `null` efface le choix. Renvoie le choix enregistré. */
export async function saveShift(kind: ShiftKind | null): Promise<ShiftChoice | null> {
  const user = await requireUser();
  const choice = kind === null ? null : shiftChoiceSchema.parse({ kind, day: shiftDayFor(kind) });
  const pb = createPb(await readSessionToken());
  const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
  const preferences = {
    ...((record.preferences as Record<string, unknown> | null) ?? {}),
    shift: choice,
  };
  await pb.collection("users").update(user.id, { preferences });
  return choice;
}
