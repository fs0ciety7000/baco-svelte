"use client";

import Link from "next/link";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import type { LogDigest } from "@/components/ops/dashboard-widgets";
import { brusselsDay, daysBetween, formatDay, isValidDay } from "@/lib/orders/time";
import { cn, pl } from "@/lib/utils";
import type { DashboardStats } from "@/server/data/dashboard";
import type { ImpactedMission, TodayPmr } from "@/server/data/impacts";
import type { Notification } from "@/server/data/ops";

// Accueil « À traiter » (évolution validée le 11 oct. 2026) : une bande de compteurs compacte et une seule file
// d'actions triée par gravité, au lieu d'une mosaïque où l'agent devait chercher ce qui l'attend. Aucun nom de voyageur.

export type Severity = "danger" | "warn" | "info" | "neutral";

export type TodoItem = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Heure ou ancienneté affichée à droite. */
  when: string;
  href: string;
  action: string;
};

const RANK: Record<Severity, number> = { danger: 0, warn: 1, info: 2, neutral: 3 };
const STRIPE: Record<Severity, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  info: "bg-info",
  neutral: "bg-border-strong",
};

/** File « À traiter » : retards / suppressions, bons terminés à envoyer, mentions non lues, consignes. */
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
    out.push({
      key: `impact-${m.id}`,
      severity: cancelled || m.impact.delay >= 15 ? "danger" : "warn",
      title: `${m.train} ${cancelled ? "supprimé" : `+${m.impact.delay} min`}`,
      detail: `${m.route} · ${m.detail}`,
      when: m.time,
      href: m.href,
      action: "Ouvrir",
    });
  }
  // Cycle v3 (14 oct. 2026) : bons terminés (bus démobilisés) à finaliser par l'envoi de l'e-mail au fournisseur.
  for (const o of input.stats?.pending ?? []) {
    const day = o.order_date.slice(0, 10);
    const late = isValidDay(day) ? daysBetween(day, today) : 0;
    out.push({
      key: `bus-${o.id}`,
      severity: late >= 2 ? "warn" : "info",
      title: "Bon bus terminé à envoyer",
      detail: [
        `${o.origin || "?"} → ${o.destination || "?"}`,
        isValidDay(day) ? `service ${formatDay(day)}` : "",
        o.relation,
      ]
        .filter(Boolean)
        .join(" · "),
      when: late > 0 ? `il y a ${late} ${pl(late, "jour")}` : "",
      href: `/commandes/bus/${o.id}`,
      action: "Envoyer",
    });
  }
  for (const n of input.mentions ?? []) {
    if (n.readAt || (n.kind !== "mention" && n.kind !== "urgent" && n.kind !== "dicos")) continue;
    out.push({
      key: `notif-${n.id}`,
      severity: n.kind === "urgent" ? "danger" : n.kind === "dicos" ? "warn" : "info",
      title: n.title,
      detail:
        n.kind === "urgent"
          ? "Urgence au Journal"
          : n.kind === "dicos"
            ? "Changement DICOS de dernière minute"
            : "Mention au Journal",
      when: hhmm(n.created),
      href: n.link || "/operations/journal",
      action: "Lire",
    });
  }
  for (const e of input.log ?? []) {
    if (!e.pinned) continue;
    out.push({
      key: `pin-${e.id}`,
      severity: e.urgent ? "danger" : "neutral",
      title: e.urgent ? "Consigne urgente" : "Consigne épinglée",
      detail: e.body,
      when: e.time,
      href: `/operations/journal?entree=${e.id}`,
      action: "Lire",
    });
  }
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
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

export function TodoQueue({ items }: { items: TodoItem[] }) {
  const shown = items.slice(0, 8);
  return (
    <Card data-compact-empty data-testid="todo-queue">
      <CardHeader
        title="À traiter"
        eyebrow={
          items.length ? `${items.length} ${pl(items.length, "élément")} · par gravité` : undefined
        }
      />
      <CardContent className="p-0">
        {shown.length === 0 ? (
          <div className="p-3">
            <EmptyState title="Rien à traiter pour l'instant" />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((it) => (
              <li key={it.key} className="flex min-w-0 items-stretch">
                <span aria-hidden className={cn("w-1 shrink-0", STRIPE[it.severity])} />
                <Link
                  href={it.href}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-medium text-fg">{it.title}</span>
                    <span className="block truncate text-small text-fg-muted">{it.detail}</span>
                  </span>
                  {it.when ? (
                    <span className="hidden shrink-0 font-mono text-small text-fg-subtle tabular sm:inline">
                      {it.when}
                    </span>
                  ) : null}
                  <span className="shrink-0 rounded-control border border-border-strong px-2.5 py-1 text-small text-fg">
                    {it.action}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {items.length > shown.length ? (
          <p className="border-t border-border px-3 py-2 text-small text-fg-muted">
            Et {items.length - shown.length} de plus : Relève de service et Suivi des bons.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Bande de compteurs compacte (un seul cadre, séparateurs), cliquables. */
export function KpiStrip({
  stats,
  today,
  impacted,
}: {
  stats: DashboardStats | null;
  today: TodayPmr | null;
  impacted: number | null;
}) {
  const cells: {
    label: string;
    value: number;
    tone?: "warn" | "danger";
    href?: string;
    sub?: string;
  }[] = [];
  if (stats) {
    cells.push(
      {
        label: "Bons à envoyer",
        value: stats.toSend,
        tone: stats.toSend ? "warn" : undefined,
        href: "/commandes/suivi",
      },
      { label: "Bons en cours", value: stats.running, href: "/commandes?statut=brouillon" },
      { label: "Bons du jour", value: stats.today, href: "/commandes" },
    );
  }
  if (today) {
    cells.push(
      { label: "Missions PMR du jour", value: today.missions, href: "/pmr" },
      { label: "Groupes du jour", value: today.groups, href: "/groupes" },
    );
  }
  if (impacted !== null)
    cells.push({
      label: "Impactées (retard)",
      value: impacted,
      tone: impacted ? "danger" : undefined,
      href: "/pmr",
    });
  if (!cells.length) return null;
  return (
    <div
      data-testid="kpi-strip"
      className="grid grid-cols-2 overflow-hidden rounded-box border border-border bg-surface sm:grid-cols-3 xl:grid-cols-6"
    >
      {cells.map((c) => {
        const body = (
          <>
            <span className="truncate text-small text-fg-muted">{c.label}</span>
            <span
              className={cn(
                "font-mono text-h3 font-semibold tabular",
                c.value === 0 && "font-medium text-fg-subtle",
                c.tone === "warn" && "text-warn",
                c.tone === "danger" && "text-danger",
              )}
            >
              {c.value}
            </span>
          </>
        );
        const cls =
          "flex min-w-0 flex-col gap-0.5 border-t border-l border-border px-3 py-2 -mt-px -ml-px";
        return c.href ? (
          <Link key={c.label} href={c.href} className={cn(cls, "hover:bg-surface-2")}>
            {body}
          </Link>
        ) : (
          <div key={c.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
