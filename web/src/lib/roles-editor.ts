// Éditeur de rôles et ajustements d'un agent (rôles v3, lots L4-L5, docs/design/CADRAGE-ROLES-V3.md §4) : logique pure,
// partagée par l'écran Administration › Rôles, la fiche d'un agent et les Server Actions. Aucune clé n'est montrée à
// l'admin : tout passe par les phrases du catalogue (`lib/permissions/catalog.ts`). Le hook PocketBase fait foi
// (dépendances, catalogue fermé) ; ce module ne fait que prévoir l'effet et l'expliquer.

import { CATALOG, TASKS, type CatalogEntry } from "./permissions/catalog";
import { computePerms } from "./permissions/compute";
import { ROLE_COLORS, type RoleColor } from "./roles";

/** Entrées proposées dans l'interface (les lectures historiques de BACO sont cachées). */
export const VISIBLE: CatalogEntry[] = CATALOG.filter((e) => !e.hidden);
export const VISIBLE_KEYS: string[] = VISIBLE.map((e) => e.key);
const VISIBLE_SET = new Set(VISIBLE_KEYS);
const BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

export function entry(key: string): CatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** Libellé d'une clé (la clé elle-même si elle n'est plus au catalogue : droit repris de BACO). */
export function labelOf(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export function isVisible(key: string): boolean {
  return VISIBLE_SET.has(key);
}

/** Ordre du catalogue, clés visibles seulement, sans doublon. */
export function ordered(keys: Iterable<string>): string[] {
  const set = new Set(keys);
  return VISIBLE_KEYS.filter((k) => set.has(k));
}

export type TaskGroup = { id: string; group: string; label: string; entries: CatalogEntry[] };

/** Tâches métier de l'éditeur (sections repliables), dans l'ordre du catalogue ; tâches vides écartées. */
export const TASK_GROUPS: TaskGroup[] = TASKS.map((t) => ({
  ...t,
  entries: VISIBLE.filter((e) => e.task === t.id),
})).filter((t) => t.entries.length > 0);

// ---------------------------------------------------------------------------------------------------
// Dépendances

/** Entrées qui exigent `key` (directement ou par chaîne). */
export function dependentsOf(key: string): string[] {
  const out = new Set<string>();
  let frontier = [key];
  while (frontier.length) {
    const next: string[] = [];
    for (const e of CATALOG) {
      if (out.has(e.key)) continue;
      if (e.requires.some((r) => frontier.includes(r))) {
        out.add(e.key);
        next.push(e.key);
      }
    }
    frontier = next;
  }
  return ordered(out);
}

/** Dépendances de `key` (chaîne complète), dans l'ordre du catalogue. */
export function requirementsOf(key: string): string[] {
  const out = new Set<string>();
  const walk = (k: string) => {
    for (const r of BY_KEY.get(k)?.requires ?? []) {
      if (!out.has(r)) {
        out.add(r);
        walk(r);
      }
    }
  };
  walk(key);
  return CATALOG.map((e) => e.key).filter((k) => out.has(k));
}

export type Toggle = {
  next: string[];
  /** Droits activés en plus, nécessaires au droit demandé. */
  alsoOn: string[];
  /** Droits coupés en plus, qui dépendaient du droit retiré. */
  alsoOff: string[];
};

/**
 * Active ou coupe un droit dans un rôle : activer ajoute ses dépendances (« Voir les bons bus a été activé, nécessaire
 * pour les modifier ») ; couper retire ce qui en dépend. Les clés cachées déjà présentes sont gardées.
 */
export function toggle(perms: readonly string[], key: string, on: boolean): Toggle {
  const set = new Set(perms);
  const alsoOn: string[] = [];
  const alsoOff: string[] = [];
  if (on) {
    set.add(key);
    for (const r of requirementsOf(key)) {
      if (!set.has(r)) {
        set.add(r);
        alsoOn.push(r);
      }
    }
  } else {
    set.delete(key);
    for (const d of dependentsOf(key)) {
      if (set.has(d)) {
        set.delete(d);
        alsoOff.push(d);
      }
    }
  }
  const all = CATALOG.map((e) => e.key);
  return { next: all.filter((k) => set.has(k)), alsoOn, alsoOff };
}

/** Bascule de toute une tâche (« Tout » / « Aucun ») avec dépendances hors tâche. */
export function setTask(perms: readonly string[], taskId: string, on: boolean): Toggle {
  const group = TASK_GROUPS.find((t) => t.id === taskId);
  let cur: Toggle = { next: [...perms], alsoOn: [], alsoOff: [] };
  if (!group) return cur;
  const inTask = new Set(group.entries.map((e) => e.key));
  // Couper : d'abord les droits les plus « hauts » pour ne pas compter deux fois leurs dépendants.
  const keys = on ? group.entries.map((e) => e.key) : group.entries.map((e) => e.key).reverse();
  for (const k of keys) {
    if (cur.next.includes(k) === on) continue;
    const t = toggle(cur.next, k, on);
    cur = {
      next: t.next,
      alsoOn: [...cur.alsoOn, ...t.alsoOn.filter((x) => !inTask.has(x))],
      alsoOff: [...cur.alsoOff, ...t.alsoOff.filter((x) => !inTask.has(x))],
    };
  }
  return { next: cur.next, alsoOn: ordered(cur.alsoOn), alsoOff: ordered(cur.alsoOff) };
}

// ---------------------------------------------------------------------------------------------------
// Résumés, différences, aperçu

export type TaskSummary = {
  kind: "all" | "read" | "none" | "custom";
  on: number;
  total: number;
  /** « Tout », « Voir seulement », « Aucun » ou « 2 sur 4 ». */
  label: string;
};

const isRead = (e: CatalogEntry) => /:read$/.test(e.key);

export function taskSummary(group: TaskGroup, perms: readonly string[]): TaskSummary {
  const set = new Set(perms);
  const on = group.entries.filter((e) => set.has(e.key));
  const total = group.entries.length;
  const reads = group.entries.filter(isRead);
  if (on.length === total) return { kind: "all", on: on.length, total, label: "Tout" };
  if (on.length === 0) return { kind: "none", on: 0, total, label: "Aucun" };
  if (reads.length > 0 && on.length === reads.length && on.every(isRead))
    return { kind: "read", on: on.length, total, label: "Voir seulement" };
  return { kind: "custom", on: on.length, total, label: `${on.length} sur ${total}` };
}

export type PermDiff = { added: string[]; removed: string[] };

/** Différence entre deux listes de droits (clés visibles, ordre du catalogue). */
export function diffPerms(before: readonly string[], after: readonly string[]): PermDiff {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: ordered([...a].filter((k) => !b.has(k))),
    removed: ordered([...b].filter((k) => !a.has(k))),
  };
}

