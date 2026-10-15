// Contrôle d'une attribution, propositions d'agents et attribution automatique (CADRAGE §3.2, REGLES §4-5).
//
// Une attribution est contrôlée contre l'état connu (`ctx.tasks`) : hors service, hors zone, chevauchement avec une
// tâche d'un AUTRE train, trajet impossible, guichet B-CS (ouverture, PMR light, 3 PMR par heure). Les contextes sont
// supposés immuables (l'état préparé est mis en cache par tableau de tâches).

import {
  norm,
  occupies,
  refTime,
  sameTrainStop,
  serviceIntervals,
  serviceMinutes,
  unionMinutes,
  type Interval,
  type Norm,
} from "./core";
import {
  MINUTE,
  brusselsParts,
  hhmm,
  hourStart,
  isWeekendOrHoliday,
  parseHours,
  range,
} from "./time";
import { baseByCode, coverage, isBaseStation, travelMinutes } from "./travel";
import { stationKey } from "./window";
import {
  DEFAULT_PLANNER_SETTINGS,
  type BcsCounter,
  type CheckLevel,
  type CheckResult,
  type PlannerAgent,
  type PlannerAssignee,
  type PlannerContext,
  type PlannerSettings,
  type PlannerTask,
} from "./types";

// ---------------------------------------------------------------------------------------------------------------
// État préparé

type AgentState = {
  agent: PlannerAgent;
  service: Interval[];
  list: Norm[];
  serviceMin: number;
  busy?: number;
};

class Plan {
  readonly settings: PlannerSettings;
  readonly ctx: PlannerContext;
  readonly agents = new Map<string, AgentState>();
  readonly bcs = new Map<string, BcsCounter>();
  readonly bcsTasks = new Map<string, Norm[]>();
  private readonly where = new Map<string, { kind: "agent" | "bcs"; key: string }>();
  private readonly cov = new Map<string, ReturnType<typeof coverage>>();

  constructor(ctx: PlannerContext, extra: PlannerTask[] = []) {
    this.ctx = ctx;
    this.settings = ctx.settings ?? DEFAULT_PLANNER_SETTINGS;
    for (const a of ctx.agents) {
      const service = serviceIntervals(a);
      this.agents.set(a.id, { agent: a, service, list: [], serviceMin: serviceMinutes(service) });
    }
    for (const c of ctx.bcs) this.bcs.set(stationKey(c.station), c);
    const all = new Map<string, PlannerTask>();
    for (const t of ctx.tasks) all.set(t.id, t);
    for (const t of extra) all.set(t.id, t);
    for (const t of all.values()) if (t.assignee) this.place(norm(t), t.assignee);
  }

  place(n: Norm, target: PlannerAssignee) {
    if (!occupies(n)) return;
    this.unplace(n.task.id);
    if (target.kind === "agent" && target.agentId) {
      const st = this.agents.get(target.agentId);
      if (!st) return;
      st.list.push(n);
      st.list.sort((a, b) => a.s - b.s || a.e - b.e);
      st.busy = undefined;
      this.where.set(n.task.id, { kind: "agent", key: target.agentId });
    } else if (target.kind === "bcs") {
      const list = this.bcsTasks.get(n.st) ?? [];
      list.push(n);
      this.bcsTasks.set(n.st, list);
      this.where.set(n.task.id, { kind: "bcs", key: n.st });
    }
  }

  unplace(id: string) {
    const w = this.where.get(id);
    if (!w) return;
    const st = w.kind === "agent" ? this.agents.get(w.key) : undefined;
    if (st) st.busy = undefined;
    const list = st ? st.list : this.bcsTasks.get(w.key);
    if (list) {
      const i = list.findIndex((x) => x.task.id === id);
      if (i >= 0) list.splice(i, 1);
    }
    this.where.delete(id);
  }

  agentOf(id: string): string | undefined {
    const w = this.where.get(id);
    return w?.kind === "agent" ? w.key : undefined;
  }

  coverage(agent: PlannerAgent, station: string) {
    const k = `${agent.base}|${station}`;
    let c = this.cov.get(k);
    if (!c) this.cov.set(k, (c = coverage(agent, station, this.ctx.bases)));
    return c;
  }

  busyMinutes(st: AgentState): number {
    return (st.busy ??= unionMinutes(st.list.map((n) => ({ s: n.s, e: n.e }))));
  }
}

