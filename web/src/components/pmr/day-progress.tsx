"use client";

import { LocateFixed } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-badge";
import { animateFrom, highlightElements, NO_MOTION } from "@/lib/motion-core";
import {
  brusselsMinutes,
  fromMinutes,
  stripBuckets,
  stripPct,
  stripRange,
  stripTicks,
  untilLabel,
  type PendingArrival,
} from "@/lib/pmr/now-line";
import { cn, pl } from "@/lib/utils";

// « Où en est-on dans la journée ? » (15 oct. 2026) : heure courante, repère « maintenant » dans la liste, mini-frise.
// Rien n'anime au premier affichage ; aucune boucle hormis le point « en direct » (`animate-pulse-dot`, toléré par
// l'E2E motion) ; rien en mouvement réduit.

/**
 * Minute courante (Bruxelles), relue toutes les 30 s et au retour sur l'onglet. Valeur initiale = celle du serveur
 * (aucun écart d'hydratation), la première relecture se fait après le montage.
 */
export function useNowMinute(initial: number): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const tick = () => setNow(brusselsMinutes(new Date()));
    tick();
    const t = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return now;
}

/** Élément visible (tableau desktop ou carte mobile : les deux sont dans le DOM) correspondant au sélecteur. */
function visible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector))
    if (el.offsetParent !== null || el.getClientRects().length) return el;
  return null;
}

/** Fait défiler jusqu'à la ligne `id` (`data-hl`) ou jusqu'au repère « maintenant », puis la signale. */
export function scrollToMission(id: string | null) {
  const el = id ? visible(`[data-hl="${CSS.escape(id)}"]`) : visible('[data-testid="now-line"]');
  if (!el) return;
  const smooth = !window.matchMedia(NO_MOTION).matches;
  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  if (id) highlightElements([el]);
}

/**
 * Repère « maintenant » : trait `info` sur toute la largeur, heure courante et délai jusqu'à la prochaine prise en
 * charge. Quand une mission vient de passer (le repère descend), le trait se redessine (GSAP, 450 ms).
 */
/** Arrivées rappelées sur le repère au plus (au-delà : « + N »). */
const MAX_PENDING = 3;

export function NowLine({
  now,
  nextTime,
  index,
  variant,
  colSpan = 1,
  pending = [],
}: {
  now: number;
  /** Heure de la prochaine mission (vide : plus rien aujourd'hui). */
  nextTime: string;
  /** Position du repère dans la liste (le trait se redessine quand elle change). */
  index: number;
  variant: "row" | "card";
  colSpan?: number;
  /**
   * Arrivées à venir des trajets déjà partis (au-dessus du repère, 22 oct. 2026) : rappelées sous la ligne, un clic
   * ramène au trajet. La liste garde une ligne par trajet.
   */
  pending?: PendingArrival[];
}) {
  const line = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  // Le trait se redessine (de gauche à droite) quand le repère change de place ; jamais au premier rendu.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!line.current) return;
    return animateFrom([line.current], { transform: "scaleX(0)" }, { duration: 450 });
  }, [index]);
  const until = untilLabel(nextTime, now);
  const text = `Maintenant · ${fromMinutes(now)}`;
  const sub = nextTime ? `prochaine ${until || "imminente"}` : "plus rien aujourd'hui";
  const shown = pending.slice(0, MAX_PENDING);
  const more = pending.length - shown.length;
  const arrivals = pending.length ? (
    <div
      className="sticky left-2 flex max-w-[calc(100%-1rem)] min-w-0 flex-wrap items-center gap-1.5 px-2 pb-1.5 text-small"
      data-testid="now-pending"
    >
      <span className="text-fg-muted">
        {pending.length > 1 ? "Débarquements à venir :" : "Débarquement à venir :"}
      </span>
      {shown.map((p) => (
        <button
          key={p.id}
          type="button"
          className="inline-flex min-h-11 max-w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-control border border-border bg-surface px-2 hover:bg-surface-2 focus-visible:outline-1 focus-visible:outline-accent md:min-h-7"
          aria-label={`Aller au trajet du train ${p.train || "?"}, débarquement à ${p.time} à ${p.station}`}
          onClick={() => scrollToMission(p.id)}
        >
          <span className="font-mono font-semibold tabular">{p.train || "—"}</span>
          <span className="font-mono tabular text-info">{p.time}</span>
          <span className="min-w-0 truncate">{p.station || "—"}</span>
          <span className="shrink-0 text-hint text-fg-muted">OUT</span>
        </button>
      ))}
      {more > 0 ? <span className="text-fg-muted">+ {more}</span> : null}
    </div>
  ) : null;
  const body = (
    <div className="relative flex h-8 items-center" aria-label={`${text}, ${sub}`} role="note">
      <span
        ref={line}
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-0.5 origin-left -translate-y-1/2 bg-info"
      />
      <span className="sticky left-2 z-[1] ml-2 inline-flex max-w-[calc(100%-1rem)] min-w-0 items-center gap-2 overflow-hidden rounded-control border border-[color-mix(in_oklab,var(--info)_45%,transparent)] bg-surface px-2 py-0.5 text-small whitespace-nowrap text-info shadow-sm">
        <span aria-hidden className="size-2 shrink-0 animate-pulse-dot rounded-full bg-info" />
        <span className="shrink-0 font-mono font-semibold tabular" data-testid="now-time">
          {text}
        </span>
        <span className="min-w-0 truncate text-fg-muted">· {sub}</span>
      </span>
    </div>
  );
  if (variant === "card")
    return (
      <li data-testid="now-line" className="list-none">
        {body}
        {arrivals}
      </li>
    );
  return (
    <tr data-band="" data-testid="now-line">
      <td colSpan={colSpan} className="p-0">
        {body}
        {arrivals}
      </td>
    </tr>
  );
}