export function sensitiveIn(keys: readonly string[]): string[] {
  return keys.filter((k) => BY_KEY.get(k)?.level === "sensible");
}

/** « Ce rôle peut… / ne peut pas… » : entrées visibles, ordre du catalogue. */
export function preview(perms: readonly string[]): { can: CatalogEntry[]; cannot: CatalogEntry[] } {
  const set = new Set(perms);
  return {
    can: VISIBLE.filter((e) => set.has(e.key)),
    cannot: VISIBLE.filter((e) => !set.has(e.key)),
  };
}

/** « +2, −1 » */
export function diffLabel(d: PermDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`+${d.added.length}`);
  if (d.removed.length) parts.push(`−${d.removed.length}`);
  return parts.join(", ");
}

/** Phrase du récapitulatif d'enregistrement. */
export function impactSentence(d: PermDiff, agents: number): string {
  const n = agents;
  const who = n === 0 ? "Aucun agent n'a ce rôle" : n === 1 ? "1 agent va" : `${n} agents vont`;
  if (n === 0) return `${who} : le changement vaudra pour les prochains.`;
  const parts: string[] = [];
  if (d.added.length) parts.push(`recevoir : ${d.added.map(labelOf).join(", ")}`);
  if (d.removed.length) parts.push(`perdre : ${d.removed.map(labelOf).join(", ")}`);
  return parts.length ? `${who} ${parts.join(" ; et ")}.` : "Aucun droit ne change.";
}

// ---------------------------------------------------------------------------------------------------
// Recherche

