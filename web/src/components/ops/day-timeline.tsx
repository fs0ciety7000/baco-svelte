"use client";

import { Bus, CarTaxiFront, TrainFront, Users } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { DelayBadge } from "@/components/pmr/train-chip";
import { EmptyState } from "@/components/ui/misc";
import { gsap, MOTION, MOTION_OK, useGSAP } from "@/lib/motion";
import {
  fromMinutes,
  hourRange,
  nextIndex,
  packLanes,
  span,
  TIMELINE_ROWS,
  toMinutes,
  type Timeline,
  type TimelineItem,
  type TimelineKind,
} from "@/lib/ops/timeline";
import { cn, pl } from "@/lib/utils";

// Frise « Ma journée » (demande du 10 oct. 2026). Desktop : ligne de temps horizontale (une rangée par type, pistes
// sans chevauchement), trait « maintenant » qui avance, queue de retard. Mobile : agenda vertical avec le même trait.

const PX_PER_MIN = 2;
const LANE_H = 44;
const LABEL_W = 120;

const ICONS: Record<TimelineKind, ReactNode> = {
  pmr: <TrainFront aria-hidden className="size-4" />,
  groupe: <Users aria-hidden className="size-4" />,
  bus: <Bus aria-hidden className="size-4" />,
  taxi: <CarTaxiFront aria-hidden className="size-4" />,
};
const KIND_LABEL: Record<TimelineKind, string> = {
  pmr: "PMR",
  groupe: "Groupe",
  bus: "Bus",
  taxi: "Taxi",
};

