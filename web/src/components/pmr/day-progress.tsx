"use client";

import { LocateFixed } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-badge";
import { gsap, highlightElements, MOTION_OK, NO_MOTION, useGSAP } from "@/lib/motion";
import {
  brusselsMinutes,
  fromMinutes,
  stripBuckets,
  stripPct,
  stripRange,
  stripTicks,
  untilLabel,
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
export function NowLine({
  now,
  nextTime,
  index,
  variant,
  colSpan = 1,
}: {
  now: number;
  /** Heure de la prochaine mission (vide : plus rien aujourd'hui). */
  nextTime: string;
  /** Position du repère dans la liste (le trait se redessine quand elle change). */
  index: number;
  variant: "row" | "card";
  colSpan?: number;
}) {
  const line = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useGSAP(
    () => {
      if (first.current) {
        first.current = false;
        return;
      }
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(
          line.current,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.45, ease: "hud", transformOrigin: "left center" },
        );
      });
      return () => mm.revert();
    },
    { dependencies: [index] },
  );
  const until = untilLabel(nextTime, now);
  const text = `Maintenant · ${fromMinutes(now)}`;
  const sub = nextTime ? `prochaine ${until || "imminente"}` : "plus rien aujourd'hui";
  const body = (
    <div className="relative flex h-8 items-center" aria-label={`${text}, ${sub}`} role="note">
      <span
        ref={line}
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-info"
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
      </li>
    );
  return (
    <tr data-band="" data-testid="now-line">
      <td colSpan={colSpan} className="p-0">
        {body}
      </td>
    </tr>
  );
}

/** Prochaine mission (première dont l'heure n'est pas passée) : pastille à côté de l'heure. */
export function NextBadge() {
  return (
    <Badge tone="info" className="ml-2 h-5 px-1.5 text-hint" data-testid="next-badge">
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
          <span
            aria-hidden
            data-testid="strip-cursor"
            className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-info transition-[left] duration-700 ease-hud motion-reduce:transition-none"
            style={{ left: `${cursor}%` }}
          >
            <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-info" />
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
