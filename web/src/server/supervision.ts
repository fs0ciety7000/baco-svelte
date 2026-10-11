import "server-only";

import type { Supervision } from "@/lib/supervision";

import { env } from "./env";

// Supervision (Admin › Santé) : la liste des sauvegardes et les battements des tâches planifiées ne sont pas lisibles
// avec le jeton d'un agent → route interne PocketBase `/api/csm/health` (secret CSM_INTERNAL_SECRET). À n'appeler que
// pour un administrateur (la page fait `requireAdmin()`).

export const supervisionEnabled = () => env.CSM_INTERNAL_SECRET.length >= 32;

export async function readSupervision(): Promise<Supervision | null> {
  if (!supervisionEnabled()) return null;
  try {
    const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/health`, {
      headers: { "x-csm-internal": env.CSM_INTERNAL_SECRET },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Supervision>;
    return {
      at: body.at ?? new Date().toISOString(),
      backups: body.backups ?? {},
      crons: Array.isArray(body.crons) ? body.crons : [],
      smtp: !!body.smtp,
      archives: body.archives ?? {},
      extension: Array.isArray(body.extension) ? body.extension : [],
      journal: body.journal ?? { months: 0, oldest: "" },
    };
  } catch {
    return null;
  }
}