export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Droits qui correspondent à la recherche (libellé, phrase, nom de la tâche ; tous les mots, sans accents). */
export function searchEntries(
  q: string,
  entries: readonly CatalogEntry[] = VISIBLE,
): CatalogEntry[] {
  const words = fold(q).split(" ").filter(Boolean);
  if (!words.length) return [...entries];
  const taskLabel = new Map(TASK_GROUPS.map((t) => [t.id, `${t.group} ${t.label}`]));
  return entries.filter((e) => {
    const hay = fold(`${e.label} ${e.sentence} ${taskLabel.get(e.task) ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

// ---------------------------------------------------------------------------------------------------
// Création d'un rôle

/** Identifiant d'un rôle créé, tiré de son nom (« Coordinateur de nuit » → `coordinateur-de-nuit`), unique. */
export function roleKeyFromLabel(label: string, taken: readonly string[]): string {
  let base = fold(label).replace(/ /g, "-").slice(0, 34).replace(/-+$/, "");
  if (!/^[a-z]/.test(base)) base = `role-${base}`.replace(/-+$/, "");
  if (base.length < 2) base = "role";
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const k = `${base}-${i}`;
    if (!set.has(k)) return k;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 40);
}

export function isRoleColor(v: unknown): v is RoleColor {
  return typeof v === "string" && (ROLE_COLORS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------------------------------
// Historique (journal d'audit de la collection `roles`)

export type RoleSnapshot = {
  label: string;
  description: string;
  color: RoleColor;
  perms: string[];
};

type Change = { old?: unknown; new?: unknown };

const strOf = (v: unknown) => (typeof v === "string" ? v : "");
const listOf = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Phrases d'une ligne d'audit d'un rôle (« a ajouté « Supprimer un bon bus » »). */
export function historySentences(
  action: string,
  changes: unknown,
  colorLabel: (c: string) => string = (c) => c,
): string[] {
  if (action === "create") return ["a créé le rôle"];
  if (action === "delete") return ["a supprimé le rôle"];
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, Change>;
  const out: string[] = [];
  if (c.label) out.push(`a renommé le rôle « ${strOf(c.label.old)} » en « ${strOf(c.label.new)} »`);
  if (c.description) out.push("a changé la description");
  if (c.color)
    out.push(
      `a changé la couleur (${colorLabel(strOf(c.color.old) || "neutral")} → ${colorLabel(strOf(c.color.new) || "neutral")})`,
    );
  if (c.perms) {
    const d = diffPerms(listOf(c.perms.old), listOf(c.perms.new));
    for (const k of d.added) out.push(`a ajouté « ${labelOf(k)} »`);
    for (const k of d.removed) out.push(`a retiré « ${labelOf(k)} »`);
  }
  return out;
}

/**
 * Valeurs à rétablir pour annuler un changement (« Annuler ce changement ») : l'ancienne valeur de chaque champ
 * modifié ; `null` si la ligne ne concerne aucun champ éditable (création, suppression, auteur seul).
 */
export function revertPatch(action: string, changes: unknown): Partial<RoleSnapshot> | null {
  if (action !== "update") return null;
  const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, Change>;
  const patch: Partial<RoleSnapshot> = {};
  if (c.label && strOf(c.label.old)) patch.label = strOf(c.label.old);
  if (c.description) patch.description = strOf(c.description.old);
  if (c.color) patch.color = isRoleColor(c.color.old) ? c.color.old : "neutral";
  if (c.perms) patch.perms = listOf(c.perms.old);
  return Object.keys(patch).length ? patch : null;
}

const WHEN = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** « 14 oct. 2026 à 18:30 » (heure de Bruxelles) ; vide si la date est illisible. */
export function formatWhen(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  return WHEN.format(d).replace(",", " à");
}

// ---------------------------------------------------------------------------------------------------
// Ajustements d'un agent (grants / denies)

export type Adjust = "plus" | "moins";

/** Ajustements éditables (clés visibles du catalogue) ; les droits BACO hors catalogue sont gardés par le serveur. */
export function adjustmentsOf(
  grants: readonly string[],
  denies: readonly string[],
): Record<string, Adjust> {
  const out: Record<string, Adjust> = {};
  for (const k of grants) if (isVisible(k)) out[k] = "plus";
  for (const k of denies) if (isVisible(k) && !out[k]) out[k] = "moins";
  return out;
}

export function splitAdjustments(adj: Record<string, Adjust>): {
  grants: string[];
  denies: string[];
} {
  return {
    grants: ordered(Object.keys(adj).filter((k) => adj[k] === "plus")),
    denies: ordered(Object.keys(adj).filter((k) => adj[k] === "moins")),
  };
}

/** Droits effectifs d'un agent (même calcul que le hook `users.perms`). */
export function effectivePerms(
  roleKey: string,
  rolePerms: readonly string[] | null,
  adj: Record<string, Adjust>,
): string[] {
  const { grants, denies } = splitAdjustments(adj);
  return computePerms(roleKey, grants, denies, rolePerms);
}

export type AddAdjust = { next: Record<string, Adjust>; alsoPlus: string[] };

/**
 * Ajoute un ajustement : « en plus » accorde aussi les dépendances que le rôle n'a pas (sinon le droit resterait sans
 * effet) ; « retiré » d'une lecture coupe, au calcul, tout ce qui en dépend (expliqué dans l'interface).
 */
export function addAdjustment(
  adj: Record<string, Adjust>,
  rolePerms: readonly string[],
  key: string,
  kind: Adjust,
): AddAdjust {
  const next = { ...adj, [key]: kind };
  const alsoPlus: string[] = [];
  if (kind === "plus") {
    const has = new Set(rolePerms);
    for (const r of requirementsOf(key)) {
      if (next[r] === "plus") continue;
      if (has.has(r) && next[r] !== "moins") continue;
      next[r] = "plus";
      alsoPlus.push(r);
    }
  }
  return { next, alsoPlus };
}

/** L'ajustement change-t-il quelque chose ? (« en plus » d'un droit que le rôle a déjà : sans effet.) */
export function adjustmentHasEffect(
  rolePerms: readonly string[],
  key: string,
  kind: Adjust,
): boolean {
  const has = rolePerms.includes(key);
  return kind === "plus" ? !has : has;
}

/** Empreinte des ajustements d'un agent (suggestion « Créer un rôle à partir de ces ajustements »). */
export function adjustmentSignature(
  role: string,
  grants: readonly string[],
  denies: readonly string[],
): string {
  const { grants: g, denies: d } = splitAdjustments(adjustmentsOf(grants, denies));
  if (!g.length && !d.length) return "";
  return [role, ...g.map((k) => `+${k}`), ...d.map((k) => `-${k}`)].join("|");
}