const plans = new WeakMap<PlannerTask[], WeakMap<PlannerContext, Plan>>();
function planFor(ctx: PlannerContext): Plan {
  let byCtx = plans.get(ctx.tasks);
  if (!byCtx) plans.set(ctx.tasks, (byCtx = new WeakMap()));
  let p = byCtx.get(ctx);
  if (!p) byCtx.set(ctx, (p = new Plan(ctx)));
  return p;
}

// ---------------------------------------------------------------------------------------------------------------
// Contrôles

const RANK: Record<CheckLevel, number> = { ok: 0, warn: 1, block: 2 };

class Verdict {
  level: CheckLevel = "ok";
  reasons: string[] = [];
  add(level: CheckLevel, reason: string) {
    if (RANK[level] > RANK[this.level]) this.level = level;
    if (!this.reasons.includes(reason)) this.reasons.push(reason);
  }
  get result(): CheckResult {
    return { level: this.level, reasons: this.reasons };
  }
}

function describe(n: Norm): string {
  if (n.train) return `train ${n.task.train}`;
  if (n.task.label) return n.task.label;
  return n.task.station;
}

const minutesOfDay = (ms: number) => {
  const p = brusselsParts(ms);
  return p.hour * 60 + p.minute;
};

/** Voyageurs comptés au guichet pour l'heure civile `h` : une correspondance (`cx:`) compte une fois (le plus de pax). */
function bcsCount(list: Norm[], h: number): number {
  const groups = new Map<string, { t: number; pax: number }>();
  for (const n of list) {
    if (n.cancelled || !n.pmr) continue;
    const k = n.link.startsWith("cx:") ? n.link : `id:${n.task.id}`;
    const t = refTime(n);
    const pax = Math.max(1, n.task.pax || 1);
    const g = groups.get(k);
    if (!g) groups.set(k, { t, pax });
    else {
      g.t = Math.min(g.t, t);
      g.pax = Math.max(g.pax, pax);
    }
  }
  let total = 0;
  for (const g of groups.values()) if (hourStart(g.t) === h) total += g.pax;
  return total;
}

function groupHour(n: Norm, list: Norm[]): number {
  let t = refTime(n);
  if (n.link.startsWith("cx:"))
    for (const x of list) if (x.link === n.link) t = Math.min(t, refTime(x));
  return hourStart(t);
}

function checkBcs(plan: Plan, n: Norm, v: Verdict, target?: PlannerAssignee) {
  const name = n.task.station;
  // Guichet visé (libellé = gare du guichet ou sa clé) : celui de la gare de la tâche, jamais celui d'une autre gare.
  if (target?.label && stationKey(target.label) !== n.st) {
    const at = plan.bcs.get(stationKey(target.label))?.station ?? target.label;
    return v.add("block", `Ce guichet est à ${at}`);
  }
  if (!n.pmr) return v.add("block", "Le guichet B-CS ne prend que des prises en charge PMR");
  const c = plan.bcs.get(n.st);
  if (!c) return v.add("block", `Pas de guichet B-CS à ${name}`);
  const t = refTime(n);
  const weekend = isWeekendOrHoliday(t);
  const raw = weekend ? c.weekendHours : c.weekdayHours;
  const hours = parseHours(raw);
  if (!hours)
    v.add(
      "block",
      `Guichet B-CS de ${name} fermé ${weekend ? "le week-end et les jours fériés" : "en semaine"}`,
    );
  else {
    const m = minutesOfDay(t);
    if (m < hours[0] || m > hours[1])
      v.add(
        "block",
        `Guichet B-CS de ${name} fermé à ${hhmm(t)} (ouvert ${raw!.trim().replace(/:/g, "h")})`,
      );
  }
  if (c.lightOnly && n.chair)
    v.add("block", `Le guichet B-CS de ${name} ne prend que des PMR light`);
  const others = (plan.bcsTasks.get(n.st) ?? []).filter((x) => x.task.id !== n.task.id);
  const h = groupHour(n, [...others, n]);
  const before = bcsCount(others, h);
  const after = bcsCount([...others, n], h);
  const limit = c.perHour || plan.settings.bcsPerHour;
  if (after > limit && after > before)
    v.add(
      "block",
      `Guichet B-CS de ${name} complet : ${before}/${limit} PMR entre ${hhmm(h)} et ${hhmm(h + 60 * MINUTE)}`,
    );
}

