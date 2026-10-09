"use client";

import {
  Bell,
  BellOff,
  Bus,
  NotebookPen,
  RefreshCw,
  Search,
  Star,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { toggleFavoriteStation, unwatchTrain, watchTrain } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import {
  delayLabel,
  delayTone,
  looksLikeTrain,
  normalizeTrain,
  type Board,
  type Composition,
  type Disturbance,
  type FavoriteStation,
  type Station,
  type Train,
} from "@/lib/ops/irail";
import { safeCall } from "@/lib/orders/safe-call";
import { brusselsDay, brusselsTime } from "@/lib/orders/time";
import { cn, pl } from "@/lib/utils";
import type { Watch } from "@/server/data/ops";

const hm = (ms: number) => (ms ? brusselsTime(new Date(ms)) : "--:--");
const toneVar = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  neutral: "var(--border)",
};

async function getJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? "iRail ne répond pas." };
    return { ok: true, data: body };
  } catch (e) {
    if ((e as Error).name === "AbortError") return { ok: false, error: "" };
    return { ok: false, error: "Réseau indisponible." };
  }
}

let stationCache: Station[] | null = null;

export function DelayBadge({ delayMin, cancelled }: { delayMin: number; cancelled: boolean }) {
  const tone = delayTone(delayMin, cancelled);
  return (
    <Badge tone={tone === "neutral" ? "neutral" : tone}>
      {tone !== "ok" ? <TriangleAlert aria-hidden className="size-3" /> : null}
      {delayLabel(delayMin, cancelled)}
    </Badge>
  );
}

