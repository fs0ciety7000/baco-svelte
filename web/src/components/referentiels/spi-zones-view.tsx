"use client";

import { Layers, MapPin, Search, TrainTrack } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ToggleChip } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/status-badge";
import { SPI_SOURCE_LABEL, type SpiSource } from "@/lib/network/spi";
import { filterZoneStations, NO_ZONE, pnMapHref, tallyZones } from "@/lib/network/spi-view";
import { cn, pl } from "@/lib/utils";
import type { SpiZone } from "@/server/data/network";

const PnMap = dynamic(() => import("@/components/ops/pn-map").then((m) => m.PnMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

const PAGE = 150;
const KIND: Record<string, string> = { gare: "Gare", pang: "PANG", etranger: "Étranger" };

export type ZoneStationView = {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  district: string;
  lines: string[];
  zone: string;
  source: string;
};

const linesText = (lines: string[]) => (lines.length ? `L.${lines.join(", L.")}` : "sans ligne");

/**
 * Réseau › Zones SPI (4 nov. 2026) : zones (district, gares et PANG, PN), carte des zones et gares par zone, en lecture
 * seule. Même carte que la Carte PN (`PnMap` : survol croisé, plein écran). Filtre de zone gardé dans l'URL (`?zone=`,
 * `history.replaceState`).
 */
export function SpiZonesView({
  zones,
  stations,
  pnCounts,
  adminLink,
}: {
  zones: SpiZone[];
  stations: ZoneStationView[];
  /** PN actifs par zone (`null` sans `carte_pn:read`). */
  pnCounts: Record<string, number> | null;
  adminLink?: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [zone, setZone] = useState(params.get("zone") ?? "");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [limit, setLimit] = useState(PAGE);

  const tally = useMemo(() => tallyZones(stations), [stations]);
  const zoneByCode = useMemo(() => new Map(zones.map((z) => [z.code, z])), [zones]);
  const shown = useMemo(
    () => filterZoneStations(stations, { q: deferredQ, zone }),
    [stations, deferredQ, zone],
  );
  const points = useMemo(
    () =>
      shown
        .filter((s) => s.lat && s.lon && s.kind !== "etranger")
        .map((s) => ({
          id: s.id,
          lat: s.lat,
          lon: s.lon,
          zone: s.zone,
          label: `${s.name}${s.zone ? ` · ${s.zone}` : " · sans zone"}`,
        })),
    [shown],
  );
  const fitKey = `${deferredQ}|${zone}`;
  const sel = stations.find((s) => s.id === selected) ?? null;
  const selZone = sel ? zoneByCode.get(sel.zone) : undefined;
  const noZone = tally.get("")?.stations ?? 0;

  const pickZone = (code: string) => {
    setZone(code);
    setLimit(PAGE);
    const sp = new URLSearchParams(window.location.search);
    if (code) sp.set("zone", code);
    else sp.delete("zone");
    window.history.replaceState(null, "", sp.size ? `${pathname}?${sp}` : pathname);
  };

  const legend = (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-small text-fg-muted" aria-label="Zones SPI">
      {zones.map((z) => (
        <li key={z.code} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2.5 rounded-[min(var(--r-control),2px)]"
            style={{ background: z.color }}
          />
          <span className="font-mono text-fg">{z.code}</span> {z.name}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-small text-fg-muted">
          <span className="font-medium text-fg tabular">{zones.length}</span>{" "}
          {pl(zones.length, "zone")} ·{" "}
          <span className="font-medium text-fg tabular">{stations.length - noZone}</span>{" "}
          {pl(stations.length - noZone, "gare ou PANG rattachée", "gares ou PANG rattachées")}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">{adminLink}</div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip pressed={showZones} onPressedChange={setShowZones}>
              <Layers aria-hidden className="size-3.5" /> Zones dessinées
            </ToggleChip>
            <p className="text-small text-fg-muted">Clique une gare pour voir sa zone.</p>
          </div>
          <div className="h-[60dvh] min-h-80 md:h-[32rem]">
            <PnMap
              points={points}
              selected={selected}
              hovered={hovered}
              onSelect={setSelected}
              onHover={setHovered}
              zones={zones}
              showZones={showZones}
              fitKey={fitKey}
              ariaLabel="Carte des zones SPI"
              testId="zones-map"
              overlay={
                <>
                  <p className="text-fg-muted">
                    <span className="font-medium text-fg tabular">{points.length}</span>{" "}
                    {pl(points.length, "point")}
                    {zone ? ` · zone ${zone === NO_ZONE ? "aucune" : zone}` : ""}
                  </p>
                  <div>
                    <ToggleChip pressed={showZones} onPressedChange={setShowZones}>
                      <Layers aria-hidden className="size-3.5" /> Zones dessinées
                    </ToggleChip>
                  </div>
                  {showZones ? legend : null}
                </>
              }
            />
          </div>
          {sel ? (
            <div
              className="flex flex-wrap items-center gap-3 rounded-box border border-accent bg-accent-soft p-3"
              data-testid="zones-station"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{sel.name}</span>
                <span className="text-small text-fg-muted">
                  {KIND[sel.kind] ?? "Point"} · {linesText(sel.lines)}
                  {sel.district ? ` · ${sel.district}` : ""}
                </span>
                <span className="text-small">
                  {selZone ? (
                    <>
                      Zone <span className="font-mono">{selZone.code}</span> · {selZone.name}
                    </>
                  ) : (
                    "Sans zone"
                  )}
                  {sel.source ? (
                    <span className="text-fg-muted">
                      {" "}
                      ({SPI_SOURCE_LABEL[sel.source as SpiSource] ?? sel.source})
                    </span>
                  ) : null}
                </span>
              </div>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/reseau/gares?q=${encodeURIComponent(sel.name)}`}>
                  <MapPin aria-hidden /> Voir la gare
                </Link>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Fermer
              </Button>
            </div>
          ) : null}
        </div>

        <section aria-label="Zones" className="flex min-w-0 flex-col gap-2">
          <h2 className="label-mono text-fg-muted">Zones · {zones.length}</h2>
          {zones.length === 0 ? (
            <EmptyState
              framed
              title="Aucune zone"
              description="Les zones SPI sont créées par l'administration."
            />
          ) : (
            <ul
              className="relative flex flex-col divide-y divide-border overflow-y-auto rounded-box border border-(--card-frame) bg-surface shadow-rest xl:max-h-[30rem]"
              data-testid="zones-list"
            >
              {zones.map((z) => {
                const t = tally.get(z.code);
                const on = zone === z.code;
                const pn = pnCounts?.[z.code] ?? 0;
                return (
                  <li
                    key={z.id}
                    className={cn("flex min-h-14 items-center gap-2 pr-2", on && "bg-accent-soft")}
                  >
                    <button
                      type="button"
                      className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 pl-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      onClick={() => pickZone(on ? "" : z.code)}
                      aria-pressed={on}
                      data-zone={z.code}
                    >
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-[min(var(--r-control),3px)]"
                        style={{ background: z.color }}
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">
                          <span className="font-mono font-semibold">{z.code}</span> {z.name}
                        </span>
                        <span className="text-small text-fg-muted">
                          {z.district || "Sans district"} · {t?.gares ?? 0}{" "}
                          {pl(t?.gares ?? 0, "gare")}
                          {t?.pang ? ` · ${t.pang} PANG` : ""}
                        </span>
                      </span>
                    </button>
                    {pnCounts ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link
                          href={pnMapHref(z.code)}
                          aria-label={`${pn} ${pl(pn, "passage à niveau", "passages à niveau")} en zone ${z.code} : ouvrir la Carte PN`}
                        >
                          <TrainTrack aria-hidden />
                          <span className="tabular">{pn}</span> PN
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-small text-fg-muted">
            {noZone} {pl(noZone, "point")} sans zone (gares étrangères, points sans position).
          </p>
        </section>
      </div>

      <section aria-label="Gares par zone" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <label className="relative min-w-0 md:w-72">
            <span className="sr-only">Rechercher une gare</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Gare, PANG, ligne…"
              className="pl-9"
              maxLength={60}
              data-testid="zones-search"
            />
          </label>
          <div className="w-full sm:w-64">
            <Select
              label="Zone"
              aria-label="Filtrer par zone"
              value={zone}
              onValueChange={pickZone}
              options={[
                { value: "", label: "Toutes zones" },
                { value: NO_ZONE, label: "Sans zone" },
                ...zones.map((z) => ({ value: z.code, label: `${z.code} · ${z.name}` })),
              ]}
            />
          </div>
          <p className="text-small text-fg-muted md:ml-auto" data-testid="zones-count">
            <span className="font-medium text-fg tabular">{shown.length}</span>{" "}
            {pl(shown.length, "point")}
          </p>
        </div>

        {shown.length === 0 ? (
          <EmptyState framed title="Aucun point" description="Aucune gare pour ces filtres." />
        ) : (
          <ul
            className="flex flex-col divide-y divide-border rounded-box border border-(--card-frame) bg-surface shadow-rest"
            data-testid="zones-stations"
          >
            {shown.slice(0, limit).map((s) => {
              const z = zoneByCode.get(s.zone);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(s.id)}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered((h) => (h === s.id ? null : h))}
                    aria-current={selected === s.id ? "true" : undefined}
                    className={cn(
                      "relative flex min-h-12 w-full cursor-pointer items-center gap-3 py-2 pr-3 pl-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                      selected === s.id
                        ? "bg-accent-soft"
                        : hovered === s.id
                          ? "bg-surface-2"
                          : "hover:bg-surface-2",
                    )}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-1 w-1 rounded-full"
                      style={{ background: z?.color ?? "var(--border-strong)" }}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        {s.name}
                        <span className="ml-2 text-small text-fg-muted">{KIND[s.kind] ?? ""}</span>
                      </span>
                      <span className="truncate font-mono text-small text-fg-muted">
                        {linesText(s.lines)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      {s.zone ? (
                        <span className="font-mono text-small">{s.zone}</span>
                      ) : (
                        <Badge tone="neutral">Sans zone</Badge>
                      )}
                      {s.source ? (
                        <span className="hidden text-small text-fg-muted sm:inline">
                          {SPI_SOURCE_LABEL[s.source as SpiSource] ?? s.source}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length > limit ? (
              <li className="p-3">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setLimit((l) => l + PAGE)}
                >
                  Afficher {Math.min(PAGE, shown.length - limit)} de plus ({shown.length - limit}{" "}
                  restants)
                </Button>
              </li>
            ) : null}
          </ul>
        )}
      </section>
    </div>
  );
}