type Placement = {
  prev?: Norm;
  next?: Norm;
  iv?: Interval;
  fromName: string;
  minutes: number | null;
};

/** Tâche précédente / suivante et trajet depuis la précédente (ou depuis la base au début du service). */
function placement(plan: Plan, st: AgentState, n: Norm): Placement {
  const base = baseByCode(plan.ctx.bases, st.agent.base);
  const home = base?.name ?? st.agent.base;
  const iv =
    st.service.find((x) => n.s < x.e && n.e > x.s) ??
    st.service.find((x) => n.s >= x.s && n.s < x.e);
  let prev: Norm | undefined;
  let next: Norm | undefined;
  for (const x of st.list) {
    if (x.task.id === n.task.id || (x.s < n.e && n.s < x.e)) continue;
    if (x.e <= n.s && (!iv || x.e > iv.s) && (!prev || x.e > prev.e)) prev = x;
    if (x.s >= n.e && (!iv || x.s < iv.e) && (!next || x.s < next.s)) next = x;
  }
  const fromName = prev ? prev.task.station : home;
  return {
    prev,
    next,
    iv,
    fromName,
    minutes: travelMinutes(st.agent.base, fromName, n.task.station, plan.ctx.bases),
  };
}

function checkAgent(
  plan: Plan,
  n: Norm,
  agentId: string | undefined,
  v: Verdict,
): Placement | null {
  const st = agentId ? plan.agents.get(agentId) : undefined;
  if (!st) {
    v.add("block", "Agent inconnu");
    return null;
  }
  const cov = plan.coverage(st.agent, n.task.station);
  if (!cov.ok) v.add("block", cov.reason);

  // Service.
  if (st.service.length === 0) v.add("block", "Pas de service ce jour");
  else if (!st.service.some((x) => n.s >= x.s && n.e <= x.e)) {
    const label = st.service.map((x) => range(x.s, x.e)).join(", ");
    if (st.service.some((x) => n.s < x.e && n.e > x.s))
      v.add("warn", `Déborde du service (${label})`);
    else v.add("block", `Hors service (${label})`);
  }

  // Chevauchement.
  for (const x of st.list) {
    if (x.task.id === n.task.id || (n.link && x.link === n.link)) continue;
    if (x.s < n.e && n.s < x.e && !sameTrainStop(x, n))
      v.add("block", `Occupé ${range(x.s, x.e)} (${describe(x)})`);
  }

  // Trajets.
  const p = placement(plan, st, n);
  const start = p.prev ? p.prev.e : p.iv ? p.iv.s : Number.NaN;
  if (
    p.minutes !== null &&
    p.minutes > 0 &&
    !Number.isNaN(start) &&
    start + p.minutes * MINUTE > n.s
  )
    v.add(
      "block",
      `Trajet de ${p.minutes} min depuis ${p.fromName}, impossible avant ${hhmm(start + p.minutes * MINUTE)}`,
    );
  if (p.next) {
    const m = travelMinutes(st.agent.base, n.task.station, p.next.task.station, plan.ctx.bases);
    if (m !== null && n.e + m * MINUTE > p.next.s)
      v.add(
        "block",
        `Trajet de ${m} min vers ${p.next.task.station} : la tâche de ${hhmm(p.next.s)} ne serait plus tenable`,
      );
  } else if (p.iv && cov.ok) {
    const base = baseByCode(plan.ctx.bases, st.agent.base);
    if (base && !isBaseStation(base, n.task.station)) {
      const m = travelMinutes(st.agent.base, n.task.station, base.name, plan.ctx.bases);
      if (m !== null && n.e + m * MINUTE > p.iv.e)
        v.add(
          "warn",
          `Retour à ${base.name} vers ${hhmm(n.e + m * MINUTE)}, après la fin du service`,
        );
    }
  }
  return p;
}

function checkIn(plan: Plan, n: Norm, target: PlannerAssignee): CheckResult {
  const v = new Verdict();
  if (n.cancelled) {
    v.add("warn", "Prise en charge annulée : l'attribution ne sert plus");
    return v.result;
  }
  if (target.kind === "taxi" || target.kind === "cdb") return v.result;
  if (target.kind === "bcs") checkBcs(plan, n, v, target);
  else checkAgent(plan, n, target.agentId, v);
  return v.result;
}

