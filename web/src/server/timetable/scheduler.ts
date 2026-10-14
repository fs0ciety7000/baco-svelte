import "server-only";

import { brusselsDay, brusselsTime } from "@/lib/orders/time";
import { env } from "@/server/env";

import {
  readTimetableStatus,
  remoteGtfsModified,
  runTimetableImport,
  STALE_RUN_MS,
  timetableConfigured,
  timetableRunning,
} from "./import";

// Import quotidien du référentiel des relations de trains : à partir de 5 h (Bruxelles), une fois par jour, dès que
// la ponctualité J-1 d'Infrabel est publiée. Vérifié toutes les 20 min ; après un échec, nouvel essai 2 h plus tard.
// Actif en production (CSM_TIMETABLE vide) ou si CSM_TIMETABLE=on ; jamais sans secret interne (CI, poste local).

const g = globalThis as { __csmTimetable?: boolean; __csmGtfsCheck?: number };

/** Vérification d'un nouveau GTFS : toutes les 3 h (requête HEAD, quelques octets). */
const GTFS_CHECK_MS = 3 * 3600_000;

export function startTimetableScheduler() {
  if (g.__csmTimetable) return;
  const enabled =
    env.CSM_TIMETABLE === "on" ||
    (env.CSM_TIMETABLE === "" && process.env.NODE_ENV === "production");
  if (!enabled || !timetableConfigured()) return;
  g.__csmTimetable = true;
  const tick = async () => {
    if (timetableRunning()) return;
    try {
      const st = await readTimetableStatus();
      const now = Date.now();
      const since = (iso?: string) => (iso ? now - Date.parse(iso) : Infinity);
      // Un import « en cours » depuis plus de 30 min a été interrompu (redéploiement) : il ne bloque plus.
      if (st.state === "running" && since(st.startedAt) < STALE_RUN_MS) return;
      if (st.state === "error" && since(st.finishedAt) < 2 * 3600_000) return;
      const lastOkDay = st.lastOkAt ? brusselsDay(new Date(st.lastOkAt)) : "";
      const hour = Number(brusselsTime().slice(0, 2));
      if (!st.lastOkAt || (lastOkDay !== brusselsDay() && hour >= 5)) {
        void runTimetableImport("planifié").catch((e) => console.error("[timetable]", e));
        return;
      }
      // Nouveau GTFS publié par la SNCB dans la journée : tous les référentiels sont reconstruits aussitôt.
      if (now - (g.__csmGtfsCheck ?? 0) >= GTFS_CHECK_MS) {
        g.__csmGtfsCheck = now;
        const remote = await remoteGtfsModified().catch(() => "");
        if (remote && st.gtfsModified && remote !== st.gtfsModified)
          void runTimetableImport("nouveau GTFS").catch((e) => console.error("[timetable]", e));
      }
    } catch (e) {
      console.error("[timetable] planification :", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, 90_000).unref?.();
  setInterval(tick, 20 * 60_000).unref?.();
}