/** Prochaine mission (première dont l'heure n'est pas passée) : pastille à côté de l'heure. */
export function NextBadge() {
  return (
    <Badge tone="info" className="h-5 shrink-0 px-1.5 text-hint" data-testid="next-badge">
      Prochaine
    </Badge>
  );
}

/**
 * Mini-frise de la journée (6 h – 22 h au moins) : densité des prises en charge par demi-heure, curseur « maintenant »
 * qui avance, clic sur une tranche = défilement vers la première mission de cette heure, « Aller à maintenant ».
 */
export function DayStrip({
  times,
  now,
  done,
  total,
  onPick,
  noun = "prise en charge",
  nouns = "prises en charge",
}: {
  /** Heures des prises en charge du jour (IN au départ, OUT à l'arrivée). */
  times: string[];
  now: number;
  /** Missions déjà passées / total (résumé). */
  done: number;
  total: number;
  onPick: (minute: number | null) => void;
  noun?: string;
  nouns?: string;
}) {
  const range = useMemo(() => stripRange(times), [times]);
  const buckets = useMemo(() => stripBuckets(times, range), [times, range]);
  const ticks = useMemo(() => stripTicks(range), [range]);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const cursor = stripPct(now, range);
  const inRange = now >= range.from && now <= range.to;
  return (
    <div
      className="flex min-w-0 flex-col gap-2 rounded-box border border-border bg-surface px-3 py-2.5"
      data-testid="day-strip"
      data-print="hide"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-fg-muted">
          <span className="font-semibold text-fg">Aujourd&apos;hui</span> ·{" "}
          <span className="font-mono tabular text-fg">{times.length}</span>{" "}
          {pl(times.length, noun, nouns)} ·{" "}
          <span className="font-mono tabular text-fg" data-testid="strip-done">
            {done}/{total}
          </span>{" "}
          {pl(total, "mission")} passée{done > 1 ? "s" : ""}
        </p>
        <Button size="sm" variant="secondary" onClick={() => onPick(null)} data-testid="go-now">
          <LocateFixed aria-hidden /> Aller à maintenant
        </Button>
      </div>
      <div className="relative">
        <div
          role="group"
          aria-label={`${pl(times.length, noun, nouns)} par demi-heure, de ${fromMinutes(range.from)} à ${fromMinutes(range.to)}`}
          className="flex h-10 items-end gap-px"
        >
          {buckets.map((b) => {
            const past = b.to <= now;
            const h = b.count ? Math.max(18, Math.round((b.count / max) * 100)) : 6;
            const label = `${fromMinutes(b.from)} – ${fromMinutes(b.to)} : ${b.count} ${pl(b.count, noun, nouns)}`;
            const cls = cn(
              "min-w-0 flex-1 rounded-t-[2px] transition-colors",
              !b.count
                ? "bg-border"
                : past
                  ? "bg-border-strong"
                  : "bg-[color-mix(in_oklab,var(--info)_55%,var(--surface))] hover:bg-info",
            );
            return b.count ? (
              <button
                key={b.from}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => onPick(b.from)}
                className={cn(
                  cls,
                  "cursor-pointer focus-visible:outline-1 focus-visible:outline-accent",
                )}
                style={{ height: `${h}%` }}
              />
            ) : (
              <span key={b.from} aria-hidden className={cls} style={{ height: `${h}%` }} />
            );
          })}
        </div>
        {inRange ? (
          // Curseur déplacé par `transform` (calque pleine largeur décalé de `cursor` %), jamais par `left`.
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-1 -bottom-1 overflow-x-clip"
          >
            <span
              className="absolute inset-0 transition-transform duration-700 ease-hud motion-reduce:transition-none"
              style={{ transform: `translateX(${cursor}%)` }}
            >
              <span
                data-testid="strip-cursor"
                className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-info"
              >
                <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-info" />
              </span>
            </span>
          </span>
        ) : null}
      </div>
      <div aria-hidden className="relative h-4 font-mono text-hint text-fg-muted tabular">
        {ticks.map((t) => (
          <span
            key={t.label}
            className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
            style={{ left: `${t.pct}%` }}
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