/** Minutes écoulées depuis minuit à Bruxelles, rafraîchies toutes les 30 s. */
function useNowMinutes(): number {
  const read = () => {
    const [h, m] = new Intl.DateTimeFormat("fr-BE", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date())
      .split(":")
      .map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const [now, setNow] = useState(read);
  useEffect(() => {
    const t = window.setInterval(() => setNow(read()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function itemLabel(it: TimelineItem) {
  const delay = it.impact
    ? it.impact.cancelled
      ? ", train supprimé"
      : `, ${it.impact.delay} min de retard`
    : "";
  return `${it.start}${it.end ? `–${it.end}` : ""} · ${KIND_LABEL[it.kind]} ${it.train} · ${it.title} · ${it.detail}${delay}`;
}

function Summary({ items }: { items: TimelineItem[] }) {
  const count = (k: TimelineKind) => items.filter((i) => i.kind === k).length;
  const late = items.filter((i) => i.impact).length;
  const parts: [number, string][] = [
    [count("pmr"), pl(count("pmr"), "prise en charge PMR", "prises en charge PMR")],
    [count("groupe"), pl(count("groupe"), "groupe")],
    [count("bus"), pl(count("bus"), "bon de bus", "bons de bus")],
    [count("taxi"), pl(count("taxi"), "taxi")],
  ];
  return (
    <p
      className="flex flex-wrap gap-x-4 gap-y-1 text-body text-fg-muted"
      data-testid="timeline-summary"
    >
      {parts.map(([n, label]) => (
        <span key={label}>
          <span className="font-mono text-fg tabular">{n}</span> {label}
        </span>
      ))}
      {late ? (
        <span className="text-warn">
          <span className="font-mono tabular">{late}</span>{" "}
          {pl(late, "train en retard", "trains en retard")}
        </span>
      ) : null}
    </p>
  );
}

function Desktop({
  items,
  now,
  isToday,
  context,
}: {
  items: TimelineItem[];
  now: number;
  isToday: boolean;
  context: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const nowLine = useRef<HTMLDivElement>(null);
  const { from, to } = useMemo(() => hourRange(items), [items]);
  const rows = useMemo(
    () =>
      TIMELINE_ROWS.map((r) => {
        const placed = packLanes(items.filter((i) => i.kind === r.kind));
        const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
        return { ...r, placed, lanes };
      }).filter((r) => r.placed.length || r.kind === "pmr"),
    [items],
  );
  const width = (to - from) * PX_PER_MIN;
  const x = (m: number) => (m - from) * PX_PER_MIN;
  const showNow = isToday && now >= from && now <= to;
  const firstRun = useRef(true);

  // À l'ouverture : la frise se place sur « maintenant » (un tiers de la largeur visible).
  useEffect(() => {
    const el = scroller.current;
    if (!el || !isToday) return;
    el.scrollLeft = Math.max(0, x(now) - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  // Entrée : le trait « maintenant » descend, les queues de retard s'étirent ; au changement de filtre, les éléments
  // apparaissent de gauche à droite. Jamais au premier rendu pour le contenu (déjà peint par le serveur).
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (nowLine.current)
          gsap.from(nowLine.current, {
            scaleY: 0,
            transformOrigin: "top",
            duration: 0.5,
            ease: "hud",
          });
        gsap.from("[data-delay-tail]", {
          scaleX: 0,
          transformOrigin: "left",
          duration: 0.6,
          delay: 0.15,
          ease: "hud",
          stagger: 0.02,
        });
        if (!firstRun.current)
          gsap.from("[data-timeline-item]", {
            autoAlpha: 0,
            x: -8,
            duration: MOTION.enter,
            ease: "hud",
            stagger: { each: 0.012, from: "start" },
            clearProps: "opacity,visibility,transform",
          });
      });
      firstRun.current = false;
      return () => mm.revert();
    },
    { scope, dependencies: [context] },
  );

  // Le trait avance en douceur (pas de saut à chaque rafraîchissement de 30 s).
  useGSAP(
    () => {
      if (!nowLine.current) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(nowLine.current, { left: x(now) + LABEL_W, duration: 1, ease: "hud" });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(nowLine.current, { left: x(now) + LABEL_W });
      });
      return () => mm.revert();
    },
    { dependencies: [now, from] },
  );

  const hours: number[] = [];
  for (let h = from; h <= to; h += 60) hours.push(h);

  return (
    <div
      ref={scroller}
      className="relative overflow-x-auto rounded-box border border-border bg-surface"
      data-testid="timeline-desktop"
    >
      <div ref={scope} className="relative" style={{ width: width + LABEL_W + 24 }}>
        {/* Graduation des heures */}
        <div className="sticky top-0 z-20 flex h-8 border-b border-border bg-surface" aria-hidden>
          <div
            className="sticky left-0 z-20 shrink-0 border-r border-border bg-surface"
            style={{ width: LABEL_W }}
          />
          <div className="relative flex-1">
            {hours.map((h) => (
              <span
                key={h}
                className="absolute top-1.5 -translate-x-1/2 text-small whitespace-nowrap text-fg-muted tabular"
                style={{ left: x(h) }}
              >
                {h / 60} h
              </span>
            ))}
          </div>
        </div>
        {/* Lignes d'heure */}
        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: LABEL_W }}
          aria-hidden
        >
          {hours.map((h) => (
            <span
              key={h}
              className="absolute inset-y-0 border-l border-border/60"
              style={{ left: x(h) }}
            />
          ))}
        </div>
        {rows.map((r) => (
          <div
            key={r.kind}
            className="relative flex border-b border-border last:border-b-0"
            role="group"
            aria-label={r.label}
          >
            <div
              className="sticky left-0 z-10 flex shrink-0 items-start gap-2 border-r border-border bg-surface px-3 py-3 text-small font-medium text-fg"
              style={{ width: LABEL_W }}
            >
              {ICONS[r.kind]}
              <span>
                {r.label}
                <span className="block font-mono text-fg-muted tabular">{r.placed.length}</span>
              </span>
            </div>
            <div className="relative flex-1" style={{ height: r.lanes * LANE_H + 8 }}>
              {r.placed.length === 0 ? (
                <p className="absolute top-3 left-3 text-small text-fg-muted">Rien de prévu</p>
              ) : null}
              {r.placed.map(({ item, lane }) => {
                const s = span(item)!;
                const a = toMinutes(item.start)!;
                const delay = item.impact && !item.impact.cancelled ? item.impact.delay : 0;
                const base = s.b - a - delay;
                const past = isToday && s.b < now;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    data-timeline-item
                    data-testid="timeline-item"
                    aria-label={itemLabel(item)}
                    title={itemLabel(item)}
                    className={cn(
                      "group absolute flex items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                      past && "opacity-55",
                    )}
                    style={{ left: x(a), top: lane * LANE_H + 6, height: LANE_H - 8 }}
                  >
                    <span
                      className={cn(
                        "flex h-full min-w-0 items-center gap-1.5 overflow-hidden rounded-control border bg-surface-2 px-1.5 text-small text-fg group-hover:border-border-strong",
                        item.impact?.cancelled
                          ? "border-danger line-through decoration-danger"
                          : "border-border",
                      )}
                      style={{ width: base * PX_PER_MIN }}
                    >
                      {item.io ? (
                        <span className="shrink-0 font-mono text-label text-fg-muted">
                          {item.io}
                        </span>
                      ) : null}
                      <span className="shrink-0 font-mono font-bold tabular">{item.train}</span>
                      <span className="min-w-0 truncate text-fg-muted">{item.station}</span>
                    </span>
                    {delay ? (
                      <span
                        data-delay-tail
                        aria-hidden
                        className={cn(
                          "h-2 rounded-r-full",
                          delay >= 15 ? "bg-danger/70" : "bg-warn/70",
                        )}
                        style={{ width: delay * PX_PER_MIN }}
                      />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        {showNow ? (
          <div
            ref={nowLine}
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-0 border-l-2 border-info"
            style={{ left: x(now) + LABEL_W }}
            data-testid="timeline-now"
          >
            <span className="absolute top-1 left-1 rounded-control bg-info px-1 font-mono text-label font-bold text-bg tabular">
              {fromMinutes(now)}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Mobile({
  items,
  now,
  isToday,
  context,
}: {
  items: TimelineItem[];
  now: number;
  isToday: boolean;
  context: string;
}) {
  const marker = useRef<HTMLLIElement>(null);
  const scope = useRef<HTMLOListElement>(null);
  const next = isToday ? nextIndex(items, now) : -1;
  const nowAt = isToday ? (next < 0 ? items.length : next) : -1;

  // À l'ouverture du jour courant : le trait « maintenant » au tiers haut de l'écran.
  useEffect(() => {
    if (!isToday || !marker.current) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const top =
      marker.current.getBoundingClientRect().top + window.scrollY - window.innerHeight / 3;
    window.scrollTo({ top: Math.max(0, top) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (marker.current)
          gsap.from(marker.current.querySelector("[data-now-bar]"), {
            scaleX: 0,
            transformOrigin: "left",
            duration: 0.5,
            ease: "hud",
          });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [context] },
  );

  const nowRow = (
    <li ref={marker} className="flex items-center gap-2 py-1" data-testid="timeline-now-mobile">
      <span className="rounded-control bg-info px-1.5 font-mono text-small font-bold text-bg tabular">
        {fromMinutes(now)}
      </span>
      <span data-now-bar className="h-0.5 flex-1 bg-info" aria-hidden />
      <span className="sr-only">Maintenant</span>
    </li>
  );

  let lastHour = "";
  return (
    <ol ref={scope} className="flex flex-col gap-1" data-testid="timeline-mobile">
      {items.map((it, i) => {
        const hour = it.start.slice(0, 2);
        const head = hour !== lastHour;
        lastHour = hour;
        const s = span(it);
        const past = isToday && s !== null && s.b < now;
        return (
          <Fragment key={it.id}>
            {i === nowAt ? nowRow : null}
            {head ? (
              <li className="pt-2 font-mono text-small text-fg-muted tabular" aria-hidden>
                {Number(hour)} h
              </li>
            ) : null}
            <li>
              <Link
                href={it.href}
                aria-label={itemLabel(it)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-box border border-border bg-surface px-3 py-2",
                  past && "opacity-55",
                  it.impact?.cancelled && "border-danger",
                )}
              >
                <span className="w-12 shrink-0 font-mono text-body text-fg tabular">
                  {it.start}
                  {it.end ? (
                    <span className="block text-small text-fg-muted">→ {it.end}</span>
                  ) : null}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-body font-medium">
                    <span className="text-fg-muted">{ICONS[it.kind]}</span>
                    <span className="font-mono font-bold tabular">{it.train}</span>
                    {it.io ? (
                      <span className="font-mono text-small text-fg-muted">{it.io}</span>
                    ) : null}
                    <DelayBadge impact={it.impact} className="ml-auto" />
                  </span>
                  <span className="truncate text-small text-fg-muted">
                    {it.title} · {it.detail}
                  </span>
                </span>
              </Link>
            </li>
          </Fragment>
        );
      })}
      {nowAt === items.length ? nowRow : null}
    </ol>
  );
}

export function DayTimeline({
  data,
  isToday,
  context,
}: {
  data: Timeline;
  isToday: boolean;
  context: string;
}) {
  const now = useNowMinutes();
  if (!data.items.length)
    return (
      <EmptyState
        title="Rien de prévu"
        description="Aucune mission, aucun groupe ni bon de commande pour ce jour et ces filtres."
      />
    );
  return (
    <div className="flex flex-col gap-3">
      <Summary items={data.items} />
      <div className="hidden md:block">
        <Desktop items={data.items} now={now} isToday={isToday} context={context} />
      </div>
      <div className="md:hidden">
        <Mobile items={data.items} now={now} isToday={isToday} context={context} />
      </div>
    </div>
  );
}
