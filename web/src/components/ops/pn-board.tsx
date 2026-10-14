"use client";

import {
  Copy,
  Eye,
  ChevronDown,
  Layers,
  SlidersHorizontal,
  MapPin,
  NotebookPen,
  Pencil,
  RotateCcw,
  Route,
  Search,
  TrainTrack,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { saveCrossing } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DistrictPicker } from "@/components/ui/district-picker";
import { Field } from "@/components/ui/field";
import { Segmented, ToggleChip } from "@/components/ui/form-kit";
import { Input, Textarea } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select as CustomSelect } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { DISTRICT_CODE_OPTIONS, type DistrictOption } from "@/lib/district-param";
import { bkLabel, bkNote, compareByNumber, filterCrossings } from "@/lib/network/pn";
import { zonesOfDistricts } from "@/lib/network/spi";
import { safeCall } from "@/lib/orders/safe-call";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn, pl } from "@/lib/utils";
import type { SpiZone } from "@/server/data/network";
import type { Depot, LevelCrossing } from "@/server/data/ops";

export { matchCrossing } from "@/lib/network/pn";

const PnMap = dynamic(() => import("./pn-map").then((m) => m.PnMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

/** Les 5 districts SNCB (les zones SPI couvrent tout le réseau). */
export const NETWORK_DISTRICTS: DistrictOption[] = [
  ...DISTRICT_CODE_OPTIONS,
  { value: "DNO", label: "DNO", hint: "Nord-Ouest" },
  { value: "DNE", label: "DNE", hint: "Nord-Est" },
];
const DISTRICT_NAME: Record<string, string> = Object.fromEntries(
  NETWORK_DISTRICTS.map((d) => [d.value, d.hint ?? d.value]),
);

const PAGE = 200;
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);

const SOURCE_LABEL: Record<string, string> = {
  baco: "Repris de BACO",
  csm: "Saisi dans CSM",
  infrabel: "Données ouvertes Infrabel",
};
const ZONE_SOURCE_LABEL: Record<string, string> = {
  baco: "saisie dans BACO",
  auto: "calculée (gare la plus proche de la ligne)",
  manuel: "choisie par l'équipe",
};

/**
 * Réseau › Carte PN (refonte du 15 oct. 2026) : filtres (district, zone SPI, ligne, recherche), liste et carte
 * synchronisées (survol, sélection), couche « Zones SPI », panneau de fiche. Desktop : liste à gauche, carte à droite ;
 * mobile : onglets Liste / Carte pensés pour le pouce. L'URL garde les filtres (`history.replaceState`, jamais de rendu
 * serveur : voir CLAUDE.md §7).
 */
export function PnBoard({
  crossings,
  zones,
  depots,
  canEdit,
  canReadLog,
}: {
  crossings: LevelCrossing[];
  zones: SpiZone[];
  depots: Depot[];
  canEdit: boolean;
  canReadLog: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferredQ = useDeferredValue(q);
  const [districts, setDistricts] = useState<string[]>(list(params.get("district")));
  const [zoneSel, setZoneSel] = useState<string[]>(list(params.get("zone")));
  const [line, setLine] = useState(params.get("ligne") ?? "");
  const [showZones, setShowZones] = useState(params.get("zones") === "1");
  const [view, setView] = useState<"liste" | "carte">(
    params.get("vue") === "carte" ? "carte" : "liste",
  );
  const [selected, setSelected] = useState<string | null>(params.get("pn"));
  const [hovered, setHovered] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [moreOpen, setMoreOpen] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);

  const zoneByCode = useMemo(() => new Map(zones.map((z) => [z.code, z])), [zones]);
  const zoneOptions = useMemo(() => {
    const allowed = districts.length ? zonesOfDistricts(districts, zones) : null;
    return zones
      .filter((z) => !allowed || allowed.has(z.code))
      .map((z) => ({ value: z.code, label: z.code, hint: `${z.name} · ${z.district}` }));
  }, [zones, districts]);
  const lineOptions = useMemo(() => {
    const ls = [...new Set(crossings.map((c) => c.line))].sort(
      (a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10) || a.localeCompare(b),
    );
    return [{ value: "", label: "Toutes les lignes" }, ...ls.map((l) => ({ value: l, label: l }))];
  }, [crossings]);

  // Zones retenues : zones cochées (dans les districts choisis), sinon toutes les zones des districts choisis.
  const zoneFilter = useMemo(() => {
    const inDistricts = districts.length ? zonesOfDistricts(districts, zones) : null;
    const picked = zoneSel.filter((z) => !inDistricts || inDistricts.has(z));
    if (picked.length) return new Set(picked);
    return inDistricts;
  }, [districts, zoneSel, zones]);

  const shown = useMemo(
    () =>
      filterCrossings(crossings, {
        q: deferredQ,
        zones: zoneFilter,
        lines: line ? new Set([line]) : null,
      }).sort(compareByNumber),
    [crossings, deferredQ, zoneFilter, line],
  );
  const fitKey = `${deferredQ}|${[...(zoneFilter ?? [])].join(",")}|${line}`;
  useEffect(() => setLimit(PAGE), [fitKey]);
  const points = useMemo(
    () =>
      shown.map((c) => ({
        id: c.id,
        lat: c.lat,
        lon: c.lon,
        zone: c.zone,
        label: `PN ${c.number} · ${c.line}${c.commune ? ` · ${c.commune.replace(/^\d{4}\s+/, "")}` : ""}`,
      })),
    [shown],
  );
  const sel = crossings.find((c) => c.id === selected) ?? null;
  const selZone = sel ? zoneByCode.get(sel.zone) : undefined;
  const depot = sel ? depots.find((d) => d.code === sel.zone && d.lat) : undefined;
  const active =
    (q ? 1 : 0) + (districts.length ? 1 : 0) + (zoneSel.length ? 1 : 0) + (line ? 1 : 0);

  const syncUrl = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    window.history.replaceState(null, "", sp.size ? `${pathname}?${sp}` : pathname);
  };
  const select = (id: string | null) => {
    setSelected(id);
    setEditing(false);
    syncUrl({ pn: id });
  };
  const reset = () => {
    setQ("");
    setDistricts([]);
    setZoneSel([]);
    setLine("");
    syncUrl({ q: null, district: null, zone: null, ligne: null });
  };

  // La ligne survolée sur la carte reste visible dans la liste.
  useEffect(() => {
    if (!hovered || !listRef.current) return;
    listRef.current
      .querySelector(`[data-pn="${hovered}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hovered]);

  const filters = (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
      <label className="relative min-w-0 lg:w-80">
        <span className="sr-only">Rechercher un PN</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => syncUrl({ q: q || null })}
          placeholder="N°, L.94, PN 12 L94, rue, commune…"
          className="pl-9"
          data-testid="pn-search"
          maxLength={60}
          aria-label="Rechercher un PN"
        />
      </label>
      {!desktop ? (
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="pn-filtres"
          onClick={() => setMoreOpen((o) => !o)}
          className="inline-flex h-control items-center gap-2 rounded-control border border-border-strong px-3 text-body text-fg"
          data-testid="pn-filters-toggle"
        >
          <SlidersHorizontal aria-hidden className="size-4" />
          Filtres et couches
          {active ? <span className="text-small text-fg-muted">({active})</span> : null}
          <ChevronDown
            aria-hidden
            className={cn("ml-auto size-4 transition-transform", moreOpen && "rotate-180")}
          />
        </button>
      ) : null}
      <div
        id="pn-filtres"
        className={cn("flex min-w-0 flex-col gap-2 lg:contents", !desktop && !moreOpen && "hidden")}
      >
        <DistrictPicker
          options={NETWORK_DISTRICTS}
          values={districts}
          onValuesChange={(v) => {
            setDistricts(v);
            syncUrl({ district: v.join(",") || null });
          }}
          showHint="never"
          data-testid="pn-district"
        />
        <div className="grid min-w-0 grid-cols-2 gap-2 lg:flex">
          <div className="min-w-0 lg:w-44">
            <MultiSelect
              label="Zone SPI"
              aria-label="Zone SPI"
              options={zoneOptions}
              values={zoneSel}
              onValuesChange={(v) => {
                setZoneSel(v);
                syncUrl({ zone: v.join(",") || null });
              }}
              allLabel="Toutes zones"
              noun="zone"
              searchable
              data-testid="pn-zone"
            />
          </div>
          <div className="min-w-0 lg:w-44">
            <Combobox
              label="Ligne"
              aria-label="Ligne"
              options={lineOptions}
              value={line}
              onValueChange={(v) => {
                setLine(v);
                syncUrl({ ligne: v || null });
              }}
              placeholder="Toutes les lignes"
              openOnFocus
              data-testid="pn-line"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <ToggleChip
            pressed={showZones}
            onPressedChange={(v) => {
              setShowZones(v);
              syncUrl({ zones: v ? "1" : null });
            }}
          >
            <Layers aria-hidden className="size-3.5" /> Zones SPI
          </ToggleChip>
          {active ? (
            <Button type="button" variant="ghost" size="sm" onClick={reset} data-testid="pn-reset">
              <RotateCcw aria-hidden /> Réinitialiser
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const rows = (
    <ul
      ref={listRef}
      className="flex flex-col divide-y divide-border"
      data-testid="pn-list"
      aria-label="Passages à niveau"
    >
      {shown.slice(0, limit).map((c) => {
        const z = zoneByCode.get(c.zone);
        const on = c.id === selected;
        return (
          <li key={c.id} data-pn={c.id}>
            <button
              type="button"
              aria-label={`Ouvrir le PN ${c.number} de la ${c.line}`}
              aria-current={on ? "true" : undefined}
              onClick={() => select(c.id)}
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered((h) => (h === c.id ? null : h))}
              onFocus={() => setHovered(c.id)}
              className={cn(
                "relative flex min-h-14 w-full cursor-pointer items-center gap-3 py-2 pr-3 pl-4 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                on ? "bg-accent-soft" : hovered === c.id ? "bg-surface-2" : "hover:bg-surface-2",
              )}
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-1 w-1 rounded-full"
                style={{ background: z?.color ?? "var(--border-strong)" }}
              />
              <span className="flex w-20 shrink-0 flex-col">
                <span className="font-mono text-body font-semibold whitespace-nowrap tabular">
                  PN {c.number}
                </span>
                <span className="font-mono text-small text-fg-muted">{c.line}</span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  {c.address || c.commune || (
                    <span className="text-fg-muted">Adresse non renseignée</span>
                  )}
                </span>
                {c.address && c.commune ? (
                  <span className="truncate text-small text-fg-muted">{c.commune}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 flex-col items-end">
                <span
                  className={cn(
                    "font-mono text-small tabular",
                    c.bkEstimated ? "text-fg-muted" : "text-fg",
                  )}
                >
                  {c.bk ? `BK ${bkLabel(c.bk, c.bkEstimated)}` : ""}
                </span>
                {c.zone ? (
                  <span className="font-mono text-small text-fg-muted">{c.zone}</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
      {shown.length > limit ? (
        <li className="p-3">
          <Button
            type="button"
            variant="ghost"
            className="w-full border border-border"
            onClick={() => setLimit((l) => l + PAGE)}
          >
            Afficher {Math.min(PAGE, shown.length - limit)} de plus ({shown.length - limit}{" "}
            restants)
          </Button>
        </li>
      ) : null}
    </ul>
  );

  const legend =
    showZones && zones.length ? (
      <ul
        className="flex flex-wrap gap-x-3 gap-y-1 text-small text-fg-muted"
        aria-label="Zones SPI"
        data-testid="pn-zone-legend"
      >
        {(zoneFilter ? zones.filter((z) => zoneFilter.has(z.code)) : zones).map((z) => (
          <li key={z.code} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm" style={{ background: z.color }} />
            <span className="font-mono text-fg">{z.code}</span> {z.name}
          </li>
        ))}
      </ul>
    ) : null;

  const map = (
    <PnMap
      points={points}
      selected={selected}
      hovered={hovered}
      onSelect={select}
      onHover={setHovered}
      zones={zones}
      showZones={showZones}
      fitKey={fitKey}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {filters}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-small text-fg-muted" data-testid="pn-count" aria-live="polite">
          <span className="font-mono text-fg tabular">{shown.length}</span>{" "}
          {pl(shown.length, "passage à niveau", "passages à niveau")}
          {crossings.length !== shown.length ? ` sur ${crossings.length}` : ""}
        </p>
        {!desktop ? (
          <div className="ml-auto">
            <Segmented
              label="Affichage"
              value={view}
              onChange={(v) => {
                setView(v);
                syncUrl({ vue: v === "carte" ? "carte" : null });
              }}
              options={[
                { value: "liste", label: "Liste" },
                { value: "carte", label: "Carte" },
              ]}
            />
          </div>
        ) : null}
      </div>
      {legend ? (
        desktop ? (
          legend
        ) : (
          <details className="text-small">
            <summary className="cursor-pointer text-fg-muted">Légende des zones SPI</summary>
            <div className="mt-2">{legend}</div>
          </details>
        )
      ) : null}

      {crossings.length === 0 ? (
        <EmptyState
          title="Aucun passage à niveau"
          description="Les PN Infrabel sont importés chaque matin avec le référentiel des trains."
        />
      ) : desktop ? (
        <div className="grid h-[calc(100dvh-16rem)] min-h-[32rem] grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] gap-3">
          <div className="min-h-0 overflow-y-auto rounded-box border border-border bg-surface">
            {shown.length ? (
              rows
            ) : (
              <EmptyState
                title="Aucun PN"
                description="Aucun passage à niveau pour ces filtres."
                className="m-3"
              />
            )}
          </div>
          <div className="min-h-0">{map}</div>
        </div>
      ) : view === "carte" ? (
        <div className="h-[calc(100dvh-17rem)] min-h-80">{map}</div>
      ) : shown.length ? (
        <div className="rounded-box border border-border bg-surface">{rows}</div>
      ) : (
        <EmptyState title="Aucun PN" description="Aucun passage à niveau pour ces filtres." />
      )}

      <Sheet
        open={!!sel}
        onOpenChange={(o) => (o ? null : select(null))}
        eyebrow={sel ? `Passage à niveau · ${sel.line}` : undefined}
        title={sel ? `PN ${sel.number}` : "PN"}
        description={sel ? sel.address || sel.commune || "Adresse non renseignée" : undefined}
        footer={
          sel && !editing ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {sel.lat ? (
                <>
                  <Button asChild size="sm" variant="primary">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lon}${depot && desktop ? `&origin=${depot.lat},${depot.lon}` : ""}&travelmode=driving`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="pn-route"
                    >
                      <Route aria-hidden /> Itinéraire
                    </a>
                  </Button>
                  <Button asChild size="sm">
                    <a
                      href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sel.lat},${sel.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye aria-hidden /> Street View
                    </a>
                  </Button>
                </>
              ) : null}
              {!desktop && view !== "carte" && sel.lat ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="border border-border"
                  onClick={() => {
                    setView("carte");
                    syncUrl({ vue: "carte" });
                  }}
                >
                  <MapPin aria-hidden /> Sur la carte
                </Button>
              ) : null}
              {canReadLog ? (
                <Button asChild size="sm" variant="ghost" className="border border-border">
                  <Link href={`/operations/journal?pn=${sel.id}`}>
                    <NotebookPen aria-hidden /> Entrées du Journal
                  </Link>
                </Button>
              ) : null}
              {canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="border border-border"
                  onClick={() => setEditing(true)}
                  data-testid="pn-edit"
                >
                  <Pencil aria-hidden /> Modifier
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {sel ? (
          editing ? (
            <CrossingForm crossing={sel} zones={zones} onDone={() => setEditing(false)} />
          ) : (
            <div className="flex flex-col gap-4" data-testid="pn-panel">
              <div className="flex flex-wrap gap-2">
                {selZone ? (
                  <span className="inline-flex items-center gap-1.5 rounded-control border border-border px-2 py-0.5 text-small">
                    <span
                      aria-hidden
                      className="size-2.5 rounded-sm"
                      style={{ background: selZone.color }}
                    />
                    <span className="font-mono">{selZone.code}</span> {selZone.name}
                  </span>
                ) : null}
                {selZone?.district ? (
                  <Badge tone="info">
                    {selZone.district} · {DISTRICT_NAME[selZone.district] ?? ""}
                  </Badge>
                ) : null}
                {sel.source ? (
                  <Badge tone="neutral">{SOURCE_LABEL[sel.source] ?? sel.source}</Badge>
                ) : null}
              </div>
              <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-body">
                <dt className="text-fg-muted">Ligne</dt>
                <dd>
                  <Link
                    href={`/reseau/lignes?ligne=${encodeURIComponent(sel.line.replace(/^L\./, ""))}`}
                    className="link inline-flex items-center gap-1 font-mono"
                  >
                    <TrainTrack aria-hidden className="size-4" /> {sel.line}
                  </Link>
                </dd>
                <dt className="text-fg-muted">BK</dt>
                <dd className="font-mono tabular">
                  {bkLabel(sel.bk, sel.bkEstimated)}
                  {sel.bk && bkNote(sel.bkSource, sel.bkEstimated) ? (
                    <span className="ml-2 font-sans text-small text-fg-muted">
                      {bkNote(sel.bkSource, sel.bkEstimated)}
                    </span>
                  ) : null}
                </dd>
                <dt className="text-fg-muted">Zone SPI</dt>
                <dd>
                  {selZone ? `${selZone.code} · ${selZone.name}` : sel.zone || "—"}
                  {sel.zoneSource && ZONE_SOURCE_LABEL[sel.zoneSource] ? (
                    <span className="block text-small text-fg-muted">
                      {ZONE_SOURCE_LABEL[sel.zoneSource]}
                    </span>
                  ) : null}
                  {depot ? (
                    <span className="block text-small text-fg-muted">
                      Itinéraire depuis le dépôt de {depot.label}
                    </span>
                  ) : null}
                </dd>
                {sel.address ? (
                  <>
                    <dt className="text-fg-muted">Adresse</dt>
                    <dd>{sel.address}</dd>
                  </>
                ) : null}
                {sel.commune ? (
                  <>
                    <dt className="text-fg-muted">Commune</dt>
                    <dd>{sel.commune}</dd>
                  </>
                ) : null}
                {sel.signal ? (
                  <>
                    <dt className="text-fg-muted">Signalisation</dt>
                    <dd>{sel.signal}</dd>
                  </>
                ) : null}
                <dt className="text-fg-muted">Coordonnées</dt>
                <dd className="flex items-center gap-1 font-mono tabular">
                  {sel.lat ? `${sel.lat.toFixed(5)}, ${sel.lon.toFixed(5)}` : "—"}
                  {sel.lat ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Copier les coordonnées"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(`${sel.lat},${sel.lon}`)
                          .then(() => toast.success("Coordonnées copiées."));
                      }}
                    >
                      <Copy aria-hidden />
                    </Button>
                  ) : null}
                </dd>
                {sel.infrabelId ? (
                  <>
                    <dt className="text-fg-muted">Réf. Infrabel</dt>
                    <dd className="font-mono">{sel.infrabelId}</dd>
                  </>
                ) : null}
                {sel.notes ? (
                  <>
                    <dt className="text-fg-muted">Remarques</dt>
                    <dd className="whitespace-pre-wrap">{sel.notes}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          )
        ) : null}
      </Sheet>
    </div>
  );
}

