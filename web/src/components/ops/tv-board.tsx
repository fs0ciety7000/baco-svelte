"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Bus,
  Megaphone,
  TrainFront,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { gsap, MOTION_OK, useGSAP } from "@/lib/motion";
import type { Handover, HandoverLeg } from "@/lib/ops/handover";
import type { BoardRow } from "@/lib/ops/irail";
import { cn, pl } from "@/lib/utils";

// Écran commun (demande du 10 oct. 2026) : lisible à 3 m (texte ≥ 20 px), contraste fort, rien à cliquer. Heure qui
// avance, prises en charge des 3 prochaines heures, trains en retard, bons ouverts, urgences et consignes, perturbations.
// Relu toutes les 60 s en plus du direct (un écran resté allumé toute la nuit ne doit jamais rester figé).

const H3 = 3 * 60;

export type TvStationBoards = {
  station: string;
  departures: BoardRow[] | null;
  arrivals: BoardRow[] | null;
};

const hm = (ms: number) =>
  new Intl.DateTimeFormat("fr-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));

/** Tableau des départs ou des arrivées (iRail) : heure, train, destination / origine, voie, retard. */
function StationBoard({ rows, kind }: { rows: BoardRow[] | null; kind: "departure" | "arrival" }) {
  if (!rows)
    return <p className="text-[1.15rem] text-fg-muted">iRail indisponible pour l&apos;instant.</p>;
  const shown = rows.filter((r) => !r.left).slice(0, 8);
  if (!shown.length)
    return <p className="text-[1.15rem] text-fg-muted">Aucun train dans l&apos;heure.</p>;
  return (
    <ul data-testid={kind === "departure" ? "tv-departures" : "tv-arrivals"}>
      {shown.map((r) => (
        <li
          key={`${r.train}-${r.at}`}
          className={cn(
            "flex items-baseline gap-3 border-b border-border py-1 text-[1.15rem] last:border-b-0",
            r.cancelled && "text-danger",
          )}
        >
          <span className={cn("w-14 shrink-0 font-mono tabular", r.cancelled && "line-through")}>
            {hm(r.at)}
          </span>
          <span className="w-20 shrink-0 truncate font-mono font-bold tabular">{r.label}</span>
          <span className="min-w-0 flex-1 truncate">{r.other}</span>
          <span
            className={cn(
              "w-10 shrink-0 text-right font-mono tabular",
              r.platformChanged ? "font-bold text-warn" : "text-fg-muted",
            )}
            title="Voie"
          >
            {r.platform || "–"}
          </span>
          <span
            className={cn(
              "w-28 shrink-0 text-right font-mono font-bold whitespace-nowrap tabular",
              r.cancelled || r.delayMin >= 15
                ? "text-danger"
                : r.delayMin >= 5
                  ? "text-warn"
                  : "text-ok",
            )}
          >
            {r.cancelled ? "Supprimé" : r.delayMin ? `+${r.delayMin} min` : "à l'heure"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function useClock() {
  const fmt = () => {
    const d = new Date();
    return {
      time: new Intl.DateTimeFormat("fr-BE", {
        timeZone: "Europe/Brussels",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(d),
      day: new Intl.DateTimeFormat("fr-BE", {
        timeZone: "Europe/Brussels",
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(d),
    };
  };
  const [now, setNow] = useState<{ time: string; day: string } | null>(null);
  useEffect(() => {
    setNow(fmt());
    const t = window.setInterval(() => setNow(fmt()), 10_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const minutes = (hm: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(hm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

function Panel({
  icon,
  title,
  count,
  tone = "neutral",
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  tone?: "neutral" | "warn" | "danger";
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-tv-panel
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-3 border border-border bg-surface p-4",
        className,
      )}
      aria-label={title}
    >
      <h2 className="flex min-w-0 items-center gap-2 text-[1.35rem] font-semibold text-fg">
        {icon}
        {title}
        {count !== undefined ? (
          <span
            className={cn(
              "ml-auto font-mono text-[1.6rem] tabular",
              count && tone === "danger"
                ? "text-danger"
                : count && tone === "warn"
                  ? "text-warn"
                  : "text-fg-muted",
            )}
          >
            {count}
          </span>
        ) : null}
      </h2>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

function Leg({ l }: { l: HandoverLeg }) {
  const late = l.impact && !l.impact.cancelled ? l.impact.delay : 0;
  return (
    <li className="flex items-baseline gap-3 border-b border-border py-1.5 text-[1.25rem] last:border-b-0">
      <span className="w-16 shrink-0 font-mono tabular">{l.time || "--:--"}</span>
      <span className="w-24 shrink-0 font-mono font-bold tabular">{l.train}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-fg-muted">{l.io === "IN" ? "Embarq." : "Débarq."}</span> {l.station}
      </span>
      <span className="hidden shrink-0 text-fg-muted xl:inline">{l.detail}</span>
      {l.impact ? (
        <span
          className={cn(
            "shrink-0 font-mono font-bold tabular",
            l.impact.cancelled || late >= 15 ? "text-danger" : "text-warn",
          )}
        >
          {l.impact.cancelled ? "Supprimé" : `+${late}`}
        </span>
      ) : null}
    </li>
  );
}

export function TvBoard({
  data,
  boards,
  scope,
}: {
  data: Handover;
  boards: TvStationBoards;
  scope: string;
}) {
  const router = useRouter();
  const clock = useClock();
  const scopeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [router]);
  // Entrée douce des panneaux (une fois) ; rien qui boucle à l'écran.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.from("[data-tv-panel]", {
          autoAlpha: 0,
          y: 10,
          duration: 0.4,
          stagger: 0.06,
          ease: "hud",
        });
      });
      return () => mm.revert();
    },
    { scope: scopeRef },
  );

  const nowMin = clock ? minutes(clock.time) : null;
  const next = data.upcoming.filter((l) => {
    if (l.day !== data.today) return false;
    const m = minutes(l.time);
    return nowMin === null || m === null || m - nowMin <= H3;
  });
  const orders = data.toConfirm.length + data.toClose.length;
  return (
    <div ref={scopeRef} className="grid gap-4 lg:h-[calc(100dvh-3rem)] lg:grid-rows-[auto_1fr]">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-1">
        <span
          className="font-mono text-[3.5rem] leading-none font-bold tabular"
          data-testid="tv-clock"
        >
          {clock?.time ?? "--:--"}
        </span>
        <span className="pb-1 text-[1.5rem] text-fg-muted first-letter:uppercase">
          {clock?.day ?? ""}
        </span>
        <span className="ml-auto pb-1 text-[1.25rem] text-fg-muted">
          CSM · <span className="text-fg">{scope}</span>
        </span>
      </header>
      <div className="grid min-h-0 min-w-0 gap-4 lg:grid-cols-3 lg:grid-rows-2">
        <Panel
          icon={<TrainFront aria-hidden className="size-6" />}
          title="Prochaines prises en charge (3 h)"
          count={next.length}
          className="lg:col-span-2"
        >
          {next.length ? (
            <ul data-testid="tv-upcoming">
              {next.slice(0, 9).map((l) => (
                <Leg key={l.id} l={l} />
              ))}
            </ul>
          ) : (
            <p className="text-[1.25rem] text-fg-muted">
              Aucune prise en charge dans les 3 heures.
            </p>
          )}
        </Panel>
        <Panel
          icon={<TriangleAlert aria-hidden className="size-6" />}
          title="Trains en retard"
          count={data.delays.length}
          tone="danger"
        >
          {data.delays.length ? (
            <ul>
              {data.delays.slice(0, 7).map((l) => (
                <Leg key={l.id} l={l} />
              ))}
            </ul>
          ) : (
            <p className="text-[1.25rem] text-fg-muted">Tout est à l&apos;heure.</p>
          )}
        </Panel>
        <Panel
          icon={<ArrowUpRight aria-hidden className="size-6" />}
          title={`Départs · ${boards.station}`}
        >
          <StationBoard rows={boards.departures} kind="departure" />
        </Panel>
        <Panel
          icon={<ArrowDownRight aria-hidden className="size-6" />}
          title={`Arrivées · ${boards.station}`}
        >
          <StationBoard rows={boards.arrivals} kind="arrival" />
        </Panel>
        <div className="grid min-h-0 min-w-0 gap-4">
          <Panel
            icon={<Megaphone aria-hidden className="size-6" />}
            title="Urgences et consignes"
            count={data.log.length}
            tone="warn"
          >
            {data.log.length ? (
              <ul className="flex flex-col gap-1.5">
                {data.log.slice(0, 4).map((m) => (
                  <li
                    key={m.id}
                    className={cn("truncate text-[1.15rem]", m.urgent && "text-danger")}
                  >
                    <span className="font-mono text-fg-muted tabular">{m.time}</span> {m.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[1.15rem] text-fg-muted">Rien d&apos;urgent.</p>
            )}
          </Panel>
          <Panel
            icon={<Bus aria-hidden className="size-6" />}
            title="Bons ouverts"
            count={orders + data.running.length}
            tone={data.toClose.length ? "warn" : "neutral"}
          >
            <p className="text-[1.15rem]">
              <span className="font-mono tabular">{data.toConfirm.length}</span> à confirmer ·{" "}
              <span className="font-mono tabular">{data.running.length}</span> en cours
              {data.toClose.length ? (
                <>
                  {" "}
                  · <span className="font-mono text-warn tabular">{data.toClose.length}</span> à
                  clôturer
                </>
              ) : null}
            </p>
            <p className="mt-1 flex items-center gap-2 text-[1.05rem] text-fg-muted">
              <Users aria-hidden className="size-5" /> ALEA à encoder :{" "}
              <span className="font-mono text-fg tabular">{data.aleaTotal}</span> ·{" "}
              {data.disturbances.length} {pl(data.disturbances.length, "perturbation")}
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
