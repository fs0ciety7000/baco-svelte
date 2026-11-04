import { ArrowRight, BookOpen, Bus } from "lucide-react";
import Link from "next/link";

import type { Incident } from "@/lib/ops/incident";
import { pl } from "@/lib/utils";

/**
 * Bandeau « Incident en cours » de l'accueil Temps réel (identité du 4 nov. 2026, maquettes csm-brand v5) : carte encre
 * dans les deux schémas (Jour et Nuit), schéma de la voie coupée que l'arc des bus de remplacement contourne. Mouvement en
 * CSS (`.incident-*` dans globals.css) : l'arc se trace, puis des bus le parcourent ; tout est figé en mouvement réduit.
 * Rendu seulement quand `liveIncident()` renvoie un incident (bon bus du jour en cours ou urgence récente).
 */
export function IncidentBanner({ incident }: { incident: Incident }) {
  const main = incident.main;
  const stats: { value: number; label: string }[] = [];
  if (main)
    stats.push({
      value: incident.activeBuses,
      label: pl(incident.activeBuses, "bus en route", "bus en route"),
    });
  if (incident.passengers > 0)
    stats.push({
      value: incident.passengers,
      label: pl(incident.passengers, "voyageur reporté", "voyageurs reportés"),
    });
  if (incident.urgent > 0)
    stats.push({
      value: incident.urgent,
      label: pl(incident.urgent, "urgence au Journal", "urgences au Journal"),
    });
  if (incident.disturbances > 0)
    stats.push({
      value: incident.disturbances,
      label: pl(incident.disturbances, "perturbation iRail", "perturbations iRail"),
    });

  return (
    <section
      aria-labelledby="incident-title"
      data-testid="incident-banner"
      className="incident-hero grid gap-5 rounded-[calc(var(--r-box)+6px)] p-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:p-6"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="incident-tag inline-flex w-fit items-center gap-2 rounded-pill px-2.5 py-1 text-small font-semibold">
          <span
            aria-hidden
            className="incident-live animate-pulse-dot relative size-2 rounded-full"
          />
          Incident en cours{incident.since ? ` · depuis ${incident.since}` : ""}
        </p>
        <div className="min-w-0">
          <h2 id="incident-title" className="display text-h3 leading-tight text-balance md:text-h2">
            {incident.title}
          </h2>
          {incident.detail ? (
            <p className="incident-muted mt-1 line-clamp-2 text-body">{incident.detail}</p>
          ) : null}
        </div>
        {stats.length ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <dd className="figures text-h3 leading-tight">{s.value}</dd>
                <dt className="incident-muted order-last text-small">{s.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href={incident.href} className="incident-btn incident-btn-primary">
            {main ? <Bus aria-hidden /> : <BookOpen aria-hidden />}
            {main ? "Suivre les bus" : "Voir les urgences"}
          </Link>
          <Link href="/operations/journal" className="incident-btn">
            Ouvrir le Journal <ArrowRight aria-hidden />
          </Link>
        </div>
      </div>
      {main ? (
        <TrackDiagram origin={main.origin} destination={main.destination} buses={main.buses} />
      ) : null}
    </section>
  );
}

const SLEEPERS = Array.from({ length: 24 }, (_, i) => 28 + i * 16).filter(
  (x) => x < 186 || x > 224,
);
const BYPASS = "M60 112 C 110 20, 300 20, 360 112";

function TrackDiagram({
  origin,
  destination,
  buses,
}: {
  origin: string;
  destination: string;
  buses: number;
}) {
  const label = `Schéma : la voie est coupée entre ${origin} et ${destination}, ${buses} ${pl(buses, "bus la contourne", "bus la contournent")}.`;
  return (
    <svg
      viewBox="0 0 420 170"
      role="img"
      aria-label={label}
      className="incident-diagram h-auto w-full"
    >
      <line className="incident-rail" x1="20" y1="118" x2="400" y2="118" />
      <line className="incident-rail" x1="20" y1="128" x2="400" y2="128" />
      {SLEEPERS.map((x) => (
        <line key={x} className="incident-sleeper" x1={x} y1="113" x2={x} y2="133" />
      ))}
      <line className="incident-cut" x1="196" y1="106" x2="214" y2="140" />
      <line className="incident-cut" x1="214" y1="106" x2="196" y2="140" />
      <path className="incident-bypass" d={BYPASS} pathLength={1} />
      {buses > 0 ? (
        <rect className="incident-bus" width="22" height="12" rx="4" x="-11" y="-6" />
      ) : null}
      {buses > 1 ? (
        <rect
          className="incident-bus incident-bus-2"
          width="22"
          height="12"
          rx="4"
          x="-11"
          y="-6"
        />
      ) : null}
      <circle className="incident-station" cx="60" cy="123" r="8" />
      <circle className="incident-station" cx="360" cy="123" r="8" />
      <text x="20" y="158" className="incident-label">
        {origin.length > 22 ? `${origin.slice(0, 21)}…` : origin}
      </text>
      <text x="400" y="158" textAnchor="end" className="incident-label">
        {destination.length > 22 ? `${destination.slice(0, 21)}…` : destination}
      </text>
    </svg>
  );
}
