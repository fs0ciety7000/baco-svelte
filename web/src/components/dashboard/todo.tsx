"use client";

import Link from "next/link";

import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Stat, StatStrip } from "@/components/ui/stat-card";
import { TrainChip } from "@/components/ui/train-chip";
import type { LogDigest } from "@/components/ops/dashboard-widgets";
import { impactSeenKey, pinSeenKey } from "@/lib/dashboard/todo-seen";
import { brusselsDay, daysBetween, formatDay, isValidDay, pbDate } from "@/lib/orders/time";
import { cn, pl } from "@/lib/utils";
import type { DashboardStats } from "@/server/data/dashboard";
import type { ImpactedMission, TodayPmr } from "@/server/data/impacts";
import type { Notification } from "@/server/data/ops";

// Accueil « À traiter » (11 oct. 2026, refonte v4 lot 4 du 15 oct.) : une bande de compteurs et une seule file d'actions
// groupée par gravité (Urgent / À faire aujourd'hui / Pour information), une action nommée par ligne et une seule action
// primaire dans la file. Aucun nom de voyageur.

export type Severity = "danger" | "warn" | "info" | "neutral";
/** Groupe de gravité affiché (titre de groupe dans la file). */
export type TodoGroup = "urgent" | "today" | "info";
/** Nature de l'élément : pastille d'icône. */
export type TodoKind =
  "impact" | "send" | "urgent" | "mention" | "dicos" | "consigne" | "perturbation";

export type TodoItem = {
  key: string;
  severity: Severity;
  group: TodoGroup;
  kind: TodoKind;
  title: string;
  detail: string;
  /** Heure ou ancienneté affichée à droite. */
  when: string;
  href: string;
  /** Action nommée (« Ouvrir la mission », « Valider l'envoi », « Lire »…). */
  action: string;
  /** N° de train (puce) et retard collé au train, dans la méta. */
  train?: string;
  delay?: { label: string; tone: "warn" | "danger" };
  /** Référence (TC_…) en mono dans la méta. */
  code?: string;
  /**
   * « Vu » (4 nov. 2026) : alerte sans traitement possible, masquable par l'agent. `seenKey` = clé de
   * `preferences.todoSeen` (état compris : une aggravation revient) ; `notifId` = notification marquée lue. Ni l'un ni
   * l'autre (bon à envoyer) = vrai travail, pas de « Vu ».
   */
  seenKey?: string;
  notifId?: string;
};

export const TODO_GROUPS: { id: TodoGroup; label: string }[] = [
  { id: "urgent", label: "Urgent" },
  { id: "today", label: "À faire aujourd'hui" },
  { id: "info", label: "Pour information" },
];
const GROUP_RANK: Record<TodoGroup, number> = { urgent: 0, today: 1, info: 2 };
const RANK: Record<Severity, number> = { danger: 0, warn: 1, info: 2, neutral: 3 };

