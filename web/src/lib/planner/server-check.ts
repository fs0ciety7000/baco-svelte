// Contrôles serveur des écritures du planificateur (actions `app/(app)/pmr/planificateur/actions.ts`), purs et testés :
// le serveur ne se fie jamais au verdict du navigateur.

import { addDays } from "@/lib/orders/time";

import { checkAssign } from "./assign";
import { stationKey } from "./window";
import type { AssigneeKind, PlannerAssignee, PlannerContext } from "./types";

export type ServerTarget = { kind: AssigneeKind; agentId?: string; label?: string };

/**
 * Attribution contrôlée par le moteur (`checkAssign`) sur la journée relue : refus (`block`) avec sa raison ; un
 * avertissement est accepté. Le guichet B-CS visé doit être celui de la gare de la tâche. Renvoie le contexte avec la
 * tâche attribuée, pour contrôler la suivante d'un lot avec celle-ci déjà posée.
 */
export function assignOnServer(
  ctx: PlannerContext,
  id: string,
  station: string,
  t: ServerTarget,
): { ok: true; ctx: PlannerContext } | { ok: false; error: string } {
  if (t.kind === "bcs" && t.label && stationKey(t.label) !== stationKey(station))
    return { ok: false, error: `Ce guichet est à ${t.label} : choisis celui de ${station}.` };
  const task = ctx.tasks.find((x) => x.id === id);
  if (!task) return { ok: true, ctx };
  const who: PlannerAssignee =
    t.kind === "agent"
      ? { kind: "agent", agentId: t.agentId ?? "" }
      : { kind: t.kind, label: t.kind === "bcs" ? t.label || station : (t.label ?? "") };
  const r = checkAssign(task, who, ctx);
  if (r.level === "block")
    return { ok: false, error: `Attribution refusée : ${r.reasons.join(" · ")}.` };
  const placed = { ...task, assignee: who };
  return { ok: true, ctx: { ...ctx, tasks: ctx.tasks.map((x) => (x.id === id ? placed : x)) } };
}

/** Jours permis pour une tâche encodée à la main : J-2 → J+60 (Bruxelles). */
export function manualDayAllowed(day: string, today: string): boolean {
  return day >= addDays(today, -2) && day <= addDays(today, 60);
}

/**
 * Première erreur d'un lot de tâches encodées à la main : gare manquante pour une PMR, gare ou autre gare absente des
 * noms retenus (`known`). Le message cite le n° de ligne, JAMAIS son contenu (une gare mal découpée peut porter un nom
 * de voyageur).
 */
export function manualStationIssue(
  rows: readonly { kind: string; station: string; other_station: string }[],
  known: ReadonlySet<string>,
): string | null {
  for (const [i, l] of rows.entries()) {
    const n = i + 1;
    if ((l.kind === "pmr_in" || l.kind === "pmr_out") && !l.station)
      return `Ligne ${n} : gare manquante pour une prise en charge PMR.`;
    if (l.station && !known.has(l.station))
      return `Ligne ${n} : gare inconnue, vérifie l'orthographe.`;
    if (l.other_station && !known.has(l.other_station))
      return `Ligne ${n} : autre gare inconnue, vérifie l'orthographe.`;
  }
  return null;
}