function CrossingForm({
  crossing,
  zones,
  onDone,
}: {
  crossing: LevelCrossing;
  zones: SpiZone[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState({
    line: crossing.line,
    number: crossing.number,
    bk: crossing.bk ? String(crossing.bk) : "",
    address: crossing.address,
    lat: crossing.lat ? String(crossing.lat) : "",
    lon: crossing.lon ? String(crossing.lon) : "",
    zone: crossing.zone,
    notes: crossing.notes,
  });
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) =>
    setD({ ...d, [k]: e.target.value });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(
            saveCrossing({
              id: crossing.id,
              expectedUpdated: crossing.updated,
              data: { ...d, bk: d.bk || 0, lat: d.lat || 0, lon: d.lon || 0 },
            }),
          );
          if (!res.ok) return void toast.error(res.error);
          toast.success("PN enregistré.");
          router.refresh();
          onDone();
        });
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ligne" required>
          <Input value={d.line} onChange={set("line")} required />
        </Field>
        <Field label="N°" required>
          <Input value={d.number} onChange={set("number")} required />
        </Field>
        <Field
          label="BK (km)"
          hint={crossing.bkEstimated ? "Estimée : corrige-la si tu la connais." : undefined}
        >
          <Input value={d.bk} onChange={set("bk")} inputMode="decimal" />
        </Field>
        <Field label="Zone SPI">
          <CustomSelect
            value={d.zone}
            onValueChange={(zone) => setD({ ...d, zone })}
            options={[
              { value: "", label: "—" },
              ...zones.map((z) => ({ value: z.code, label: `${z.code} · ${z.name}` })),
            ]}
          />
        </Field>
      </div>
      <Field label="Adresse">
        <Input value={d.address} onChange={set("address")} maxLength={500} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Latitude">
          <Input value={d.lat} onChange={set("lat")} inputMode="decimal" />
        </Field>
        <Field label="Longitude">
          <Input value={d.lon} onChange={set("lon")} inputMode="decimal" />
        </Field>
      </div>
      <Field label="Remarques">
        <Textarea value={d.notes} onChange={set("notes")} maxLength={1000} rows={3} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" aria-busy={pending || undefined} disabled={pending}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