/**
 * Contrôle l'attribution de `task` à `target` : `ok`, `warn` (avertissement) ou `block` (refus), avec des phrases
 * courtes. Taxi et chef de bord : toujours possible. Tâche annulée : avertissement seul.
 */
export function checkAssign(
  task: PlannerTask,
  target: PlannerAssignee,
  ctx: PlannerContext,
): CheckResult {
  return checkIn(planFor(ctx), norm(task), target);
}

/** Charge d'un guichet B-CS pour l'heure civile (Bruxelles) qui contient `hourIso` : « 2/3 cette heure ». */
export function bcsLoad(
  counter: BcsCounter,
  tasks: PlannerTask[],
  hourIso: string,
): { used: number; limit: number; label: string } {
  const k = stationKey(counter.station);
  const list = tasks
    .filter((t) => t.assignee?.kind === "bcs")
    .map(norm)
    .filter((n) => n.st === k && occupies(n));
  const used = bcsCount(list, hourStart(Date.parse(hourIso)));
  const limit = counter.perHour || DEFAULT_PLANNER_SETTINGS.bcsPerHour;
  return { used, limit, label: `${used}/${limit} cette heure` };
}

// ---------------------------------------------------------------------------------------------------------------
// Propositions

export type AgentSuggestion = {
  target: PlannerAssignee;
  /** Plus haut = meilleur. */
  score: number;
  /** Raison principale (« Libre, déjà sur place · poste préféré (PA) · charge 25 % »). */
  reason: string;
  level: "ok" | "warn";
  /** Avertissements du contrôle. */
  reasons: string[];
};

function costFor(plan: Plan, n: Norm, st: AgentState, p: Placement | null, level: CheckLevel) {
  const parts: string[] = [];
  let cost = 0;
  const concurrent = st.list.some(
    (x) => x.task.id !== n.task.id && x.s < n.e && n.s < x.e && sameTrainStop(x, n),
  );
  if (concurrent) parts.push("Déjà sur ce train");
  else if (p && p.minutes === 0) {
    cost += p.prev ? 2 : 5;
    parts.push(p.prev ? "Libre, déjà sur place" : "Même gare, 0 trajet");
  } else if (p && p.minutes !== null) {
    cost += 10 + p.minutes;
    parts.push(`Trajet ${p.minutes} min depuis ${p.fromName}`);
  } else cost += 200;

  const base = baseByCode(plan.ctx.bases, st.agent.base);
  const atBase = base ? isBaseStation(base, n.task.station) : false;
  const pref = plan.settings.postPreference[atBase ? "base" : "secondary"];
  const idx = pref.indexOf(st.agent.post);
  cost += idx >= 0 ? idx * 4 : 20;
  if (idx === 0) parts.push(`poste préféré (${st.agent.post})`);

  const load = st.serviceMin > 0 ? Math.round((plan.busyMinutes(st) / st.serviceMin) * 100) : 100;
  cost += load / 5;
  parts.push(`charge ${load} %`);
  if (level === "warn") cost += 30;
  return { cost, reason: parts.join(" · ") };
}

function bcsSuggestion(plan: Plan, n: Norm): AgentSuggestion | null {
  if (!n.pmr || !plan.bcs.has(n.st)) return null;
  const target: PlannerAssignee = { kind: "bcs", label: n.task.station };
  const r = checkIn(plan, n, target);
  if (r.level === "block") return null;
  const c = plan.bcs.get(n.st)!;
  const list = (plan.bcsTasks.get(n.st) ?? []).filter((x) => x.task.id !== n.task.id);
  const used = bcsCount(list, groupHour(n, [...list, n]));
  return {
    target,
    score: 1000,
    reason: `Guichet B-CS ouvert · ${used}/${c.perHour || plan.settings.bcsPerHour} cette heure`,
    level: r.level === "warn" ? "warn" : "ok",
    reasons: r.reasons,
  };
}

