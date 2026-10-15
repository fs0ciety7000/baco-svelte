"use client";

import { Layers, Pencil, RefreshCw, Search, TrainTrack } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  assignStationZones,
  recomputeNetwork,
  saveSpiZone,
} from "@/app/(app)/admin/referentiels/zones-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ToggleChip } from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Select as CustomSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { SPI_SOURCE_LABEL, type SpiSource } from "@/lib/network/spi";
import { safeCall } from "@/lib/orders/safe-call";
import { foldStation } from "@/lib/stations/search";
import { cn, pl } from "@/lib/utils";
import type { SpiZone, ZoneStationRow } from "@/server/data/network";

const PnMap = dynamic(() => import("@/components/ops/pn-map").then((m) => m.PnMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

const PAGE = 150;
const KIND: Record<string, string> = { gare: "Gare", pang: "PANG", etranger: "Étranger" };

/**
 * Administration › Référentiels › Zones SPI : carte des zones (cellules calculées à partir des gares), fiches des zones,
 * rattachement des gares une par une ou en masse (« Automatique » rend la main au calcul), recalcul et import des PN.
 */
export function SpiZonesAdmin({
  zones,
  stations,
  summary,
}: {
  zones: SpiZone[];
  stations: ZoneStationRow[];
  summary: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [zoneF, setZoneF] = useState("");
  const [sourceF, setSourceF] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [editing, setEditing] = useState<SpiZone | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stations) m.set(s.zone || "", (m.get(s.zone || "") ?? 0) + 1);
    return m;
  }, [stations]);
  const shown = useMemo(() => {
    const f = foldStation(q);
    return stations.filter(
      (s) =>
        (!zoneF || (zoneF === "aucune" ? !s.zone : s.zone === zoneF)) &&
        (!sourceF || (sourceF === "aucune" ? !s.source : s.source === sourceF)) &&
        (!f || foldStation(`${s.name} ${s.lines.join(" ")}`).includes(f)),
    );
  }, [stations, q, zoneF, sourceF]);
  const points = useMemo(
    () =>
      shown
        .filter((s) => s.lat && s.kind !== "etranger")
        .map((s) => ({
          id: s.id,
          lat: s.lat,
          lon: s.lon,
          zone: s.zone,
          label: `${s.name}${s.zone ? ` · ${s.zone}` : " · sans zone"}`,
        })),
    [shown],
  );
  const fitKey = `${q}|${zoneF}|${sourceF}`;
  const sel = stations.find((s) => s.id === selected) ?? null;
  const zoneOptions = [
    { value: "auto", label: "Automatique (calcul)" },
    ...zones.map((z) => ({ value: z.code, label: `${z.code} · ${z.name}` })),
  ];

  const assign = (ids: string[], zone: string) =>
    start(async () => {
      const res = await safeCall(assignStationZones({ ids, zone }));
      if (!res.ok) return void toast.error(res.error);
      const n = res.data?.done ?? ids.length;
      toast.success(
        zone === "auto"
          ? `${n} ${pl(n, "gare")} rendue${n > 1 ? "s" : ""} au calcul.`
          : `${n} ${pl(n, "gare")} en zone ${zone}.`,
      );
      setPicked(new Set());
      router.refresh();
    });
  const recompute = (crossings: boolean) =>
    start(async () => {
      const res = await safeCall(recomputeNetwork({ crossings }));
      if (!res.ok) return void toast.error(res.error);
      const c = res.data?.crossings;
      toast.success(
        crossings && c
          ? `PN Infrabel : ${c.infrabel} lus, ${c.created} nouveaux, ${c.updated} mis à jour, ${c.matched} rapprochés.`
          : "Zones recalculées.",
      );
      router.refresh();
    });

  const allShownPicked = shown.length > 0 && shown.slice(0, limit).every((s) => picked.has(s.id));

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardHeader eyebrow="Ex-zones COI · carte du 28/06/2023" title="Zones SPI" />
        <CardContent className="flex flex-col gap-2">
          <p className="text-small text-fg-muted">
            Chaque gare et PANG reçoit une zone : d&apos;après la carte des zones, sinon la zone de
            la gare la plus proche le long des lignes, sinon à vol d&apos;oiseau. Une zone choisie
            ici n&apos;est jamais recalculée ; « Automatique » rend la main au calcul. Les PN
            prennent la zone de la gare la plus proche de leur ligne (sauf zone saisie par
            l&apos;équipe).
          </p>
          {summary.length ? (
            <ul
              className="flex flex-wrap gap-x-4 gap-y-1 text-small text-fg-muted"
              data-testid="zones-summary"
            >
              {summary.map((s) => (
                <li key={s} className="min-w-0">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => recompute(false)}
              data-testid="zones-recompute"
            >
              <RefreshCw aria-hidden /> Recalculer les zones
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => recompute(true)}
            >
              <TrainTrack aria-hidden /> Importer les PN Infrabel
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip pressed={showZones} onPressedChange={setShowZones}>
              <Layers aria-hidden className="size-3.5" /> Zones dessinées
            </ToggleChip>
            <p className="text-small text-fg-muted">
              Clique une gare sur la carte pour changer sa zone.
            </p>
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
            />
          </div>
          {sel ? (
            <div
              className="flex flex-wrap items-end gap-3 rounded-box border border-accent bg-accent-soft p-3"
              data-testid="zones-station"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{sel.name}</span>
                <span className="text-small text-fg-muted">
                  {KIND[sel.kind] ?? "Point"} ·{" "}
                  {sel.lines.length ? `L.${sel.lines.join(", L.")}` : "sans ligne"}
                  {sel.source
                    ? ` · ${SPI_SOURCE_LABEL[sel.source as SpiSource] ?? sel.source}`
                    : ""}
                </span>
              </div>
              <div className="w-56">
                <CustomSelect
                  label="Zone"
                  aria-label={`Zone de ${sel.name}`}
                  value={sel.source === "manuel" ? sel.zone : "auto"}
                  onValueChange={(v) => assign([sel.id], v)}
                  options={zoneOptions}
                  disabled={pending}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Fermer
              </Button>
            </div>
          ) : null}
        </div>

        <section aria-label="Zones" className="flex min-w-0 flex-col gap-2">
          <h2 className="label-mono text-fg-muted">Zones · {zones.length}</h2>
          <ul className="flex flex-col divide-y divide-border overflow-y-auto rounded-box border border-(--card-frame) bg-surface xl:max-h-[30rem] shadow-rest">
            {zones.map((z) => (
              <li key={z.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
                <span aria-hidden className="size-3 rounded-sm" style={{ background: z.color }} />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer flex-col text-left"
                  onClick={() => setZoneF(zoneF === z.code ? "" : z.code)}
                  aria-pressed={zoneF === z.code}
                >
                  <span>
                    <span className="font-mono font-semibold">{z.code}</span> {z.name}
                  </span>
                  <span className="text-small text-fg-muted">
                    {z.district} · {counts.get(z.code) ?? 0} {pl(counts.get(z.code) ?? 0, "gare")}
                    {z.polygon ? " · contour posé à la main" : ""}
                  </span>
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Modifier la zone ${z.code}`}
                  onClick={() => setEditing(z)}
                >
                  <Pencil aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-small text-fg-muted">
            {counts.get("") ?? 0} {pl(counts.get("") ?? 0, "point")} sans zone (gares étrangères,
            points sans position).
          </p>
        </section>
      </div>

      <section aria-label="Gares et zones" className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
          <label className="relative min-w-0 md:w-72">
            <span className="sr-only">Rechercher une gare</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Gare, PANG, ligne…"
              className="pl-9"
              data-testid="zones-search"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <div className="md:w-48">
              <CustomSelect
                label="Zone"
                aria-label="Filtrer par zone"
                value={zoneF}
                onValueChange={setZoneF}
                options={[
                  { value: "", label: "Toutes zones" },
                  { value: "aucune", label: "Sans zone" },
                  ...zones.map((z) => ({ value: z.code, label: `${z.code} · ${z.name}` })),
                ]}
              />
            </div>
            <div className="md:w-48">
              <CustomSelect
                label="Origine"
                aria-label="Filtrer par origine"
                value={sourceF}
                onValueChange={setSourceF}
                options={[
                  { value: "", label: "Toutes origines" },
                  ...Object.entries(SPI_SOURCE_LABEL).map(([value, label]) => ({ value, label })),
                  { value: "aucune", label: "Sans zone" },
                ]}
              />
            </div>
          </div>
          <p className="text-small text-fg-muted md:ml-auto" data-testid="zones-count">
            <span className="font-medium text-fg tabular">{shown.length}</span>{" "}
            {pl(shown.length, "point")}
          </p>
        </div>

        {picked.size ? (
          <div
            className="sticky top-14 z-10 flex flex-wrap items-end gap-2 rounded-box border border-accent bg-surface p-3"
            data-testid="zones-bulk"
          >
            <p className="mr-auto self-center">
              <span className="font-medium tabular">{picked.size}</span>{" "}
              {pl(picked.size, "point sélectionné", "points sélectionnés")}
            </p>
            <div className="w-56">
              <CustomSelect
                label="Attribuer"
                aria-label="Zone à attribuer"
                value={target}
                onValueChange={setTarget}
                options={[{ value: "", label: "Choisir une zone…" }, ...zoneOptions]}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={!target || pending}
              onClick={() => assign([...picked].slice(0, 400), target)}
              data-testid="zones-assign"
            >
              Attribuer à la sélection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
              Désélectionner
            </Button>
          </div>
        ) : null}

        {shown.length === 0 ? (
          <EmptyState framed title="Aucun point" description="Aucune gare pour ces filtres." />
        ) : (
          <div className="overflow-x-auto rounded-box border border-border">
            <table className="w-full min-w-[40rem] text-body">
              <thead className="bg-surface-2 text-left text-small text-fg-muted">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <Checkbox
                      aria-label="Tout sélectionner"
                      checked={allShownPicked}
                      onCheckedChange={(v) =>
                        setPicked(v ? new Set(shown.slice(0, limit).map((s) => s.id)) : new Set())
                      }
                    />
                  </th>
                  <th className="px-3 py-2 font-medium">Gare / PANG</th>
                  <th className="px-3 py-2 font-medium">Lignes</th>
                  <th className="px-3 py-2 font-medium">Zone</th>
                  <th className="px-3 py-2 font-medium">Origine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border" data-testid="zones-table">
                {shown.slice(0, limit).map((s) => (
                  <tr
                    key={s.id}
                    className={cn(
                      selected === s.id ? "bg-accent-soft" : hovered === s.id ? "bg-surface-2" : "",
                    )}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered((h) => (h === s.id ? null : h))}
                  >
                    <td className="px-3 py-1.5">
                      <Checkbox
                        aria-label={`Sélectionner ${s.name}`}
                        checked={picked.has(s.id)}
                        onCheckedChange={(v) =>
                          setPicked((p) => {
                            const n = new Set(p);
                            if (v) n.add(s.id);
                            else n.delete(s.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="cursor-pointer text-left hover:underline"
                        onClick={() => setSelected(s.id)}
                      >
                        {s.name}
                      </button>
                      <span className="ml-2 text-small text-fg-muted">{KIND[s.kind] ?? ""}</span>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-small text-fg-muted">
                      {s.lines.slice(0, 4).join(", ")}
                      {s.lines.length > 4 ? "…" : ""}
                    </td>
                    <td className="px-3 py-1.5">
                      <Select
                        aria-label={`Zone de ${s.name}`}
                        value={s.source === "manuel" ? s.zone : "auto"}
                        onChange={(e) => assign([s.id], e.target.value)}
                        disabled={pending}
                        className="h-control-sm min-w-0 py-0 md:w-52"
                      >
                        <option value="auto">
                          {s.zone ? `Auto (${s.zone})` : "Auto (aucune)"}
                        </option>
                        {zones.map((z) => (
                          <option key={z.code} value={z.code}>
                            {z.code} · {z.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-1.5 text-small text-fg-muted">
                      {s.source ? (SPI_SOURCE_LABEL[s.source as SpiSource] ?? s.source) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length > limit ? (
              <div className="border-t border-border p-3">
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => setLimit((l) => l + PAGE)}
                >
                  Afficher {Math.min(PAGE, shown.length - limit)} de plus
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => (o ? null : setEditing(null))}>
        {editing ? (
          <DialogContent
            eyebrow={`Zone ${editing.code} · ${editing.district}`}
            title={`Modifier ${editing.name}`}
          >
            <ZoneForm zone={editing} onDone={() => setEditing(null)} />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

function ZoneForm({ zone, onDone }: { zone: SpiZone; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState({
    name: zone.name,
    color: zone.color,
    ref_station: zone.refStation,
    notes: zone.notes,
  });
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await safeCall(
            saveSpiZone({ id: zone.id, expectedUpdated: zone.updated, data: d }),
          );
          if (!res.ok) return void toast.error(res.error);
          toast.success("Zone enregistrée.");
          router.refresh();
          onDone();
        });
      }}
    >
      <Field label="Nom" required>
        <Input
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
          maxLength={80}
          required
        />
      </Field>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-3">
        <Field label="Couleur">
          <input
            type="color"
            value={d.color}
            onChange={(e) => setD({ ...d, color: e.target.value })}
            className="h-control w-14 cursor-pointer rounded-control border border-border-strong bg-surface"
            aria-label="Couleur de la zone"
          />
        </Field>
        <Field label="Gare de référence">
          <Input
            value={d.ref_station}
            onChange={(e) => setD({ ...d, ref_station: e.target.value })}
            maxLength={120}
          />
        </Field>
      </div>
      <Field label="Remarques">
        <Textarea
          value={d.notes}
          onChange={(e) => setD({ ...d, notes: e.target.value })}
          maxLength={1000}
          rows={3}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" variant="primary" disabled={pending} aria-busy={pending || undefined}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
