// Fenêtres des prises en charge et regroupements (REGLES §2.1).

import { foldStation } from "@/lib/stations/search";
import { MINUTE, toIso, toMs } from "./time";
import { DEFAULT_PLANNER_SETTINGS, type PlannerSettings, type PlannerTask } from "./types";

export const LIGHT_TYPES = ["NV", "MR", "DCO"] as const;
export const WHEELCHAIR_TYPES = ["CRF", "CRE", "CRP"] as const;
export const PMR_TYPES = [...LIGHT_TYPES, ...WHEELCHAIR_TYPES] as const;

export type PmrCategory = "light" | "wheelchair";

const keyCache = new Map<string, string>();
/** Clé de gare (forme repliée de `foldStation`, mise en cache). */
export function stationKey(name: string | undefined | null): string {
  const raw = name ?? "";
  let k = keyCache.get(raw);
  if (k === undefined) {
    k = foldStation(raw);
    if (keyCache.size > 5000) keyCache.clear();
    keyCache.set(raw, k);
  }
  return k;
}

/**
 * Catégorie PMR : fauteuil (CRF, CRE, CRP) ou light (NV, MR, DCO). Type absent ou inconnu : `light: false` de la tâche
 * donne fauteuil (assistance complète), sinon light (règle « inconnu = light »).
 */
export function pmrCategory(task: Pick<PlannerTask, "pmrType" | "light">): PmrCategory {
  const t = (task.pmrType ?? "").toUpperCase().trim();
  if ((WHEELCHAIR_TYPES as readonly string[]).includes(t)) return "wheelchair";
  if ((LIGHT_TYPES as readonly string[]).includes(t)) return "light";
  return task.light === false ? "wheelchair" : "light";
}

export const isPmr = (task: Pick<PlannerTask, "kind">) =>
  task.kind === "pmr_in" || task.kind === "pmr_out";

const CANCELLED = new Set(["annulee", "annulée", "cancelled", "canceled"]);
/** Tâche annulée (statut CSM ou statut DICOS). */
export function isCancelled(task: Pick<PlannerTask, "status" | "dicosStatus">): boolean {
  return task.status === "annulee" || CANCELLED.has((task.dicosStatus ?? "").trim().toLowerCase());
}

/**
 * Fenêtre d'une tâche. PMR avec heure de train T : light IN T−15 → T+5, OUT T−5 → T+15 ; fauteuil IN T−20 → T+10,
 * OUT T−10 → T+20 (réglages). Taxi : même fenêtre, T = heure du taxi. Autre tâche ou sans T : start / end inchangés.
 */
export function taskWindow(
  task: PlannerTask,
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
): { start: string; end: string } {
  const t = toMs(task.trainAt);
  if (!isPmr(task) || Number.isNaN(t)) return { start: task.start, end: task.end };
  const w = settings.windows[pmrCategory(task)][task.kind === "pmr_in" ? "in" : "out"];
  return { start: toIso(t - w.before * MINUTE), end: toIso(t + w.after * MINUTE) };
}

const ownKey = (k: string | undefined) => !!k && (k.startsWith("cx:") || k.startsWith("tr:"));
const trainNorm = (t: string | undefined) => (t ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Recalcule les fenêtres et les liens :
 * - correspondance : même dossier, OUT puis IN dans la même gare (clé `foldStation`), IN moins de 30 min après le OUT →
 *   OUT jusqu'à l'heure du train de départ, IN de T à T+5 (light) / T+10 (fauteuil), même `linkKey` `cx:<id du OUT>` ;
 * - plusieurs PMR d'un même train, même gare, même heure (hors correspondance) → `linkKey` `tr:<train>:<gare>:<heure>`.
 * Les tâches annulées gardent leur fenêtre standard et aucun lien ; un lien posé à la main (autre préfixe) est gardé.
 * Renvoie des copies, l'entrée n'est pas modifiée.
 */
export function linkConnections(
  tasks: PlannerTask[],
  settings: PlannerSettings = DEFAULT_PLANNER_SETTINGS,
): PlannerTask[] {
  const out = tasks.map((t) => {
    const copy: PlannerTask = { ...t, ...taskWindow(t, settings) };
    if (ownKey(copy.linkKey)) delete copy.linkKey;
    return copy;
  });
  const live = out.filter((t) => isPmr(t) && !isCancelled(t) && !Number.isNaN(toMs(t.trainAt)));

  // Correspondances, par dossier + gare.
  const byDossier = new Map<string, PlannerTask[]>();
  for (const t of live) {
    if (!t.dossier) continue;
    const k = `${t.dossier}|${stationKey(t.station)}`;
    const list = byDossier.get(k);
    if (list) list.push(t);
    else byDossier.set(k, [t]);
  }
  const maxGap = settings.connectionMaxMinutes * MINUTE;
  const linked = new Set<string>();
  for (const list of byDossier.values()) {
    const outs = list
      .filter((t) => t.kind === "pmr_out")
      .sort((a, b) => toMs(a.trainAt) - toMs(b.trainAt));
    const ins = list
      .filter((t) => t.kind === "pmr_in")
      .sort((a, b) => toMs(a.trainAt) - toMs(b.trainAt));
    for (const o of outs) {
      const to = toMs(o.trainAt);
      const i = ins.find((x) => {
        if (linked.has(x.id)) return false;
        const gap = toMs(x.trainAt) - to;
        return gap >= 0 && gap < maxGap;
      });
      if (!i) continue;
      const ti = toMs(i.trainAt);
      linked.add(o.id);
      linked.add(i.id);
      const key = `cx:${o.id}`;
      o.linkKey = key;
      i.linkKey = key;
      o.end = toIso(ti);
      i.start = toIso(ti);
      i.end = toIso(ti + settings.connectionIn[pmrCategory(i)] * MINUTE);
    }
  }

  // Plusieurs PMR du même train, même gare, même heure.
  const byTrain = new Map<string, PlannerTask[]>();
  for (const t of live) {
    if (linked.has(t.id) || !trainNorm(t.train)) continue;
    const k = `tr:${trainNorm(t.train)}:${stationKey(t.station).replace(/ /g, "-")}:${toMs(t.trainAt)}`;
    const list = byTrain.get(k);
    if (list) list.push(t);
    else byTrain.set(k, [t]);
  }
  for (const [k, list] of byTrain) {
    if (list.length < 2) continue;
    for (const t of list) t.linkKey = k;
  }
  return out;
}

export { trainNorm };
