"use server";

import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import {
  readTimetableStatus,
  runTimetableImport,
  STALE_RUN_MS,
  timetableConfigured,
  timetableRunning,
} from "@/server/timetable/import";

// Référentiel des trains : mise à jour à la demande (`referentiels:manage` : admin, sysop ou rôle qui la reçoit). L'import dure environ une minute : il est lancé
// sans être attendu, l'écran relit son état (`app_settings.timetable`).

export async function startTimetableImport(): Promise<
  { ok: true; running: boolean } | { ok: false; error: string }
> {
  try {
    const user = await requireUser();
    if (!can(user, "referentiels:manage"))
      return { ok: false, error: "Réservé aux gestionnaires des référentiels." };
    if (!timetableConfigured())
      return { ok: false, error: "Import non configuré (CSM_INTERNAL_SECRET)." };
    if (timetableRunning()) return { ok: true, running: true };
    const st = await readTimetableStatus().catch(() => null);
    if (st?.state === "running" && Date.now() - Date.parse(st.startedAt ?? "") < STALE_RUN_MS)
      return { ok: true, running: true };
    // Après la réponse : l'import (une minute environ) ne retient pas la requête. Aucun nom dans l'état (lisible par
    // tout agent connecté via app_settings).
    after(() => runTimetableImport("admin").then(() => undefined));
    return { ok: true, running: false };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}
