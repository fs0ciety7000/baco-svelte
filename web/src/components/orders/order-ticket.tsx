import { FileText } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const PERFORATION = {
  background:
    "radial-gradient(circle at 0 50%, var(--bg) 6px, transparent 6.5px) left / 14px 14px no-repeat, radial-gradient(circle at 100% 50%, var(--bg) 6px, transparent 6.5px) right / 14px 14px no-repeat",
};

/**
 * Aperçu d'un bon en forme de billet (v4 lot 4, 15 oct. 2026) : en-tête (trajet en grand, date et départ), perforation,
 * détails, itinéraire en pointillés de gares (extrémités pleines), lien vers le PDF. `compact` : en-tête + PDF seulement
 * (tête du formulaire en mobile). Les encoches de la perforation sont peintes avec le fond de la page (`--bg`).
 */
export function OrderTicket({
  eyebrow,
  route,
  when,
  rows = [],
  stops = [],
  pdfHref,
  footer,
  compact = false,
  className,
  "data-testid": testId,
}: {
  eyebrow: string;
  route: ReactNode;
  when?: string;
  rows?: { label: string; value: ReactNode; tone?: "danger"; testId?: string }[];
  /** Gares de l'itinéraire, extrémités comprises (au moins deux pour être affiché). */
  stops?: string[];
  pdfHref: string;
  footer?: ReactNode;
  compact?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div
      data-slot="order-ticket"
      data-testid={testId}
      className={cn("overflow-hidden rounded-box bg-surface shadow-float", className)}
    >
      <div className={cn("flex flex-col gap-1 px-4 pt-4", compact ? "pb-2.5" : "pb-3")}>
        <span className="text-small text-fg-muted">{eyebrow}</span>
        <span className="display text-h3 leading-tight font-semibold tracking-[-0.02em] text-fg break-words">
          {route}
        </span>
        {when ? <span className="text-small text-fg-muted tabular">{when}</span> : null}
      </div>
      <div
        aria-hidden
        data-slot="perforation"
        className="relative h-3.5 after:absolute after:inset-x-3.5 after:top-1/2 after:border-t-[1.5px] after:border-dashed after:border-border"
        style={PERFORATION}
      />
      <div className={cn("flex flex-col gap-3 px-4", compact ? "pt-1 pb-2" : "pt-1.5 pb-4")}>
        {!compact && rows.length ? (
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-small">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-fg-muted">{r.label}</dt>
                <dd
                  className={cn(
                    "min-w-0 break-words",
                    r.tone === "danger" ? "text-danger" : "text-fg",
                  )}
                  data-testid={r.testId}
                >
                  {r.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {!compact && stops.length >= 2 ? (
          <ol
            aria-label="Itinéraire"
            className="relative flex flex-col pl-4 text-small text-fg-muted before:absolute before:top-[7px] before:bottom-[7px] before:left-1 before:w-0.5 before:rounded-pill before:bg-border-strong"
          >
            {stops.map((st, i) => {
              const end = i === 0 || i === stops.length - 1;
              return (
                <li
                  key={`${st}-${i}`}
                  className={cn(
                    "relative leading-5 before:absolute before:top-[7px] before:-left-[15px] before:size-1.5 before:rounded-pill",
                    end
                      ? "font-medium text-fg before:bg-fg before:shadow-[0_0_0_2px_var(--fg)]"
                      : "before:bg-surface before:shadow-[0_0_0_2px_var(--border-strong)]",
                  )}
                >
                  {st}
                </li>
              );
            })}
          </ol>
        ) : null}
        {pdfHref ? (
          <a
            className="inline-flex min-h-11 items-center gap-2 self-start text-body link md:min-h-9"
            href={pdfHref}
            target="_blank"
            rel="noopener"
          >
            <FileText aria-hidden className="size-4" /> Ouvrir le PDF du bon
          </a>
        ) : (
          <p className="text-hint text-fg-muted">
            Le PDF sera disponible après le premier enregistrement.
          </p>
        )}
        {!compact ? footer : null}
      </div>
    </div>
  );
}