/** File « À traiter » : retards / suppressions, bons terminés à envoyer, urgences, mentions, consignes, perturbations. */
export function todoItems(input: {
  stats: DashboardStats | null;
  impacts: ImpactedMission[] | null;
  mentions: Notification[] | null;
  log: LogDigest[] | null;
  today?: string;
}): TodoItem[] {
  const today = input.today ?? brusselsDay();
  const out: TodoItem[] = [];
  for (const m of input.impacts ?? []) {
    const cancelled = m.impact.cancelled;
    const what = m.kind === "groupe" ? "de groupe" : "PMR";
    const severe = cancelled || m.impact.delay >= 15;
    out.push({
      key: `impact-${m.id}`,
      // Une prise en charge du jour touchée par un retard : toujours urgent, rouge dès 15 min ou supprimé.
      severity: severe ? "danger" : "warn",
      group: "urgent",
      kind: "impact",
      title: cancelled
        ? `Train supprimé : prise en charge ${what} à ${m.impact.station}`
        : `Retard sur une prise en charge ${what} à ${m.impact.station}`,
      detail: `${m.route} · ${m.detail}`,
      train: m.train,
      delay: {
        label: cancelled ? "supprimé" : `+${m.impact.delay} min`,
        tone: severe ? "danger" : "warn",
      },
      when: m.time,
      href: m.href,
      action: m.kind === "groupe" ? "Voir le groupe" : "Ouvrir la mission",
      seenKey: impactSeenKey(m, today),
    });
  }
  // Cycle v3 (14 oct. 2026) : bons terminés (bus démobilisés) à finaliser par l'envoi de l'e-mail au fournisseur.
  for (const o of input.stats?.pending ?? []) {
    const day = o.order_date.slice(0, 10);
    const late = isValidDay(day) ? daysBetween(day, today) : 0;
    const buses = o.bus_count || 0;
    out.push({
      key: `bus-${o.id}`,
      severity: late >= 2 ? "warn" : "info",
      group: "today",
      kind: "send",
      title: o.number
        ? `Bon C3 n° ${o.number} terminé, à envoyer à la société`
        : "Bon bus terminé, à envoyer à la société",
      code: /^TC_/i.test(o.relation.trim()) ? o.relation.trim() : undefined,
      detail: [
        `${o.origin || "?"} → ${o.destination || "?"}`,
        isValidDay(day) && day !== today ? `service ${formatDay(day)}` : "",
        buses ? `${buses} bus` : "",
        /^TC_/i.test(o.relation.trim()) ? "" : o.relation,
      ]
        .filter(Boolean)
        .join(" · "),
      when: late > 0 ? `il y a ${late} ${pl(late, "jour")}` : "",
      href: `/commandes/bus/${o.id}`,
      action: "Valider l'envoi",
    });
  }
  for (const n of input.mentions ?? []) {
    if (n.readAt) continue;
    const base = {
      key: `notif-${n.id}`,
      notifId: n.id,
      title: n.title,
      when: hhmm(n.created),
      href: n.link || "/operations/journal",
    };
    if (n.kind === "urgent")
      out.push({
        ...base,
        severity: "danger",
        group: "urgent",
        kind: "urgent",
        detail: "Urgence au Journal",
        action: "Lire",
      });
    else if (n.kind === "dicos")
      out.push({
        ...base,
        severity: "warn",
        group: "today",
        kind: "dicos",
        detail: "Changement DICOS de dernière minute",
        action: /groupe/i.test(n.title) ? "Voir le groupe" : "Ouvrir la mission",
      });
    else if (n.kind === "mention")
      out.push({
        ...base,
        severity: "info",
        group: "today",
        kind: "mention",
        detail: "Mention au Journal",
        action: "Lire",
      });
    else if (n.kind === "perturbation")
      out.push({
        ...base,
        severity: "info",
        group: "info",
        kind: "perturbation",
        detail: /^Travaux/i.test(n.title) ? "iRail · Travaux" : "iRail · Perturbation",
        action: "Lire",
      });
  }
  for (const e of input.log ?? []) {
    if (!e.pinned) continue;
    out.push({
      key: `pin-${e.id}`,
      severity: e.urgent ? "danger" : "neutral",
      group: e.urgent ? "urgent" : "info",
      kind: "consigne",
      title: e.urgent ? "Consigne urgente" : "Consigne épinglée",
      detail: e.body,
      when: e.time,
      href: `/operations/journal?entree=${e.id}`,
      action: "Lire",
      seenKey: pinSeenKey(e.id),
    });
  }
  return out.sort(
    (a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group] || RANK[a.severity] - RANK[b.severity],
  );
}

/** Groupes non vides, dans l'ordre Urgent → À faire aujourd'hui → Pour information. */
export function groupTodo(
  items: TodoItem[],
): { id: TodoGroup; label: string; items: TodoItem[] }[] {
  return TODO_GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter(
    (g) => g.items.length,
  );
}

/**
 * Une seule action primaire dans la file : le premier bon à envoyer (l'action qui termine un travail), sinon le premier
 * élément de la file (le plus urgent). `null` pour une file vide.
 */
export function primaryTodo(items: TodoItem[]): string | null {
  return (items.find((i) => i.kind === "send") ?? items[0])?.key ?? null;
}

function hhmm(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  return Number.isNaN(d.getTime())
    ? ""
    : new Intl.DateTimeFormat("fr-BE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Brussels",
      }).format(d);
}

