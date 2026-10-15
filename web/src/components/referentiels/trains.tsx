import Link from "next/link";

import { Badge, type Tone } from "@/components/ui/status-badge";
import { lineLabel } from "@/lib/lines";
import { daysLabel, seriesLabel, type ServiceStop } from "@/lib/timetable/model";
import { cn } from "@/lib/utils";

// Briques d'affichage du référentiel des trains (Ressources › Trains), rendues côté serveur.

const TYPE_TONE: Record<string, Tone> = { IC: "info", L: "neutral", S: "progress", P: "warn" };

export const trainsHref = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return `/reseau/horaires${s ? `?${s}` : ""}`;
};

export function TypeBadge({ type }: { type: string }) {
  return <Badge tone={TYPE_TONE[type] ?? "neutral"}>{type || "?"}</Badge>;
}

/** Relation cliquable (fiche de la relation). */
export function RelationLink({ relation, rkey }: { relation: string; rkey: string }) {
  return (
    <Link href={trainsHref({ rel: rkey })} className="link font-mono font-medium">
      {relation}
    </Link>
  );
}

export function TrainLink({ number }: { number: number }) {
  return (
    <Link href={trainsHref({ train: number })} className="link font-mono tabular">
      {number}
    </Link>
  );
}

/** Suite des lignes empruntées : L.97 › L.96 › L.0… (chaque ligne ouvre sa vue). */
export function LinesChain({ lines, className }: { lines: string[]; className?: string }) {
  if (!lines.length) return <span className="text-fg-muted">—</span>;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1 gap-y-0.5", className)}>
      {lines.map((l, i) => (
        <span key={`${l}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 ? (
            <span aria-hidden className="text-fg-subtle">
              ›
            </span>
          ) : null}
          <Link href={trainsHref({ vue: "ligne", ligne: l })} className="link font-mono text-small">
            {lineLabel(l)}
          </Link>
        </span>
      ))}
    </span>
  );
}

export function SeriesText({ series }: { series: string[] }) {
  if (!series.length) return <span className="text-fg-muted">—</span>;
  return (
    <span className="font-mono text-small tabular" title={series.join(", ")}>
      {series.map((s) => seriesLabel(s)).join(" · ")}
    </span>
  );
}

export function DaysText({ days }: { days: number }) {
  return <span className="text-small text-fg-muted">{daysLabel(days)}</span>;
}

/**
 * Arrêts d'un train : heure, gare (lien vers la vue « par gare »), ligne. Les passages sans arrêt sont repliés (une
 * ligne « passe par … ») sauf `showPasses`.
 */
export function StopList({
  stops,
  showPasses = false,
}: {
  stops: ServiceStop[];
  showPasses?: boolean;
}) {
  const rows: ({ kind: "stop"; s: ServiceStop } | { kind: "pass"; names: ServiceStop[] })[] = [];
  for (const s of stops) {
    if (s.p && !showPasses) {
      const last = rows[rows.length - 1];
      if (last?.kind === "pass") last.names.push(s);
      else rows.push({ kind: "pass", names: [s] });
    } else rows.push({ kind: "stop", s });
  }
  return (
    <ol className="flex flex-col" data-testid="stop-list">
      {rows.map((r, i) =>
        r.kind === "pass" ? (
          <li
            key={`p${i}`}
            className="border-l-2 border-dashed border-border py-1 pl-4 text-small text-fg-muted"
          >
            Passe sans arrêt par {r.names.map((n) => n.n).join(", ")}
          </li>
        ) : (
          <li
            key={`s${i}`}
            className={cn(
              "grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-baseline gap-2 border-l-2 py-1 pl-3",
              r.s.p ? "border-dashed border-border text-fg-muted" : "border-fg",
            )}
          >
            <span className="font-mono text-small tabular">{r.s.d || r.s.a || ""}</span>
            <Link href={trainsHref({ vue: "gare", gare: r.s.n })} className="link min-w-0 truncate">
              {r.s.n}
              {r.s.p ? <span className="text-small"> (passage)</span> : null}
            </Link>
            <span className="font-mono text-small text-fg-muted">
              {r.s.l ? lineLabel(r.s.l) : ""}
            </span>
          </li>
        ),
      )}
    </ol>
  );
}
