"use client";

import { Copy, Eye, NotebookPen, Pencil, Route, Search } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { saveCrossing } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { useMediaQuery } from "@/lib/use-media-query";
import { safeCall } from "@/lib/orders/safe-call";
import { cn } from "@/lib/utils";
import type { Depot, LevelCrossing } from "@/server/data/ops";

const PnMap = dynamic(() => import("./pn-map").then((m) => m.PnMap), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full" />,
});

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « 12 », « L.94 », « PN 12 L94 », « 12 L.94 » ou un mot de l'adresse. */
export function matchCrossing(c: LevelCrossing, q: string): boolean {
  const t = norm(q)
    .replace(/\bpn\b/g, " ")
    .trim();
  if (!t) return true;
  const line = /\bl\.?\s*(\d{1,3}[a-z]?)\b/.exec(t);
  const rest = t.replace(/\bl\.?\s*\d{1,3}[a-z]?\b/, " ").trim();
  if (line && norm(c.line) !== `l.${line[1]}`) return false;
  if (!rest) return true;
  if (/^\d{1,4}( ?(bis|ter))?$/.test(rest))
    return norm(c.number).replace(" ", "") === rest.replace(" ", "");
  return norm(`${c.address} ${c.line} ${c.number}`).includes(rest);
}

