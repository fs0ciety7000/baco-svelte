"use server";

import { unstable_rethrow } from "next/navigation";

import { layoutSchema, type DashboardLayout } from "@/design/dashboard-layout";
import { SEEN_KEY_RE, updateTodoSeen, type TodoSeen } from "@/lib/dashboard/todo-seen";
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

/**
 * « Vu » d'une alerte de la file « À traiter » (train supprimé ou en retard, consigne épinglée) : masquée pour l'agent seul,
 * `preferences.todoSeen` (clé → instant, élagué à 2 jours). `seen = false` = « Annuler ». Lire-modifier-écrire : le client
 * enchaîne ses appels en file. Jamais en « Voir en tant que » (lecture seule).
 */
export async function markTodoSeen(
  key: string,
  seen: boolean,
): Promise<{ ok: true; seen: TodoSeen } | { ok: false; error: string }> {
  try {
    if (typeof key !== "string" || !SEEN_KEY_RE.test(key))
      return { ok: false, error: "Élément inconnu." };
    const user = await requireUser();
    if (user.impersonatedBy)
      return { ok: false, error: "Lecture seule : « Voir en tant que » ne modifie rien." };
    const pb = createPb(await readSessionToken());
    const record = await pb.collection("users").getOne(user.id, { fields: "preferences" });
    const prefs = (record.preferences as Record<string, unknown> | null) ?? {};
    const next = updateTodoSeen((prefs.todoSeen as TodoSeen | undefined) ?? {}, key, seen === true);
    await pb.collection("users").update(user.id, { preferences: { ...prefs, todoSeen: next } });
    return { ok: true, seen: next };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: "Enregistrement impossible, réessaie." };
  }
}
