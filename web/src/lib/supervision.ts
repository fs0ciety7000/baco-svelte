// Supervision (Admin › Santé, 11 oct. 2026) : lecture de l'état renvoyé par la route interne PocketBase
// `/api/csm/health` et verdicts purs (testés) affichés en badges.

export type CronRun = {
  name: string;
  lastStart: string;
  lastEnd: string;
  ok: boolean;
  error: string;
  lastErrorAt: string;
  durationMs: number;
  runs: number;
  /** Périodicité attendue en minutes (0 = inconnue). */
  expectedMin: number;
};

export type Supervision = {
  at: string;
  backups: {
    count?: number;
    last?: { key: string; size: number; modified: string } | null;
    s3?: boolean;
    error?: string;
  };
  crons: CronRun[];
  smtp: boolean;
  archives: { r2?: boolean; total?: number; pending?: number; errors?: number; error?: string };
  extension: { version: string; tokens: number; last: string }[];
  journal: { months: number; oldest: string };
};

export type Verdict = "ok" | "warn" | "danger" | "idle";

/** Date PocketBase (« 2026-10-11 14:00:00.000Z ») ou ISO → millisecondes ; NaN si vide ou illisible. */
export function toMs(v: string): number {
  if (!v) return Number.NaN;
  return new Date(v.includes("T") ? v : v.replace(" ", "T")).getTime();
}

/**
 * État d'une tâche planifiée : jamais vue depuis le démarrage (« idle »), dernier passage en erreur (« danger »), en
 * retard au-delà de deux périodes + 5 min (« warn »), sinon « ok ».
 */
export function cronVerdict(run: CronRun, nowMs: number): Verdict {
  const end = toMs(run.lastEnd);
  if (!run.runs || Number.isNaN(end)) return "idle";
  if (!run.ok) return "danger";
  if (run.expectedMin > 0 && nowMs - end > (run.expectedMin * 2 + 5) * 60_000) return "warn";
  return "ok";
}

/** Dernière sauvegarde : moins de 26 h = ok, moins de 50 h = à surveiller, au-delà (ou aucune) = alerte. */
export function backupVerdict(lastIso: string | undefined, nowMs: number): Verdict {
  const t = toMs(lastIso ?? "");
  if (Number.isNaN(t)) return "danger";
  const h = (nowMs - t) / 3_600_000;
  if (h < 26) return "ok";
  if (h < 50) return "warn";
  return "danger";
}

/** Archives des bons : erreurs R2 = alerte ; attente > 20 avec R2 actif = à surveiller (le cron en traite 20 / 5 min). */
export function archivesVerdict(a: Supervision["archives"]): Verdict {
  if (a.error) return "danger";
  if (!a.r2) return "idle";
  if ((a.errors ?? 0) > 0) return "danger";
  if ((a.pending ?? 0) > 20) return "warn";
  return "ok";
}

/** Taille lisible (« 381 Ko », « 12,4 Mo »). */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} Mo`;
}

/** Périodicité lisible (« toutes les 5 min », « chaque nuit »). */
export function everyLabel(min: number): string {
  if (!min) return "—";
  if (min >= 1440) return "chaque nuit";
  if (min >= 60) return `toutes les ${Math.round(min / 60)} h`;
  return `toutes les ${min} min`;
}