/** Trains en direct (iRail, via le serveur CSM) : tableau de gare, panneau train, perturbations, trains suivis. */
export function LiveBoard({
  favorites: initialFavorites,
  watches,
  districtStations,
  canOrderBus,
  canWriteLog,
}: {
  favorites: FavoriteStation[];
  watches: Watch[];
  districtStations: string[];
  canOrderBus: boolean;
  canWriteLog: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [favorites, setFavorites] = useState(initialFavorites);
  const [stations, setStations] = useState<Station[]>(stationCache ?? []);
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [station, setStation] = useState<FavoriteStation | null>(() => {
    const id = params.get("gare");
    const name = params.get("nom");
    return id && name ? { id, name } : (initialFavorites[0] ?? null);
  });
  const [kind, setKind] = useState<"departure" | "arrival">(
    params.get("sens") === "arrival" ? "arrival" : "departure",
  );
  const [now, setNow] = useState(true);
  const [day, setDay] = useState(brusselsDay());
  const [time, setTime] = useState(brusselsTime());
  const [board, setBoard] = useState<Board | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [trainId, setTrainId] = useState<string | null>(
    params.get("train") ? normalizeTrain(params.get("train") ?? "") || null : null,
  );
  // Jour de circulation du train ouvert (Europe/Brussels) : celui du tableau en mode « autre heure ».
  const [trainDay, setTrainDay] = useState<string>(
    /^\d{4}-\d{2}-\d{2}$/.test(params.get("jour") ?? "")
      ? (params.get("jour") as string)
      : brusselsDay(),
  );
  // Lien de notification vers la page déjà ouverte (navigation douce) : ouvre le train demandé.
  const wantedTrain = params.get("train");
  useEffect(() => {
    const t = wantedTrain ? normalizeTrain(wantedTrain) : "";
    if (t && t !== trainId) {
      setTrainId(t);
      setTrainDay(brusselsDay());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedTrain]);
  const [pending, start] = useTransition();
  const abort = useRef<AbortController | null>(null);

  // Gares iRail : chargées une fois (cache serveur 24 h, cache module côté client).
  useEffect(() => {
    if (stationCache) return;
    void getJson<{ stations: Station[] }>("/api/operations/irail/gares").then((r) => {
      if (r.ok) {
        stationCache = r.data.stations;
        setStations(r.data.stations);
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!station) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setLoading(true);
    const sp = new URLSearchParams({ gare: station.id, sens: kind });
    if (!now) {
      sp.set("jour", day);
      sp.set("heure", time);
    }
    const r = await getJson<{ board: Board; stale: boolean }>(
      `/api/operations/irail/tableau?${sp}`,
      ctrl.signal,
    );
    if (ctrl.signal.aborted) return;
    setLoading(false);
    if (r.ok) {
      setBoard(r.data.board);
      setStale(r.data.stale);
      setError("");
    } else if (r.error) setError(r.error);
  }, [station, kind, now, day, time]);

  useEffect(() => {
    setBoard(null);
    void load();
  }, [load]);

  // Rafraîchissement toutes les 30 s, onglet visible seulement, en mode « maintenant ».
  useEffect(() => {
    if (!now) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [now, load]);

  const syncUrl = (next: {
    gare?: FavoriteStation | null;
    train?: string | null;
    jour?: string | null;
    sens?: string;
  }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.gare !== undefined) {
      if (next.gare) {
        sp.set("gare", next.gare.id);
        sp.set("nom", next.gare.name);
      } else {
        sp.delete("gare");
        sp.delete("nom");
      }
    }
    if (next.train !== undefined) {
      if (next.train) sp.set("train", next.train);
      else sp.delete("train");
    }
    if (next.jour !== undefined) {
      if (next.jour) sp.set("jour", next.jour);
      else sp.delete("jour");
    }
    if (next.sens) sp.set("sens", next.sens);
    window.history.replaceState(null, "", sp.size ? `${pathname}?${sp}` : pathname);
  };

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const nq = norm(q);
    return stations
      .filter((s) => norm(s.name).includes(nq))
      .sort((a, b) => Number(!norm(a.name).startsWith(nq)) - Number(!norm(b.name).startsWith(nq)))
      .slice(0, 8);
  }, [query, stations]);

  const pick = (s: FavoriteStation) => {
    setStation(s);
    setQuery("");
    setSuggestOpen(false);
    syncUrl({ gare: s });
  };
  const submitSearch = () => {
    if (looksLikeTrain(query)) {
      const t = normalizeTrain(query);
      if (t) {
        openTrain(t);
        setQuery("");
        return;
      }
    }
    if (suggestions[0]) pick(suggestions[0]);
  };

  const isFavorite = !!station && favorites.some((f) => f.id === station.id);
  const toggleFav = () =>
    start(async () => {
      if (!station) return;
      const res = await safeCall(toggleFavoriteStation(station));
      if (!res.ok) return void toast.error(res.error);
      setFavorites(
        res.data.favorite ? [...favorites, station] : favorites.filter((f) => f.id !== station.id),
      );
      router.refresh();
    });

  const openTrain = (t: string, onDay = now ? brusselsDay() : day) => {
    setTrainId(t);
    setTrainDay(onDay);
    syncUrl({ train: t, jour: onDay === brusselsDay() ? null : onDay });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <form
          role="search"
          className="relative flex gap-2 md:max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Gare ou numéro de train</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              placeholder="Gare ou train (Mons, IC 2134…)"
              className="pl-9"
              data-testid="live-search"
              autoComplete="off"
              maxLength={60}
            />
          </label>
          <Button type="submit">Rechercher</Button>
          {suggestOpen && suggestions.length ? (
            <ul
              role="listbox"
              aria-label="Gares"
              className="absolute top-full right-0 left-0 z-20 mt-1 border border-border-strong bg-surface shadow-lg"
              data-testid="live-suggestions"
            >
              {suggestions.map((s) => (
                <li key={s.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full cursor-pointer items-center px-3 text-left text-body hover:bg-surface-2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick({ id: s.id, name: s.name })}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {looksLikeTrain(query) && normalizeTrain(query) ? (
            <p className="absolute top-full mt-1 text-small text-fg-muted">
              Entrée : ouvrir le train {normalizeTrain(query)}
            </p>
          ) : null}
        </form>
        {favorites.length ? (
          <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Gares favorites">
            {favorites.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={station?.id === f.id ? "primary" : "ghost"}
                className={cn("shrink-0", station?.id !== f.id && "border border-border")}
                onClick={() => pick(f)}
                aria-pressed={station?.id === f.id}
              >
                <Star aria-hidden className="size-3.5" /> {f.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="tableau">
        <TabsList>
          <TabsTrigger value="tableau">Tableau de gare</TabsTrigger>
          <TabsTrigger value="perturbations">Perturbations</TabsTrigger>
          <TabsTrigger value="suivis">Trains suivis ({watches.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="tableau" className="flex flex-col gap-3 pt-3">
          {!station ? (
            <EmptyState
              title="Choisissez une gare"
              description="Tapez le nom d'une gare, ou un numéro de train pour ouvrir son parcours. Ajoutez vos gares en favori (étoile)."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-h3 font-semibold" data-testid="live-station">
                    {board?.station || station.name}
                  </h2>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleFav}
                    disabled={pending}
                    aria-pressed={isFavorite}
                    aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                    data-testid="live-favorite"
                  >
                    <Star aria-hidden className={cn(isFavorite && "fill-accent text-accent")} />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented
                    label="Sens"
                    value={kind}
                    onChange={(v) => {
                      setKind(v);
                      syncUrl({ sens: v });
                    }}
                    options={[
                      { value: "departure", label: "Départs" },
                      { value: "arrival", label: "Arrivées" },
                    ]}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-border"
                    onClick={() => setNow(!now)}
                    aria-pressed={!now}
                  >
                    {now ? "Maintenant" : "Autre heure"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void load()}
                    aria-label="Actualiser"
                    disabled={loading}
                  >
                    <RefreshCw aria-hidden className={cn(loading && "animate-spin")} />
                  </Button>
                </div>
              </div>
              {!now ? (
                <div className="grid max-w-sm grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-small text-fg-muted">
                    Jour
                    <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1 text-small text-fg-muted">
                    Heure
                    <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                  </label>
                </div>
              ) : null}
              {error ? (
                <p
                  role="status"
                  className="border border-warn/50 bg-[color-mix(in_oklab,var(--warn)_10%,var(--surface))] px-3 py-2 text-small"
                >
                  {error}
                  {board ? ` Dernière donnée : ${hm(board.fetchedAt)}.` : ""}
                </p>
              ) : stale && board ? (
                <p role="status" className="text-small text-warn">
                  iRail ne répond pas : donnée de {hm(board.fetchedAt)}.
                </p>
              ) : null}
              {!board ? (
                error ? null : (
                  <div className="flex flex-col gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-11 w-full" />
                    ))}
                  </div>
                )
              ) : board.rows.length === 0 ? (
                <EmptyState
                  title="Aucun train"
                  description="Aucun train à cette heure pour cette gare."
                />
              ) : (
                <>
                  <p className="label-mono text-fg-muted">
                    Source iRail (données SNCB) · mis à jour {hm(board.fetchedAt)}
                  </p>
                  <div className="hidden md:block">
                    <Table>
                      <THead>
                        <tr>
                          <Th>Heure</Th>
                          <Th>Retard</Th>
                          <Th>Train</Th>
                          <Th>{kind === "departure" ? "Destination" : "Provenance"}</Th>
                          <Th>Voie</Th>
                        </tr>
                      </THead>
                      <tbody data-testid="live-board">
                        {board.rows.map((r) => (
                          <Tr
                            key={`${r.train}-${r.at}`}
                            statusColor={toneVar[delayTone(r.delayMin, r.cancelled)]}
                            className="cursor-pointer"
                            onClick={() => openTrain(r.train)}
                          >
                            <Td className="font-mono tabular">
                              <button
                                type="button"
                                className="cursor-pointer focus-visible:outline-1 focus-visible:outline-accent"
                                aria-label={`Ouvrir le train ${r.label} de ${hm(r.at)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTrain(r.train);
                                }}
                              >
                                <span className={cn(r.cancelled && "line-through")}>
                                  {hm(r.at)}
                                </span>
                              </button>
                              {r.delayMin > 0 && !r.cancelled ? (
                                <span className="ml-2 text-warn">
                                  {hm(r.at + r.delayMin * 60000)}
                                </span>
                              ) : null}
                            </Td>
                            <Td>
                              <DelayBadge delayMin={r.delayMin} cancelled={r.cancelled} />
                            </Td>
                            <Td className="font-mono">
                              {r.label}
                              {r.extra ? (
                                <span className="ml-1 text-small text-info">extra</span>
                              ) : null}
                            </Td>
                            <Td className={cn(r.cancelled && "line-through")}>{r.other}</Td>
                            <Td
                              className={cn(
                                "font-mono",
                                r.platformChanged && "font-semibold text-warn",
                              )}
                            >
                              {r.platform || "—"}
                              {r.platformChanged ? (
                                <span className="ml-1 text-small">modifiée</span>
                              ) : null}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                  <ul className="flex flex-col gap-2 md:hidden" data-testid="live-cards">
                    {board.rows.map((r) => (
                      <li key={`${r.train}-${r.at}`}>
                        <button
                          type="button"
                          className="block w-full cursor-pointer text-left"
                          onClick={() => openTrain(r.train)}
                        >
                          <ListCard
                            statusColor={toneVar[delayTone(r.delayMin, r.cancelled)]}
                            title={
                              <span className="inline-flex items-center gap-2">
                                <span
                                  className={cn("font-mono tabular", r.cancelled && "line-through")}
                                >
                                  {hm(r.at)}
                                </span>
                                <span className="truncate">{r.other}</span>
                              </span>
                            }
                            meta={`${r.label} · voie ${r.platform || "?"}${r.platformChanged ? " (modifiée)" : ""}`}
                            aside={<DelayBadge delayMin={r.delayMin} cancelled={r.cancelled} />}
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </TabsContent>
        <TabsContent value="perturbations" className="pt-3">
          <DisturbanceList districtStations={districtStations} />
        </TabsContent>
        <TabsContent value="suivis" className="pt-3">
          {watches.length === 0 ? (
            <EmptyState
              title="Aucun train suivi"
              description="Ouvrez un train et choisissez « Suivre » : une notification arrive dès 5 min de retard ou en cas de suppression (10 trains, pour la journée)."
            />
          ) : (
            <ul className="flex flex-col gap-2" data-testid="live-watches">
              {watches.map((w) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="block w-full cursor-pointer text-left"
                    onClick={() => openTrain(w.train, w.day)}
                  >
                    <ListCard
                      statusColor={
                        w.delay === null
                          ? "var(--border)"
                          : toneVar[delayTone(w.delay, w.cancelled)]
                      }
                      title={<span className="font-mono">{w.label || w.train}</span>}
                      meta={`${w.day === brusselsDay() ? "Aujourd'hui" : "Demain"} · alerte dès +${w.threshold} min`}
                      aside={
                        w.delay === null ? (
                          <Badge>En attente</Badge>
                        ) : (
                          <DelayBadge delayMin={w.delay} cancelled={w.cancelled} />
                        )
                      }
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <TrainPanel
        trainId={trainId}
        day={trainDay}
        onClose={() => {
          setTrainId(null);
          syncUrl({ train: null, jour: null });
        }}
        watch={watches.find((w) => w.train === trainId && w.day === trainDay) ?? null}
        canOrderBus={canOrderBus}
        canWriteLog={canWriteLog}
      />
    </div>
  );
}

function DisturbanceList({ districtStations }: { districtStations: string[] }) {
  const [items, setItems] = useState<Disturbance[] | null>(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(districtStations.length === 0);
  const [kind, setKind] = useState<"incident" | "travaux">("incident");
  useEffect(() => {
    void getJson<{ items: Disturbance[] }>("/api/operations/irail/perturbations").then((r) => {
      if (r.ok) setItems(r.data.items);
      else setError(r.error);
    });
  }, []);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const names = useMemo(
    () => districtStations.map(norm).filter((n) => n.length > 2),
    [districtStations],
  );
  const list = (items ?? []).filter(
    (d) =>
      d.kind === kind &&
      (all || names.some((n) => norm(`${d.title} ${d.description}`).includes(n))),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Type"
          value={kind}
          onChange={setKind}
          options={[
            { value: "incident", label: "Incidents" },
            { value: "travaux", label: "Travaux" },
          ]}
        />
        {districtStations.length ? (
          <Segmented
            label="Périmètre"
            value={all ? "tout" : "district"}
            onChange={(v) => setAll(v === "tout")}
            options={[
              { value: "district", label: "Mon district" },
              { value: "tout", label: "Tout le réseau" },
            ]}
          />
        ) : null}
      </div>
      {error ? <p className="text-small text-warn">{error}</p> : null}
      {!items && !error ? <Skeleton className="h-20 w-full" /> : null}
      {items && list.length === 0 ? (
        <EmptyState
          title="Rien à signaler"
          description={
            all
              ? "Aucune perturbation signalée par iRail."
              : "Aucune perturbation sur les gares du district. Voir « Tout le réseau »."
          }
        />
      ) : null}
      <ul className="flex flex-col gap-2" data-testid="live-disturbances">
        {list.map((d) => (
          <li key={d.id} className="flex flex-col gap-1 border border-border bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={d.kind === "incident" ? "danger" : "warn"}>
                {d.kind === "incident" ? "Incident" : "Travaux"}
              </Badge>
              <span className="font-mono text-small text-fg-muted">{hm(d.at)}</span>
            </div>
            <p className="text-body font-medium">{d.title}</p>
            <p className="text-small whitespace-pre-wrap text-fg-muted">{d.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrainPanel({
  trainId,
  day,
  onClose,
  watch,
  canOrderBus,
  canWriteLog,
}: {
  trainId: string | null;
  day: string;
  onClose: () => void;
  watch: Watch | null;
  canOrderBus: boolean;
  canWriteLog: boolean;
}) {
  const router = useRouter();
  const [train, setTrain] = useState<Train | null>(null);
  const [error, setError] = useState("");
  const [comp, setComp] = useState<Composition | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setTrain(null);
    setComp(null);
    setError("");
    if (!trainId) return;
    const ctrl = new AbortController();
    const run = async () => {
      const r = await getJson<{ train: Train }>(
        `/api/operations/irail/train?train=${encodeURIComponent(trainId)}&jour=${day}`,
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (r.ok) setTrain(r.data.train);
      else if (r.error) setError(r.error);
    };
    void run();
    const t = setInterval(() => document.visibilityState === "visible" && void run(), 30_000);
    void getJson<Composition>(
      `/api/operations/irail/composition?train=${encodeURIComponent(trainId)}`,
      ctrl.signal,
    ).then((r) => r.ok && setComp(r.data));
    return () => {
      ctrl.abort();
      clearInterval(t);
    };
  }, [trainId, day]);

  const stops = train?.stops ?? [];
  const first = stops[0];
  const last = stops[stops.length - 1];
  const maxDelay = Math.max(0, ...stops.map((s) => s.delayMin));
  const cancelled = stops.some((s) => s.cancelled);
  const current = stops.findIndex((s) => !s.left);
  const prm = comp?.segments.some((s) => s.units.some((u) => u.prm));
  const orderHref =
    first && last
      ? `/commandes/nouveau?${new URLSearchParams({ origine: first.station, destination: last.station, relation: train?.label ?? "", motif: `${cancelled ? "Suppression" : "Retard"} ${train?.label ?? ""}` })}`
      : "";

  return (
    <Sheet
      open={!!trainId}
      onOpenChange={(o) => (o ? null : onClose())}
      eyebrow="// Train · iRail"
      title={train?.label ?? trainId ?? "Train"}
      description={first && last ? `${first.station} → ${last.station}` : undefined}
      footer={
        trainId ? (
          <div className="flex w-full flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              data-testid="train-watch"
              onClick={() =>
                start(async () => {
                  const res = watch
                    ? await safeCall(unwatchTrain(watch.id))
                    : await safeCall(
                        watchTrain({ train: trainId, day, label: train?.label ?? trainId }),
                      );
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(
                    watch ? "Train plus suivi." : "Train suivi : alerte dès 5 min de retard.",
                  );
                  router.refresh();
                })
              }
            >
              {watch ? <BellOff aria-hidden /> : <Bell aria-hidden />}{" "}
              {watch ? "Ne plus suivre" : "Suivre"}
            </Button>
            {canOrderBus && orderHref ? (
              <Button asChild size="sm">
                <Link href={orderHref}>
                  <Bus aria-hidden /> Bus de substitution
                </Link>
              </Button>
            ) : null}
            {canWriteLog ? (
              <Button asChild size="sm" variant="ghost" className="border border-border">
                <Link href={`/operations/journal?train=${encodeURIComponent(trainId)}`}>
                  <NotebookPen aria-hidden /> Noter
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {error ? <p className="text-small text-warn">{error}</p> : null}
      {!train && !error ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : null}
      {train ? (
        <div className="flex flex-col gap-4" data-testid="train-panel">
          <div className="flex flex-wrap items-center gap-2">
            <DelayBadge delayMin={maxDelay} cancelled={cancelled} />
            {prm ? <Badge tone="info">Section PMR</Badge> : null}
            <span className="text-small text-fg-muted">
              retard max · mis à jour {hm(train.fetchedAt)}
            </span>
          </div>
          <ol className="flex flex-col" aria-label="Arrêts">
            {stops.map((s, i) => (
              <li
                key={`${s.stationId}-${i}`}
                className={cn(
                  "flex items-center gap-3 border-b border-border py-2 last:border-b-0",
                  s.left && "text-fg-muted",
                  i === current && "font-semibold",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 border",
                    i === current
                      ? "border-accent bg-accent"
                      : s.left
                        ? "border-fg-muted bg-fg-muted"
                        : "border-border-strong",
                  )}
                />
                <span
                  className={cn("w-12 shrink-0 font-mono tabular", s.cancelled && "line-through")}
                >
                  {hm(i === 0 ? s.at : s.arrivalAt)}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", s.cancelled && "line-through")}>
                  {s.station}
                </span>
                {s.delayMin > 0 || s.cancelled ? (
                  <DelayBadge delayMin={s.delayMin} cancelled={s.cancelled} />
                ) : null}
                <span
                  className={cn(
                    "w-10 shrink-0 text-right font-mono text-small",
                    s.platformChanged && "text-warn",
                  )}
                >
                  {s.platform ? `v. ${s.platform}` : ""}
                </span>
              </li>
            ))}
          </ol>
          {comp?.segments.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="label-mono text-fg-muted">Composition</h3>
              {comp.segments.map((seg, k) => (
                <div key={k} className="flex flex-col gap-1">
                  <p className="text-small text-fg-muted">
                    {seg.from} → {seg.to} · {seg.units.length} {pl(seg.units.length, "voiture")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {seg.units.map((u, j) => (
                      <span
                        key={j}
                        className={cn(
                          "inline-flex min-h-8 items-center border px-2 font-mono text-small",
                          u.prm ? "border-info text-info" : "border-border",
                        )}
                        title={`${u.type} · 1re ${u.seats1} · 2e ${u.seats2}`}
                      >
                        {u.type || "?"}
                        {u.prm ? " ♿" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
