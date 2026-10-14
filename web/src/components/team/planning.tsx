import { CalendarClock } from "lucide-react";

import { Avatar } from "@/components/shell/avatar";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { brusselsToUtc, formatDay, sinceLabel } from "@/lib/orders/time";
import {
  KIND_LABEL,
  KIND_ORDER,
  brusselsClock,
  shiftLabel,
  weekRows,
  type QuinyxKind,
} from "@/lib/quinyx/model";
import { cn, pl } from "@/lib/utils";
import type { PlanningShift, QuinyxSync } from "@/server/data/quinyx";

// Équipe › Planning (14 oct. 2026) : horaires publiés dans Quinyx (PACO, RCCA, EXTRA), synchronisés par l'extension.

const KIND_TITLE: Record<QuinyxKind, string> = {
  am: "Matin (AM)",
  pm: "Après-midi (PM)",
  nuit: "Nuit",
  extra: "Extra",
  autre: "Autres prestations",
};

const hours = (s: PlanningShift) => `${brusselsClock(s.start)} – ${brusselsClock(s.end)}`;

/** « Synchronisé avec Quinyx il y a X » par groupe ; alerte au-delà de 24 h ou sans synchro. */
export function QuinyxFreshness({ syncs, now = new Date() }: { syncs: QuinyxSync[]; now?: Date }) {
  if (!syncs.length)
    return (
      <p className="text-small text-fg-muted" data-testid="quinyx-freshness">
        Aucun groupe Quinyx configuré (Administration › Quinyx).
      </p>
    );
  return (
    <ul
      className="flex flex-wrap gap-x-4 gap-y-1 text-small text-fg-muted"
      data-testid="quinyx-freshness"
    >
      {syncs.map((s) => {
        const at = s.at ? new Date(s.at) : null;
        const stale = !at || now.getTime() - at.getTime() > 24 * 3600_000;
        return (
          <li key={s.label} className={cn("flex items-center gap-1.5", stale && "text-warn")}>
            <CalendarClock aria-hidden className="size-4 shrink-0" />
            <span>
              {s.label} :{" "}
              {at
                ? `synchronisé avec Quinyx ${sinceLabel(at, now)}${s.to ? ` (publié jusqu'au ${formatDay(s.to)})` : ""}`
                : "jamais synchronisé : ouvre Quinyx avec l'extension CSM"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ShiftCard({ s, now, meId }: { s: PlanningShift; now: number; meId: string }) {
  const live = Date.parse(s.start) <= now && now < Date.parse(s.end);
  const me = !!s.userId && s.userId === meId;
  return (
    <li
      className={cn(
        "flex min-h-[3.25rem] items-center gap-3 rounded-control border border-border bg-surface px-3 py-2",
        me && "border-accent bg-accent-soft",
      )}
      data-testid="planning-shift"
    >
      <Avatar name={s.name} email="" id={s.userId || undefined} avatar={s.avatar} role={s.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {s.name}
          {me ? <span className="text-small font-normal text-fg-muted"> (toi)</span> : null}
        </span>
        <span className="truncate text-small text-fg-muted">{shiftLabel(s)}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="tabular text-small">{hours(s)}</span>
        <span className="flex gap-1">
          {live ? <Badge tone="ok">En service</Badge> : null}
          {s.district ? <Badge>{s.district}</Badge> : null}
        </span>
      </div>
    </li>
  );
}

export function PlanningDay({
  shifts,
  day,
  isToday,
  meId,
}: {
  shifts: PlanningShift[];
  day: string;
  isToday: boolean;
  meId: string;
}) {
  const now = Date.now();
  const dayShifts = shifts.filter((s) => s.day === day);
  // Nuit commencée la veille : affichée tant qu'elle n'est pas finie (aujourd'hui) ou toujours pour un autre jour.
  // Prestation commencée la veille et finie après minuit (nuit, extra de nuit).
  const dayStart = Date.parse(brusselsToUtc(day, "00:00"));
  const eve = shifts.filter(
    (s) => s.day < day && Date.parse(s.end) > dayStart && (!isToday || Date.parse(s.end) > now),
  );
  const blocks: { id: string; title: string; list: PlanningShift[] }[] = [];
  if (eve.length) blocks.push({ id: "veille", title: "Nuit de la veille", list: eve });
  for (const k of KIND_ORDER) {
    const list = dayShifts.filter((s) => s.kind === k);
    if (list.length) blocks.push({ id: k, title: KIND_TITLE[k], list });
  }
  if (!blocks.length)
    return (
      <EmptyState
        title="Aucune prestation publiée"
        description="Rien dans Quinyx pour ce jour (ou pas encore synchronisé, ou pas encore publié)."
      />
    );
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="planning-day">
      {blocks.map((b) => (
        <section key={b.id} className="flex min-w-0 flex-col gap-2" aria-label={b.title}>
          <h3 className="flex items-baseline justify-between text-body font-semibold">
            {b.title}
            <span className="text-small font-normal text-fg-muted">
              {b.list.length} {pl(b.list.length, "agent")}
            </span>
          </h3>
          <ul className="flex flex-col gap-1.5">
            {b.list.map((s) => (
              <ShiftCard key={s.id} s={s} now={now} meId={meId} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Pill({ s }: { s: PlanningShift }) {
  return (
    <span
      className="inline-flex flex-col rounded-control border border-border bg-surface-2 px-1.5 py-0.5 text-small leading-tight"
      title={`${shiftLabel(s)} · ${hours(s)}`}
    >
      <span className="font-medium">
        {KIND_LABEL[s.kind]}
        {s.district ? <span className="font-normal text-fg-muted"> · {s.district}</span> : null}
      </span>
      <span className="tabular text-fg-muted">{hours(s)}</span>
    </span>
  );
}

export function PlanningWeek({
  shifts,
  days,
  today,
  meId,
}: {
  shifts: PlanningShift[];
  days: string[];
  today: string;
  meId: string;
}) {
  if (!shifts.length)
    return (
      <EmptyState
        title="Aucune prestation publiée cette semaine"
        description="Rien dans Quinyx pour cette semaine (ou pas encore synchronisé, ou pas encore publié)."
      />
    );
  const rows = weekRows(shifts);
  return (
    <>
      {/* Desktop : grille agents × jours */}
      <div
        className="hidden overflow-x-auto rounded-box border border-border md:block"
        data-testid="planning-grid"
      >
        <table className="w-full border-collapse text-body">
          <thead className="bg-surface-2">
            <tr>
              <th
                scope="col"
                className="h-9 border-b border-border px-3 text-left text-small font-medium text-fg-muted"
              >
                Agent
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  scope="col"
                  className={cn(
                    "h-9 border-b border-border px-2 text-left text-small font-medium whitespace-nowrap text-fg-muted",
                    d === today && "text-fg",
                  )}
                >
                  {formatDay(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const me = r.byDay.values().next().value?.[0]?.userId === meId && !!meId;
              return (
                <tr
                  key={r.agentId}
                  className={cn("border-b border-border last:border-b-0", me && "bg-accent-soft")}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                    {r.name}
                  </th>
                  {days.map((d) => (
                    <td
                      key={d}
                      className={cn("px-2 py-1.5 align-top", d === today && "bg-accent-faint")}
                    >
                      <span className="flex flex-col gap-1">
                        {(r.byDay.get(d) ?? []).map((s) => (
                          <Pill key={s.id} s={s} />
                        ))}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile : un bloc par jour */}
      <div className="flex flex-col gap-4 md:hidden" data-testid="planning-week-list">
        {days.map((d) => {
          const list = shifts.filter((s) => s.day === d);
          return (
            <section key={d} className="flex flex-col gap-1.5" aria-label={formatDay(d)}>
              <h3 className="text-body font-semibold first-letter:uppercase">
                {formatDay(d)}
                <span className="text-small font-normal text-fg-muted">
                  {d === today ? " · aujourd'hui" : ""} · {list.length} {pl(list.length, "agent")}
                </span>
              </h3>
              {list.length ? (
                <ul className="flex flex-col gap-1.5">
                  {list.map((s) => (
                    <li
                      key={s.id}
                      className={cn(
                        "flex min-h-11 items-center justify-between gap-2 rounded-control border border-border bg-surface px-3 py-1.5",
                        s.userId && s.userId === meId && "border-accent bg-accent-soft",
                      )}
                    >
                      <span className="min-w-0 truncate font-medium">{s.name}</span>
                      <Pill s={s} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-fg-muted">Personne.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