export function PnBoard({
  crossings,
  depots,
  canEdit,
  canReadLog,
}: {
  crossings: LevelCrossing[];
  depots: Depot[];
  canEdit: boolean;
  canReadLog: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [zone, setZone] = useState(params.get("zone") ?? "");
  const [line, setLine] = useState(params.get("ligne") ?? "");
  const [view, setView] = useState<"liste" | "carte">("liste");
  const [selected, setSelected] = useState<string | null>(params.get("pn"));
  const [editing, setEditing] = useState(false);

  const zones = useMemo(
    () => [...new Set(crossings.map((c) => c.zone).filter(Boolean))].sort(),
    [crossings],
  );
  const lines = useMemo(() => [...new Set(crossings.map((c) => c.line))], [crossings]);
  const list = useMemo(
    () =>
      crossings.filter(
        (c) => (!zone || c.zone === zone) && (!line || c.line === line) && matchCrossing(c, q),
      ),
    [crossings, zone, line, q],
  );
  const sel = crossings.find((c) => c.id === selected) ?? null;
  const depot = sel ? depots.find((d) => d.code === sel.zone && d.lat) : undefined;

  const syncUrl = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
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

  const table = (
    <>
      <div className="hidden md:block">
        <Table>
          <THead>
            <tr>
              <Th>Ligne</Th>
              <Th>PN</Th>
              <Th numeric>BK</Th>
              <Th>Adresse</Th>
              <Th>Zone</Th>
            </tr>
          </THead>
          <tbody data-testid="pn-table">
            {list.slice(0, 400).map((c) => (
              <Tr
                key={c.id}
                selected={c.id === selected}
                className="cursor-pointer"
                onClick={() => select(c.id)}
              >
                <Td className="font-mono whitespace-nowrap">{c.line}</Td>
                <Td className="font-mono whitespace-nowrap">
                  <button
                    type="button"
                    className="cursor-pointer focus-visible:outline-1 focus-visible:outline-accent"
                    aria-label={`Ouvrir le PN ${c.number} de la ${c.line}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      select(c.id);
                    }}
                  >
                    {c.number}
                  </button>
                </Td>
                <Td numeric className="font-mono">
                  {c.bk ? c.bk.toFixed(3) : "—"}
                </Td>
                <Td className="max-w-72 truncate">
                  {c.address || <span className="text-fg-muted">Adresse non renseignée</span>}
                </Td>
                <Td className="font-mono text-fg-muted">{c.zone || "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden" data-testid="pn-cards">
        {list.slice(0, 200).map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="block w-full cursor-pointer text-left"
              onClick={() => select(c.id)}
            >
              <ListCard
                title={
                  <span className="font-mono">
                    PN {c.number} · {c.line}
                  </span>
                }
                meta={`${c.address || "Adresse non renseignée"}${c.zone ? ` · ${c.zone}` : ""}`}
              />
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end">
        <label className="relative min-w-0 md:w-80">
          <span className="sr-only">Rechercher un PN</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => syncUrl({ q: q || null })}
            placeholder="12, L.94, PN 12 L94, rue…"
            className="pl-9"
            data-testid="pn-search"
            maxLength={60}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Select
            aria-label="Zone"
            value={zone}
            onChange={(e) => (setZone(e.target.value), syncUrl({ zone: e.target.value || null }))}
            className="md:w-32"
          >
            <option value="">Toutes zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Ligne"
            value={line}
            onChange={(e) => (setLine(e.target.value), syncUrl({ ligne: e.target.value || null }))}
            className="md:w-32"
          >
            <option value="">Toutes lignes</option>
            {lines.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="lg:hidden">
          <Segmented
            label="Affichage"
            value={view}
            onChange={setView}
            options={[
              { value: "liste", label: "Liste" },
              { value: "carte", label: "Carte" },
            ]}
          />
        </div>
        <p className="text-small text-fg-muted md:ml-auto" data-testid="pn-count">
          <span className="font-mono tabular text-fg">{list.length}</span> PN
        </p>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Aucun PN" description="Aucun passage à niveau pour cette recherche." />
      ) : desktop ? (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
          <div className="max-h-[calc(100dvh-20rem)] min-h-96 overflow-y-auto">{table}</div>
          <div className="sticky top-4 h-[calc(100dvh-20rem)] min-h-96">
            <PnMap crossings={list} selected={selected} onSelect={select} />
          </div>
        </div>
      ) : view === "carte" ? (
        <div className="h-[calc(100dvh-22rem)] min-h-80">
          <PnMap crossings={list} selected={selected} onSelect={select} />
        </div>
      ) : (
        table
      )}

      <Sheet
        open={!!sel}
        onOpenChange={(o) => (o ? null : select(null))}
        eyebrow={sel ? `// Passage à niveau · ${sel.line}` : undefined}
        title={sel ? `PN ${sel.number}` : "PN"}
        description={sel?.address || (sel ? "Adresse non renseignée" : undefined)}
        footer={
          sel && !editing ? (
            <div className="flex w-full flex-wrap gap-2">
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
              {canReadLog ? (
                <Button asChild size="sm" variant="ghost" className="border border-border">
                  <Link href={`/operations/journal?pn=${sel.id}`}>
                    <NotebookPen aria-hidden /> Entrées liées
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
            <CrossingForm
              crossing={sel}
              zones={depots.map((d) => d.code)}
              onDone={() => setEditing(false)}
            />
          ) : (
            <dl
              className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-body"
              data-testid="pn-panel"
            >
              <dt className="text-fg-muted">Ligne</dt>
              <dd className="font-mono">{sel.line}</dd>
              <dt className="text-fg-muted">BK</dt>
              <dd className="font-mono">{sel.bk ? sel.bk.toFixed(3) : "—"}</dd>
              <dt className="text-fg-muted">Zone</dt>
              <dd>
                {sel.zone || "—"}
                {depot ? (
                  <span className="text-fg-muted">
                    {" "}
                    · itinéraire depuis le dépôt de {depot.label}
                  </span>
                ) : sel.zone ? (
                  <span className="text-fg-muted"> · dépôt non renseigné</span>
                ) : null}
              </dd>
              <dt className="text-fg-muted">Coordonnées</dt>
              <dd className="flex items-center gap-2 font-mono">
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
              {sel.notes ? (
                <>
                  <dt className="text-fg-muted">Remarques</dt>
                  <dd className="whitespace-pre-wrap">{sel.notes}</dd>
                </>
              ) : null}
            </dl>
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
  zones: string[];
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
        <Field label="BK (km)">
          <Input value={d.bk} onChange={set("bk")} inputMode="decimal" />
        </Field>
        <Field label="Zone">
          <Select value={d.zone} onChange={set("zone")}>
            <option value="">—</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
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
      <div className={cn("flex justify-end gap-2")}>
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