function rankAgents(plan: Plan, n: Norm): (AgentSuggestion & { cost: number })[] {
  const out: (AgentSuggestion & { cost: number })[] = [];
  for (const st of plan.agents.values()) {
    if (!plan.coverage(st.agent, n.task.station).ok) continue;
    const v = new Verdict();
    const p = checkAgent(plan, n, st.agent.id, v);
    if (v.level === "block") continue;
    const { cost, reason } = costFor(plan, n, st, p, v.level);
    out.push({
      target: { kind: "agent", agentId: st.agent.id, label: st.agent.name },
      cost,
      score: Math.round(1000 - cost),
      reason,
      level: v.level === "warn" ? "warn" : "ok",
      reasons: v.reasons,
    });
  }
  return out.sort(
    (a, b) => a.cost - b.cost || a.target.label!.localeCompare(b.target.label!, "fr"),
  );
}

/**
 * Agents possibles pour une tâche, du meilleur au moins bon (refus exclus) : déjà sur place < même gare < trajet
 * court, puis poste préféré, puis charge la plus faible ; un avertissement pénalise. Le guichet B-CS vient en tête
 * quand la règle le permet. Taxi et chef de bord ne sont jamais proposés (choix du PACO / RCCA).
 */
export function suggestAgents(
  task: PlannerTask,
  ctx: PlannerContext,
  limit = 10,
): AgentSuggestion[] {
  const plan = planFor(ctx);
  const n = norm(task);
  if (n.cancelled || !occupies(n)) return [];
  const out: AgentSuggestion[] = [];
  const bcs = bcsSuggestion(plan, n);
  if (bcs) out.push(bcs);
  for (const s of rankAgents(plan, n)) {
    const { cost, ...rest } = s;
    void cost;
    out.push(rest);
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Attribution automatique

export type AutoProposal = { taskId: string; target: PlannerAssignee; reason: string };
export type AutoResult = {
  proposals: AutoProposal[];
  unassigned: { taskId: string; reasons: string[] }[];
};

/**
 * Proposition d'attribution, gloutonne par heure de train. Tâches liées (`linkKey`) et PMR d'un même arrêt de train
 * attribuées ensemble au même destinataire ; guichet B-CS d'abord quand il est permis ; tâches déjà attribuées gardées
 * (et prises en compte), annulées et trajets ignorés. Rien n'est modifié : le résultat est une proposition.
 */
export function autoAssign(tasks: PlannerTask[], ctx: PlannerContext): AutoResult {
  const plan = new Plan(
    ctx,
    tasks.filter((t) => t.assignee),
  );
  const todo = tasks.map(norm).filter((n) => !n.task.assignee && occupies(n));
  const linkAgents = new Map<string, Set<string>>();
  for (const t of [...ctx.tasks, ...tasks]) {
    const a = t.linkKey && t.assignee?.kind === "agent" ? plan.agentOf(t.id) : undefined;
    if (!a) continue;
    const set = linkAgents.get(t.linkKey!) ?? new Set<string>();
    set.add(a);
    linkAgents.set(t.linkKey!, set);
  }

  // Groupes : même lien, ou même train + gare + heure.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const firstBy = new Map<string, string>();
  for (const n of todo) parent.set(n.task.id, n.task.id);
  for (const n of todo) {
    const keys = [
      n.link && `l:${n.link}`,
      n.train && !Number.isNaN(n.T) && `t:${n.train}|${n.st}|${n.T}`,
    ];
    for (const k of keys) {
      if (!k) continue;
      const f = firstBy.get(k);
      if (f) union(n.task.id, f);
      else firstBy.set(k, n.task.id);
    }
  }
  const groups = new Map<string, Norm[]>();
  for (const n of todo) {
    const r = find(n.task.id);
    const g = groups.get(r);
    if (g) g.push(n);
    else groups.set(r, [n]);
  }
  const ordered = [...groups.values()]
    .map((g) => g.sort((a, b) => refTime(a) - refTime(b)))
    .sort((a, b) => refTime(a[0]!) - refTime(b[0]!) || a[0]!.task.id.localeCompare(b[0]!.task.id));

  const proposals: AutoProposal[] = [];
  const unassigned: AutoResult["unassigned"] = [];

  // Un groupe est proposé à UN destinataire ; chaque tâche est contrôlée après la pose des précédentes du groupe dans le
  // plan (aucun chevauchement entre tâches du même groupe une fois toutes appliquées). Renvoie les raisons d'un refus.
  const attempt = (g: Norm[]): string[] | null => {
    const extra =
      g.length > 1
        ? ` · avec ${g.length - 1} tâche${g.length > 2 ? "s" : ""} liée${g.length > 2 ? "s" : ""}`
        : "";
    // 1. Guichet B-CS.
    if (g.every((n) => n.pmr && n.st === g[0]!.st) && plan.bcs.has(g[0]!.st)) {
      const target: PlannerAssignee = { kind: "bcs", label: g[0]!.task.station };
      const placed: Norm[] = [];
      let ok = true;
      for (const n of g) {
        if (checkIn(plan, n, target).level === "block") {
          ok = false;
          break;
        }
        plan.place(n, target);
        placed.push(n);
      }
      if (ok) {
        for (const n of g)
          proposals.push({
            taskId: n.task.id,
            target,
            reason: `Guichet B-CS de ${n.task.station}${extra}`,
          });
        return null;
      }
      for (const n of placed) plan.unplace(n.task.id);
    }

    // 2. Agents : agent d'une tâche liée déjà attribuée d'abord, puis coût total le plus bas.
    const preferred = new Set<string>();
    for (const n of g) for (const a of (n.link && linkAgents.get(n.link)) || []) preferred.add(a);
    let best: { st: AgentState; cost: number; reason: string } | null = null;
    const why = new Map<string, number>();
    const gs = Math.min(...g.map((n) => n.s));
    const ge = Math.max(...g.map((n) => n.e));
    const tryAgent = (st: AgentState, collect: boolean) => {
      const target: PlannerAssignee = { kind: "agent", agentId: st.agent.id };
      let cost = preferred.has(st.agent.id) ? -100 : 0;
      let reason = "";
      let refused = false;
      const placed: string[] = [];
      for (const n of g) {
        const v = new Verdict();
        const p = checkAgent(plan, n, st.agent.id, v);
        if (v.level === "block") {
          if (collect) for (const r of v.reasons) why.set(r, (why.get(r) ?? 0) + 1);
          refused = true;
          break;
        }
        const c = costFor(plan, n, st, p, v.level);
        cost += c.cost;
        reason ||= c.reason;
        // Plan temporaire : la tâche suivante du groupe est contrôlée avec celle-ci déjà posée.
        plan.place(n, target);
        placed.push(n.task.id);
      }
      for (const id of placed) plan.unplace(id);
      return refused ? null : { st, cost, reason };
    };
    const covering = [...plan.agents.values()].filter((st) =>
      g.every((n) => plan.coverage(st.agent, n.task.station).ok),
    );
    for (const st of covering) {
      // Aucun service qui touche le groupe : refus certain, raisons calculées seulement si personne n'est trouvé.
      if (!st.service.some((iv) => gs < iv.e && ge > iv.s)) continue;
      const r = tryAgent(st, true);
      if (
        r &&
        (!best ||
          r.cost < best.cost ||
          (r.cost === best.cost && r.st.agent.name < best.st.agent.name))
      )
        best = r;
    }
    if (!best && why.size === 0) for (const st of covering) tryAgent(st, true);
    if (best) {
      const target: PlannerAssignee = {
        kind: "agent",
        agentId: best.st.agent.id,
        label: best.st.agent.name,
      };
      for (const n of g) {
        plan.place(n, target);
        proposals.push({ taskId: n.task.id, target, reason: `${best.reason}${extra}` });
      }
      return null;
    }
    const reasons = [...why.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r]) => r);
    if (reasons.length === 0)
      reasons.push(`Aucun agent en service ne couvre ${g[0]!.task.station}`);
    reasons.push("Prévoir un taxi ou le chef de bord");
    return reasons;
  };

  for (const g of ordered) {
    const reasons = attempt(g);
    if (!reasons) continue;
    // Groupe réuni par un même train (PMR de dossiers différents) mais intenable par un seul destinataire : chaque
    // unité (correspondance, même lien, tâche seule) est retentée à part.
    const units = new Map<string, Norm[]>();
    for (const n of g) {
      const k = n.link || `id:${n.task.id}`;
      const u = units.get(k);
      if (u) u.push(n);
      else units.set(k, [n]);
    }
    if (units.size > 1) {
      for (const u of units.values()) {
        const r = attempt(u);
        if (r) for (const n of u) unassigned.push({ taskId: n.task.id, reasons: r });
      }
      continue;
    }
    for (const n of g) unassigned.push({ taskId: n.task.id, reasons });
  }
  return { proposals, unassigned };
}
