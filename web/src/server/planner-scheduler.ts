import "server-only";

import { addDays, brusselsDay } from "@/lib/orders/time";
import { ingestConfigured, serviceAuth } from "@/server/dicos-service";
import { syncPlannerFromAssists } from "@/server/planner-sync";
import { createPb } from "@/server/pocketbase";

// Planificateur de tâches PMR (15 oct. 2026) : toutes les 5 min, les missions DICOS acceptées de la veille au
// surlendemain (`pmr_assists`) sont reprises en tâches (`syncPlannerFromAssists`, compte de service) : une mission
// nouvellement créée apparaît dans « À attribuer » même si elle a été synchronisée avant le planificateur ou par un
// lot qui n'a pas pu mettre la tâche à jour ; une mission passée « annulée » annule sa tâche (retirée de l'écran).
// L'attribution n'est jamais touchée. Actif en production ou si CSM_PLANNER_SYNC=on, jamais sans compte de service.

const g = globalThis as { __csmPlannerSync?: boolean; __csmPlannerSyncRunning?: boolean };

export const PLANNER_SYNC_MS = 5 * 60_000;

/** Jours repris à chaque passage : veille (nuit en cours), jour, lendemain, surlendemain. */
export function plannerSyncDays(today: string): string[] {
  return [-1, 0, 1, 2].map((n) => addDays(today, n));
}

export async function runPlannerSync(): Promise<void> {
  if (g.__csmPlannerSyncRunning) return;
  g.__csmPlannerSyncRunning = true;
  try {
    const pb = createPb((await serviceAuth()).token);
    for (const d of plannerSyncDays(brusselsDay())) await syncPlannerFromAssists(pb, d);
  } catch (e) {
    console.error("[planificateur] synchro :", e instanceof Error ? e.message : e);
  } finally {
    g.__csmPlannerSyncRunning = false;
  }
}

export function startPlannerScheduler() {
  if (g.__csmPlannerSync) return;
  const flag = process.env.CSM_PLANNER_SYNC ?? "";
  const enabled = flag === "on" || (flag === "" && process.env.NODE_ENV === "production");
  if (!enabled || !ingestConfigured()) return;
  g.__csmPlannerSync = true;
  setTimeout(() => void runPlannerSync(), 60_000).unref?.();
  setInterval(() => void runPlannerSync(), PLANNER_SYNC_MS).unref?.();
}