/** Ancienneté lisible d'une date PocketBase (« 3 h », « 2 j »), vide si inconnue. */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const d = pbDate(iso);
  if (!d) return "";
  const min = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} j`;
}

/** Bande de compteurs de l'accueil (`StatStrip`), cellules cliquables. */
export function KpiStrip({
  stats,
  today,
  impacts,
  seen,
  day,
}: {
  stats: DashboardStats | null;
  today: TodayPmr | null;
  impacts: ImpactedMission[] | null;
  /** Clés « vu » de l'agent : le nombre reste factuel, l'alerte (rouge) ne compte que les impacts pas encore vus. */
  seen?: readonly string[];
  day?: string;
}) {
  const cells: {
    label: string;
    value: number;
    tone?: "warn" | "danger" | "progress";
    href?: string;
    hint?: string;
  }[] = [];
  if (stats) {
    const oldest = stats.pending
      .map((o) => o.ended_at)
      .filter(Boolean)
      .sort()[0];
    cells.push(
      {
        label: "Bons à envoyer",
        value: stats.toSend,
        tone: stats.toSend ? "progress" : undefined,
        href: "/commandes/suivi",
        hint: stats.toSend
          ? oldest
            ? `le plus ancien : ${ageLabel(oldest)}`
            : "à valider"
          : "rien en attente",
      },
      { label: "Bons en cours", value: stats.running, href: "/commandes?statut=brouillon" },
      { label: "Bons du jour", value: stats.today, href: "/commandes" },
    );
  }
  if (today) {
    cells.push(
      {
        label: "Missions PMR du jour",
        value: today.missions,
        href: "/pmr",
        hint: today.next.length ? `prochaine à ${today.next[0]!.time}` : undefined,
      },
      { label: "Groupes du jour", value: today.groups, href: "/groupes" },
    );
  }
  if (impacts !== null) {
    const seenSet = new Set(seen ?? []);
    const d = day ?? brusselsDay();
    const unseen = impacts.filter((m) => !seenSet.has(impactSeenKey(m, d)));
    const first = unseen[0] ?? impacts[0];
    const seenCount = impacts.length - unseen.length;
    cells.push({
      label: "Impactées (retard)",
      value: impacts.length,
      tone: unseen.length ? "danger" : undefined,
      href: "/pmr",
      hint: first
        ? seenCount && !unseen.length
          ? `${seenCount} ${pl(seenCount, "vue")}`
          : `${first.train} · ${first.impact.cancelled ? "supprimé" : `+${first.impact.delay} min`}`
        : "aucun retard",
    });
  }
  if (!cells.length) return null;
  // Bande de compteurs du design system (v4) : chiffres tabulaires de la police du texte, zéro estompé, cellule chaude
  // teintée de son statut.
  return (
    <StatStrip data-testid="kpi-strip">
      {cells.map((c) => (
        <Stat
          key={c.label}
          label={c.label}
          value={c.value}
          tone={c.tone}
          href={c.href}
          hint={c.hint}
        />
      ))}
    </StatStrip>
  );
}

/** Prochaines prises en charge (colonne droite de l'accueil ≥ 1280 px) : heure, gare, sens, train et retard. Sans nom. */
export function NextPickups({ data }: { data: TodayPmr }) {
  return (
    <Card data-testid="next-pickups" className="min-w-0">
      <CardHeader
        title="Prochaines prises en charge"
        actions={
          <Link href="/operations/journee" className="link text-small">
            Ma journée
          </Link>
        }
      />
      {data.next.length ? (
        <ul className="flex flex-col px-4 pt-1 pb-3">
          {data.next.slice(0, 5).map((m) => (
            <li
              key={m.id}
              className="border-t border-[color-mix(in_oklab,var(--border)_70%,transparent)] first:border-t-0"
            >
              <Link
                href={m.href}
                className="-mx-2 grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control px-2 py-2 hover:bg-surface-2"
              >
                <span className="font-mono text-body font-medium tabular">{m.time}</span>
                <span className="min-w-0 text-small">
                  <span className="block truncate">
                    <span className="font-medium text-fg">{m.station}</span>
                    <span className="text-fg-muted"> · {m.io}</span>
                  </span>
                  {m.impact ? (
                    <span
                      className={cn(
                        "block font-mono tabular",
                        m.impact.cancelled || m.impact.delay >= 15 ? "text-danger" : "text-warn",
                      )}
                    >
                      {m.impact.cancelled ? "train supprimé" : `retard +${m.impact.delay} min`}
                    </span>
                  ) : (
                    <span className="block truncate text-fg-subtle">{m.detail}</span>
                  )}
                </span>
                <TrainChip train={m.train} taxi={m.train === "Taxi"} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-4 pt-1 pb-4">
          <EmptyState title="Plus aucune prise en charge prévue aujourd'hui" />
        </div>
      )}
    </Card>
  );
}
