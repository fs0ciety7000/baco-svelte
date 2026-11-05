"use client";

import { ChevronRight, Clock, Mail, Phone, Plus, Search, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  loadContact,
  noteContactViewed,
  toggleContactFavorite,
} from "@/app/(app)/ressources/actions";
import { CopyIcon, useCopy } from "@/components/pmr/copy";
import {
  ContactActions,
  ContactForm,
  toInput,
  type Facets,
} from "@/components/referentiels/contact-board";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FilterChip, SegmentedNav } from "@/components/ui/filters";
import { Input } from "@/components/ui/input";
import { ListStatus, TOOLBAR } from "@/components/ui/list-toolbar";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { EmptyState, Kbd } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { dialable } from "@/lib/pmr/model";
import { e164 } from "@/lib/telephony";
import {
  buildIndex,
  highlightPhone,
  highlightText,
  isEmptyQuery,
  parseQuery,
  pushRecent,
  searchDirectory,
  suggestQuery,
  toggleFavorite,
  type DirectoryEntry,
  type DirectoryPrefs,
  type Hit,
  type Query,
  type Segment,
} from "@/lib/referentiels/directory";
import {
  contactTitle,
  groupByService,
  groupByZone,
  mineFilter,
  NO_ZONE,
  sameZones,
  serviceCounts,
  shortServiceLabel,
  zoneLabel,
  zoneMatches,
  zoneParam,
  type DirectoryService,
  type DirectoryZone,
  type Groupable,
  type ZoneFilter,
} from "@/lib/referentiels/directory-model";
import { cn, pl } from "@/lib/utils";
import type { Contact } from "@/server/data/referentiels";

// Annuaire (Ressources › Contacts), refonte du 14 oct. 2026 (`docs/design/REFONTE-ANNUAIRE.md`) puis annuaire v2 du
// 5 nov. 2026 (Service / Fonction / Zone séparés) : l'agent au téléphone doit trouver un numéro en 3 secondes. Toutes les
// fiches (≈ 400) sont chargées une fois ; la recherche tourne dans le navigateur à chaque frappe (accents, fautes, mots
// dans le désordre, numéro, abréviation de gare), classée par pertinence et surlignée. Sans recherche : vue « Par zone »
// (par défaut, zones des districts de l'agent) ou « Par service ». Favoris et récents suivent le compte
// (`users.preferences.directory`). L'état (saisie, filtres, vue, fiche ouverte) est recopié dans l'URL par
// `history.replaceState` (lien partageable, retour arrière).

/** Filtre « service » : `""` = tous, `"-"` = à classer, sinon la clé. */
const UNCLASSIFIED = "-";
/** Valeur de la liste des zones pour « Sans zone ». */
const NO_ZONE_OPT = "-";

type View = "zone" | "service";
type Initial = { q: string; service: string; zone: ZoneFilter; view: View; id: string };
type Row = DirectoryEntry & Groupable;

const RECENT_SHOWN = 5;

export function DirectoryBoard({
  entries,
  services,
  zones,
  mine,
  updated,
  initial,
  prefs,
  canWrite,
  canUpdate,
  canDelete,
}: {
  entries: DirectoryEntry[];
  services: DirectoryService[];
  zones: DirectoryZone[];
  /** Zones des districts de l'agent (« Mes zones »). */
  mine: string[];
  updated: Record<string, string>;
  initial: Initial;
  prefs: DirectoryPrefs;
  canWrite: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initial.q);
  const [service, setService] = useState(initial.service);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>(initial.zone);
  const [view, setView] = useState<View>(initial.view);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [favorites, setFavorites] = useState(prefs.favorites);
  const [recent, setRecent] = useState(prefs.recent);
  const [openId, setOpenId] = useState<string | null>(initial.id || null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wanted = useRef<string | null>(null);

  const rows = useMemo<Row[]>(
    () => entries.map((e) => ({ ...e, service: e.service ?? "", function: e.function ?? "" })),
    [entries],
  );
  const zoneMap = useMemo(() => new Map(zones.map((z) => [z.code, z])), [zones]);
  const serviceMap = useMemo(() => new Map(services.map((s) => [s.key, s])), [services]);
  const index = useMemo(() => buildIndex(rows), [rows]);
  const byId = useMemo(() => new Map(rows.map((e) => [e.id, e])), [rows]);
  const deferred = useDeferredValue(query);
  const q = useMemo(() => parseQuery(deferred), [deferred]);
  const browsing = isEmptyQuery(q);
  const defaultZones = useMemo(() => mineFilter(mine), [mine]);
  const zoneIsDefault = sameZones(zoneFilter, defaultZones);
  const filtered = !!service || !zoneIsDefault;

  const serviceOk = useCallback(
    (e: DirectoryEntry) =>
      !service || (service === UNCLASSIFIED ? !e.service : e.service === service),
    [service],
  );
  // Bonus de classement tirés des préférences au chargement : une étoile ou une fiche ouverte ne réordonne pas la liste
  // sous les yeux de l'agent.
  const hits = useMemo(
    () =>
      searchDirectory(index, q, {
        ...prefs,
        keep: (e) => serviceOk(e) && zoneMatches(e.zone, zoneFilter),
      }),
    [index, q, prefs, serviceOk, zoneFilter],
  );
  // Avec une recherche, les fiches hors des zones choisies sont comptées (« 3 autres hors de tes zones »).
  const outside = useMemo(
    () =>
      browsing || zoneFilter === null
        ? 0
        : searchDirectory(index, q, { keep: serviceOk }).length - hits.length,
    [browsing, zoneFilter, index, q, serviceOk, hits.length],
  );
  const suggestion = useMemo(
    () => (hits.length || outside ? null : suggestQuery(index, q)),
    [hits.length, outside, index, q],
  );
  const counts = useMemo(
    () => serviceCounts(rows.filter((e) => zoneMatches(e.zone, zoneFilter))),
    [rows, zoneFilter],
  );
  const sections = useMemo(() => {
    if (!browsing) return [];
    const list = hits.map((h) => h.entry as Row);
    const ctx = { services, zones: zoneMap, mine };
    return view === "service" ? groupByService(list, ctx) : groupByZone(list, ctx);
  }, [browsing, hits, view, services, zoneMap, mine]);

  // État → URL (sans rendu serveur : `replaceState`, voir CLAUDE.md « Paramètre d'URL d'un panneau »).
  useEffect(() => {
    const t = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const set = (k: string, v: string) =>
        v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
      set("q", query.trim());
      set("service", service);
      url.searchParams.delete("zone");
      for (const z of zoneParam(zoneFilter, mine)) url.searchParams.append("zone", z);
      set("vue", view === "service" ? "service" : "");
      set("id", openId ?? "");
      for (const k of ["page", "category", "group"]) url.searchParams.delete(k);
      if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, service, zoneFilter, view, openId, mine]);

  // Fiche ouverte : affichée tout de suite depuis la liste, complétée (auteur, date) par le serveur.
  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadContact(id));
    if (wanted.current !== id) return;
    if (res.ok) setDetail(res.data);
    else toast.error(res.error);
  }, []);
  useEffect(() => {
    setDetail(null);
    if (openId) void load(openId);
  }, [openId, load]);

  // Récents : en tête localement tout de suite, enregistrés dans le compte sans attendre (échec silencieux).
  // Écritures des préférences en file : favori et récent lisent puis réécrivent `preferences` ; lancées ensemble, la
  // seconde écrasait la première (trouvé par l'E2E : étoile puis ouverture de la fiche).
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(job, job);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);
  const recentRef = useRef(recent);
  const touch = useCallback(
    (id: string) => {
      if (recentRef.current[0] === id) return;
      recentRef.current = pushRecent(recentRef.current, id);
      setRecent(recentRef.current);
      void enqueue(() => safeCall(noteContactViewed(id)));
    },
    [enqueue],
  );
  const open = useCallback(
    (id: string) => {
      setOpenId(id);
      touch(id);
    },
    [touch],
  );
  const favRef = useRef(favorites);
  const toggleFav = useCallback(
    async (id: string) => {
      const before = favRef.current;
      favRef.current = toggleFavorite(before, id);
      setFavorites(favRef.current);
      const res = await enqueue(() => safeCall(toggleContactFavorite(id)));
      if (!res.ok) {
        favRef.current = before;
        setFavorites(before);
        toast.error(res.error);
      }
    },
    [enqueue],
  );
  const toggleFold = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const resetFilters = () => {
    setService("");
    setZoneFilter(defaultZones);
  };
  const clearAll = () => {
    setQuery("");
    resetFilters();
    inputRef.current?.focus();
  };

  // Clavier : ↓ depuis la recherche → premier résultat ; ↑ / ↓ entre les résultats ; Échap → retour à la recherche.
  const rowButtons = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-row-open]") ?? []);
  const onListKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (!t.matches("[data-row-open]")) return;
    const all = rowButtons();
    const i = all.indexOf(t);
    if (e.key === "ArrowDown" && i < all.length - 1) {
      e.preventDefault();
      all[i + 1]!.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (i > 0) all[i - 1]!.focus();
      else inputRef.current?.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  const favEntries = favorites.map((id) => byId.get(id)).filter(Boolean) as Row[];
  const recentEntries = recent
    .map((id) => byId.get(id))
    .filter((e): e is Row => !!e && !favorites.includes(e.id))
    .slice(0, RECENT_SHOWN);
  const showShortcuts =
    browsing && !filtered && (favEntries.length > 0 || recentEntries.length > 0);

  const labels = { services: serviceMap, zones: zoneMap };
  const rowProps = {
    q,
    labels,
    favorites,
    selectedId: openId,
    onOpen: open,
    onToggleFav: toggleFav,
    onTouch: touch,
  };

  const detailEntry = openId ? byId.get(openId) : undefined;
  const shown = detail && detail.id === openId ? detail : null;
  const facets: Facets = useMemo(
    () => ({
      services,
      zones,
      extraZones: [...new Set(rows.map((e) => e.zone).filter((z) => z && !zoneMap.has(z)))],
    }),
    [services, zones, rows, zoneMap],
  );

  // Zones proposées dans le filtre : sans zone, zones connues (mes zones d'abord), codes hors carte.
  const zoneOptions = useMemo(() => {
    const used = new Set(rows.map((e) => e.zone));
    const mineSet = new Set(mine);
    const known = [...zones]
      .sort(
        (a, b) =>
          Number(mineSet.has(b.code)) - Number(mineSet.has(a.code)) ||
          a.name.localeCompare(b.name, "fr"),
      )
      .map((z) => ({
        value: z.code,
        label: `${z.code} · ${z.name}`,
        hint: z.district || undefined,
      }));
    const extra = [...used]
      .filter((z) => z && !zoneMap.has(z))
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((z) => ({ value: z, label: z, hint: "hors carte SPI" }));
    return [{ value: NO_ZONE_OPT, label: "Sans zone" }, ...known, ...extra];
  }, [rows, zones, zoneMap, mine]);
  const zoneValues = (zoneFilter ?? []).map((z) => (z === NO_ZONE ? NO_ZONE_OPT : z));
  const zoneSummary =
    zoneFilter === null
      ? "Toutes les zones"
      : zoneIsDefault && mine.length
        ? "Mes zones"
        : undefined;

  const serviceItems = [
    { key: "", label: "Tous", count: [...counts.values()].reduce((a, b) => a + b, 0) },
    ...services.map((s) => ({
      key: s.key,
      label: shortServiceLabel(s.key, s.label),
      full: s.label,
      count: counts.get(s.key) ?? 0,
    })),
    ...(counts.get("") ? [{ key: UNCLASSIFIED, label: "À classer", count: counts.get("")! }] : []),
  ];

  return (
    <section className="flex flex-col gap-4" aria-label="Contacts">
      <div className="flex flex-col gap-2">
        <form
          role="search"
          action="/ressources"
          className={cn(TOOLBAR, "md:flex-nowrap")}
          onSubmit={(e) => {
            e.preventDefault();
            const first = hits[0];
            if (!browsing && first) open(first.entry.id);
          }}
        >
          <label className="relative min-w-0 basis-full md:flex-1 md:basis-auto">
            <span className="sr-only">Rechercher dans l&apos;annuaire</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              ref={inputRef}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  const first = rowButtons()[0];
                  if (first) {
                    e.preventDefault();
                    first.focus();
                  }
                } else if (e.key === "Escape" && query) {
                  e.preventDefault();
                  setQuery("");
                }
              }}
              placeholder="Nom, gare, numéro, fonction…"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={80}
              aria-describedby="annuaire-count"
              aria-controls="annuaire-results"
              data-testid="directory-search"
              className="pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Effacer la recherche"
                className="absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : (
              <Kbd
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 md:inline-flex"
              >
                /
              </Kbd>
            )}
          </label>
          <div className="flex min-w-0 basis-full items-center gap-2 md:basis-auto">
            <label className="w-full min-w-0 flex-1 md:w-56 md:flex-none">
              <span className="sr-only">Zone</span>
              <MultiSelect
                label="Zones"
                options={zoneOptions}
                values={zoneValues}
                onValuesChange={(vals) => {
                  const next = vals.map((v) => (v === NO_ZONE_OPT ? NO_ZONE : v));
                  setZoneFilter(
                    next.length === 0 || next.length === zoneOptions.length ? null : next,
                  );
                }}
                allLabel="Toutes les zones"
                noun="zone"
                summary={zoneSummary}
                searchable
                data-testid="directory-zone"
              />
            </label>
            {mine.length ? (
              <FilterChip
                pressed={zoneIsDefault}
                onClick={() => setZoneFilter(zoneIsDefault ? null : defaultZones)}
                data-testid="directory-mine"
                title="Zones de tes districts du jour, et contacts sans zone"
              >
                Mes zones
              </FilterChip>
            ) : null}
          </div>
          <SegmentedNav
            label="Affichage"
            className="min-w-0 flex-1 md:flex-none"
            data-testid="directory-view"
            items={[
              {
                label: "Par zone",
                current: view === "zone",
                onSelect: () => setView("zone"),
                testId: "view-zone",
              },
              {
                label: "Par service",
                current: view === "service",
                onSelect: () => setView("service"),
                testId: "view-service",
              },
            ]}
          />
          {canWrite ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              onClick={() => setCreateOpen(true)}
              data-testid="contact-new"
              data-shortcut="new"
              aria-keyshortcuts="n"
              aria-label="Nouveau contact"
            >
              <Plus aria-hidden />
              <span className="hidden lg:inline">Nouveau contact</span>
            </Button>
          ) : null}
        </form>
        <SegmentedNav
          label="Service"
          scroll
          className="md:flex-wrap"
          data-testid="directory-service"
          items={serviceItems.map((it) => ({
            label: it.label,
            count: it.count,
            current: service === it.key,
            onSelect: () => setService(it.key),
            testId: `service-${it.key === UNCLASSIFIED ? "a-classer" : it.key || "tous"}`,
            ariaLabel:
              "full" in it && it.full !== it.label ? `${it.full} (${it.count})` : undefined,
          }))}
        />
        <ListStatus
          count={
            <span id="annuaire-count" aria-live="polite" data-testid="contacts-count">
              {browsing ? (
                <>
                  <span className="font-medium text-fg tabular">{hits.length}</span>{" "}
                  {pl(hits.length, "contact")}
                  {filtered || zoneFilter !== null ? (
                    <>
                      {" "}
                      sur <span className="tabular">{rows.length}</span>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="font-medium text-fg tabular">{hits.length}</span>{" "}
                  {pl(hits.length, "résultat")} sur <span className="tabular">{rows.length}</span>
                </>
              )}
            </span>
          }
          sync={
            outside > 0 ? (
              <Button
                variant="link"
                size="sm"
                className="text-small"
                onClick={() => setZoneFilter(null)}
                data-testid="directory-outside"
              >
                {outside} {pl(outside, "autre")} hors de ces zones
              </Button>
            ) : (
              <span className="max-md:hidden">
                Accents et fautes tolérés · abréviation de gare (FMS) · numéro avec ou sans +32 ·{" "}
                <Kbd>↓</Kbd> parcourt, <Kbd>Entrée</Kbd> ouvre le premier
              </span>
            )
          }
          live={
            !browsing || filtered ? (
              <Button variant="link" size="sm" className="text-small" onClick={clearAll}>
                Tout effacer
              </Button>
            ) : undefined
          }
        />
      </div>

      <div
        ref={listRef}
        id="annuaire-results"
        data-hl-scope="annuaire"
        onKeyDown={onListKey}
        className="flex flex-col gap-6"
      >
        <LiveHighlight scope="annuaire" sigs={updated} swap={false} />
        {rows.length === 0 ? (
          <EmptyState
            framed
            title="Annuaire vide"
            description="Aucun contact n'a encore été ajouté."
          />
        ) : hits.length === 0 ? (
          <EmptyState
            framed
            icon={<Search className="size-6" />}
            title={
              browsing
                ? "Aucun contact pour ces filtres"
                : `Aucun résultat pour « ${q.raw.trim()} »`
            }
            description={
              outside
                ? `${outside} ${pl(outside, "contact")} hors des zones choisies.`
                : browsing
                  ? "Choisis une autre zone ou un autre service."
                  : "Essaie une partie du nom, l'abréviation de la gare (FMS), quelques chiffres du numéro ou la fonction (PACO, SPI…)."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {suggestion ? (
                  <Button variant="secondary" onClick={() => setQuery(suggestion)}>
                    Chercher « {suggestion} »
                  </Button>
                ) : null}
                {filtered || zoneFilter !== null ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setService("");
                      setZoneFilter(null);
                    }}
                  >
                    Chercher dans tout l&apos;annuaire
                  </Button>
                ) : null}
              </div>
            }
          />
        ) : (
          <>
            {showShortcuts ? (
              <div className="grid gap-6 xl:grid-cols-2">
                {favEntries.length ? (
                  <RowSection
                    title="Favoris"
                    icon={<Star aria-hidden className="size-4 fill-current text-accent" />}
                    testId="directory-favorites"
                  >
                    {favEntries.map((e) => (
                      <ContactRow
                        key={e.id}
                        entry={e}
                        via={[]}
                        showZone
                        showService
                        {...rowProps}
                      />
                    ))}
                  </RowSection>
                ) : null}
                {recentEntries.length ? (
                  <RowSection
                    title="Consultés récemment"
                    icon={<Clock aria-hidden className="size-4 text-fg-muted" />}
                    testId="directory-recent"
                  >
                    {recentEntries.map((e) => (
                      <ContactRow
                        key={e.id}
                        entry={e}
                        via={[]}
                        showZone
                        showService
                        {...rowProps}
                      />
                    ))}
                  </RowSection>
                ) : null}
              </div>
            ) : null}

            {browsing ? (
              sections.map((sec) => (
                <section
                  key={sec.key || "_"}
                  aria-label={sec.label}
                  className="flex min-w-0 scroll-mt-28 flex-col gap-3"
                  data-testid="directory-section"
                  data-key={sec.key}
                >
                  <h2 className="flex items-center gap-2 text-body font-semibold text-fg">
                    {view === "zone" ? <ZoneMark color={sec.color} /> : null}
                    <span className="min-w-0 truncate">{sec.label}</span>
                    {sec.district ? (
                      <span className="text-small font-normal text-fg-muted">{sec.district}</span>
                    ) : null}
                    <span className="text-small font-normal text-fg-subtle tabular">
                      {sec.count}
                    </span>
                  </h2>
                  {sec.groups.map((g) => (
                    <RowSection
                      key={g.key || "_"}
                      title={g.label}
                      count={g.count}
                      testId="directory-group"
                      level={3}
                      icon={
                        view === "service" ? (
                          <ZoneMark color={zoneMap.get(g.key)?.color} />
                        ) : undefined
                      }
                    >
                      {g.items.map((it) => {
                        if (it.kind === "contact")
                          return (
                            <ContactRow key={it.entry.id} entry={it.entry} via={[]} {...rowProps} />
                          );
                        const fk = `${view}|${sec.key}|${g.key}|${it.fn}`;
                        const isOpen = expanded.has(fk);
                        return (
                          <Fragment key={fk}>
                            <FoldRow
                              fn={it.fn}
                              count={it.entries.length}
                              open={isOpen}
                              onToggle={() => toggleFold(fk)}
                            />
                            {isOpen
                              ? it.entries.map((e) => (
                                  <ContactRow key={e.id} entry={e} via={[]} nested {...rowProps} />
                                ))
                              : null}
                          </Fragment>
                        );
                      })}
                    </RowSection>
                  ))}
                </section>
              ))
            ) : (
              <RowSection title="Résultats" hideTitle testId="directory-results">
                {hits.map((h) => (
                  <ContactRow
                    key={h.entry.id}
                    entry={h.entry as Row}
                    via={h.via}
                    showZone
                    showService
                    {...rowProps}
                  />
                ))}
              </RowSection>
            )}
          </>
        )}
      </div>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setDetail(null);
            wanted.current = null;
          }
        }}
        eyebrow="Annuaire"
        title={detailEntry ? contactTitle(detailEntry) : (shown?.name ?? "Contact")}
        description={
          detailEntry
            ? [
                serviceMap.get(detailEntry.service)?.label,
                detailEntry.zone ? zoneLabel(detailEntry.zone, zoneMap) : "",
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      >
        {detailEntry ? (
          <ContactPanel
            entry={detailEntry}
            labels={labels}
            detail={shown}
            favorite={favorites.includes(detailEntry.id)}
            onToggleFav={() => void toggleFav(detailEntry.id)}
            onTouch={() => touch(detailEntry.id)}
          >
            {canUpdate || canDelete ? (
              <ContactActions
                contact={shown ?? contactOf(detailEntry)}
                canUpdate={canUpdate}
                canDelete={canDelete}
                facets={facets}
                onSaved={() => {
                  void load(detailEntry.id);
                  router.refresh();
                }}
                onDeleted={() => {
                  setOpenId(null);
                  setDetail(null);
                  router.refresh();
                }}
              />
            ) : null}
          </ContactPanel>
        ) : (
          <p className="text-body text-fg-muted">
            Fiche introuvable : elle a peut-être été supprimée.
          </p>
        )}
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          title="Nouveau contact"
          description="Les contacts proches sont signalés avant d'enregistrer."
        >
          <ContactForm
            id={null}
            initial={{
              ...toInput(null),
              service: service && service !== UNCLASSIFIED ? service : "",
            }}
            facets={facets}
            onOpen={(id) => {
              setCreateOpen(false);
              open(id);
            }}
            onSaved={(id) => {
              setCreateOpen(false);
              open(id);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Repère de couleur d'une zone (couleur de la carte SPI ; neutre si la zone est inconnue). */
function ZoneMark({ color }: { color?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-pill border border-border-strong bg-surface-3"
      style={color ? { backgroundColor: color, borderColor: color } : undefined}
    />
  );
}

/** Fonction repliée (plus de 3 contacts : « SPI (8) ») ; ouverte, ses contacts suivent en retrait. */
function FoldRow({
  fn,
  count,
  open,
  onToggle,
}: {
  fn: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="border-b border-border last:border-b-0" data-testid="contact-fold">
      <button
        type="button"
        data-row-open
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-2 text-left hover:bg-surface-2 focus-visible:outline-1 focus-visible:outline-accent md:px-3"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-4 shrink-0 text-fg-muted transition-transform", open && "rotate-90")}
        />
        <FunctionBadge fn={fn} />
        <span className="text-small text-fg-muted">
          <span className="tabular">{count}</span> {pl(count, "contact")}
        </span>
      </button>
    </li>
  );
}

function FunctionBadge({ fn, segs }: { fn: string; segs?: Segment[] }) {
  return (
    <span
      className="inline-flex h-6 max-w-40 shrink-0 items-center truncate rounded-control border border-border bg-surface-2 px-1.5 text-label font-semibold text-fg"
      data-testid="contact-function-badge"
    >
      {segs ? <Hl segs={segs} /> : fn}
    </span>
  );
}

const contactOf = (e: Row): Contact => ({
  id: e.id,
  name: e.name,
  phone: e.phone,
  email: e.email,
  service: e.service,
  function: e.function,
  zone: e.zone,
  category: e.category,
  group: e.group,
  note: e.note,
  author: "",
  updated: "",
});

type Labels = {
  services: ReadonlyMap<string, DirectoryService>;
  zones: ReadonlyMap<string, DirectoryZone>;
};

function Hl({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.hit ? (
          <mark
            key={i}
            className="rounded-[min(var(--r-control),2px)] bg-[color-mix(in_oklab,var(--warn)_30%,transparent)] text-fg"
          >
            {s.text}
          </mark>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}

function RowSection({
  title,
  count,
  icon,
  hideTitle,
  testId,
  level = 2,
  children,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
  hideTitle?: boolean;
  testId?: string;
  level?: 2 | 3;
  children: React.ReactNode;
}) {
  const H = level === 3 ? "h3" : "h2";
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      {hideTitle ? null : (
        <H className="flex items-center gap-2 text-small font-medium text-fg-muted">
          {icon}
          {title}
          {count != null ? <span className="tabular text-fg-subtle">{count}</span> : null}
        </H>
      )}
      <ul className="overflow-hidden rounded-box border border-(--card-frame) bg-surface shadow-rest">
        {children}
      </ul>
    </section>
  );
}

/**
 * Liens d'appel (comme `PhoneLink`) : `tel:` au format international (Genesys Cloud sur poste fixe, téléphone sur mobile) ;
 * si l'agent a choisi Etrali dans « Affichage », le clic sur poste fixe ouvre `etrali:` (choix lu au clic : pas d'écart
 * d'hydratation).
 */
function callHrefs(phone: string) {
  const n = dialable(phone);
  return n
    ? { desk: `tel:${e164(phone)}`, etrali: `etrali:${n}`, mobile: `tel:${e164(phone)}` }
    : null;
}

function deskCall(e: React.MouseEvent<HTMLAnchorElement>, etrali: string) {
  if (document.documentElement.dataset.telephony === "etrali") {
    e.preventDefault();
    window.location.href = etrali;
  }
}

function ContactRow({
  entry,
  via,
  q,
  labels,
  favorites,
  selectedId,
  onOpen,
  onToggleFav,
  onTouch,
  showZone = false,
  showService = false,
  nested = false,
}: {
  entry: Row;
  via: Hit["via"];
  q: Query;
  labels: Labels;
  favorites: string[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onToggleFav: (id: string) => void;
  onTouch: (id: string) => void;
  /** La vue ne donne pas la zone / le service (recherche, favoris) : ils s'affichent sous le nom. */
  showZone?: boolean;
  showService?: boolean;
  /** Contact d'une fonction repliée, ouverte : en retrait. */
  nested?: boolean;
}) {
  const fav = favorites.includes(entry.id);
  const href = entry.phone ? callHrefs(entry.phone) : null;
  const { copied, copy } = useCopy();
  const title = contactTitle(entry);
  const meta = [
    showService ? (labels.services.get(entry.service)?.label ?? "") : "",
    showZone && entry.zone ? zoneLabel(entry.zone, labels.zones) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const alias = via.includes("alias")
    ? entry.aliases.find((a) => /^[A-Z0-9]{2,6}$/.test(a))
    : undefined;
  const phoneSegs = highlightPhone(entry.phone, q);
  // Badge = fonction, sauf si le nom la contient déjà (« PACO Mons » reste tel quel) : « PACO » + « Mons ».
  const badge = entry.function && title !== entry.name ? entry.function : "";
  return (
    <li
      data-testid="contact-row"
      data-hl={entry.id}
      className={cn(
        "flex items-center gap-1 border-b border-border px-1 last:border-b-0 hover:bg-surface-2 md:gap-2 md:px-2",
        nested && "pl-4 md:pl-8",
        selectedId === entry.id && "bg-accent-soft hover:bg-accent-soft",
      )}
    >
      <button
        type="button"
        onClick={() => onToggleFav(entry.id)}
        aria-pressed={fav}
        aria-label={fav ? `Retirer ${title} des favoris` : `Ajouter ${title} aux favoris`}
        title={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
        data-testid="contact-fav"
        className={cn(
          "grid size-11 shrink-0 cursor-pointer place-items-center rounded-control md:size-8",
          fav ? "text-accent" : "text-fg-subtle hover:text-fg",
        )}
      >
        <Star aria-hidden className={cn("size-4", fav && "fill-current")} />
      </button>
      <button
        type="button"
        data-row-open
        onClick={() => onOpen(entry.id)}
        className="flex min-h-12 min-w-0 flex-1 cursor-pointer flex-col justify-center py-1.5 text-left focus-visible:outline-1 focus-visible:outline-accent md:min-h-11"
      >
        <span className="flex min-w-0 items-center gap-2">
          {badge ? <FunctionBadge fn={badge} segs={highlightText(badge, q)} /> : null}
          <span className="truncate text-body font-medium text-fg">
            <Hl segs={highlightText(entry.name, q)} />
          </span>
          {alias ? (
            <span className="shrink-0 rounded-control border border-border bg-surface-2 px-1.5 font-mono text-label text-fg-muted">
              {alias}
            </span>
          ) : null}
        </span>
        {meta ? (
          <span className="truncate text-small text-fg-muted" data-testid="contact-meta">
            <Hl segs={highlightText(meta, q)} />
          </span>
        ) : null}
        {via.includes("note") && entry.note ? (
          <span className="truncate text-small text-fg-muted">
            <Hl segs={highlightText(entry.note, q)} />
          </span>
        ) : null}
        {via.includes("email") && entry.email ? (
          <span className="truncate text-small text-fg-muted">
            <Hl segs={highlightText(entry.email, q)} />
          </span>
        ) : null}
        {entry.phone ? (
          <span className="font-mono text-small text-fg tabular md:hidden">
            <Hl segs={phoneSegs} />
          </span>
        ) : null}
      </button>
      {/* Desktop : numéro lisible et appelable, copie, e-mail. */}
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        {href ? (
          <a
            href={href.desk}
            onClick={(e) => {
              deskCall(e, href.etrali);
              onTouch(entry.id);
            }}
            className="inline-flex h-8 w-48 items-center gap-2 rounded-control px-2 font-mono text-body text-fg tabular hover:bg-surface hover:underline"
            aria-label={`Appeler ${title} au ${entry.phone}`}
            data-testid="contact-call"
          >
            <Phone aria-hidden className="size-4 shrink-0 text-fg-muted" />
            <span className="truncate">
              <Hl segs={phoneSegs} />
            </span>
          </a>
        ) : (
          <span className="w-48 px-2 text-small text-fg-subtle">
            {entry.phone || "Pas de numéro"}
          </span>
        )}
        <button
          type="button"
          disabled={!entry.phone}
          onClick={() => {
            void copy(entry.phone);
            onTouch(entry.id);
          }}
          aria-label={copied ? "Numéro copié" : `Copier le numéro de ${title}`}
          title="Copier le numéro"
          data-testid="contact-copy"
          className="grid size-8 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface hover:text-fg disabled:invisible"
        >
          <CopyIcon copied={copied} />
          <span className="sr-only" aria-live="polite">
            {copied ? "Copié dans le presse-papiers" : ""}
          </span>
        </button>
        {entry.email ? (
          <a
            href={`mailto:${entry.email}`}
            onClick={() => onTouch(entry.id)}
            aria-label={`Écrire à ${entry.email}`}
            title={entry.email}
            className="grid size-8 place-items-center rounded-control text-fg-muted hover:bg-surface hover:text-fg"
          >
            <Mail aria-hidden className="size-4" />
          </a>
        ) : (
          <span aria-hidden className="size-8" />
        )}
      </div>
      {/* Mobile : appel direct au pouce. */}
      {href ? (
        <a
          href={href.mobile}
          onClick={() => onTouch(entry.id)}
          aria-label={`Appeler ${title} au ${entry.phone}`}
          className="mr-1 grid size-11 shrink-0 place-items-center rounded-control border border-border-strong text-fg md:hidden"
          data-testid="contact-call-mobile"
        >
          <Phone aria-hidden className="size-5" />
        </a>
      ) : null}
    </li>
  );
}

function ContactPanel({
  entry,
  labels,
  detail,
  favorite,
  onToggleFav,
  onTouch,
  children,
}: {
  entry: Row;
  labels: Labels;
  detail: Contact | null;
  favorite: boolean;
  onToggleFav: () => void;
  onTouch: () => void;
  children?: React.ReactNode;
}) {
  const href = entry.phone ? callHrefs(entry.phone) : null;
  const phoneCopy = useCopy();
  const mailCopy = useCopy();
  const abbr = entry.aliases.filter((a) => /^[A-Z0-9]{2,6}$/.test(a));
  return (
    <div className="flex flex-col gap-5" data-testid="contact-panel">
      {entry.phone ? (
        <div className="flex flex-col gap-3 rounded-box border border-border bg-surface-2 p-4">
          <span className="text-small text-fg-muted">Téléphone</span>
          <span
            className="font-mono text-h3 text-fg tabular select-all"
            data-testid="contact-panel-phone"
          >
            {entry.phone}
          </span>
          <div className="flex flex-wrap gap-2">
            {href ? (
              <>
                <Button asChild variant="primary" className="hidden md:inline-flex">
                  <a
                    href={href.desk}
                    onClick={(e) => {
                      deskCall(e, href.etrali);
                      onTouch();
                    }}
                  >
                    <Phone aria-hidden /> Appeler
                  </a>
                </Button>
                <Button asChild variant="primary" className="flex-1 md:hidden">
                  <a href={href.mobile} onClick={onTouch}>
                    <Phone aria-hidden /> Appeler
                  </a>
                </Button>
              </>
            ) : null}
            <Button
              variant="secondary"
              className={cn("flex-1 md:flex-none", phoneCopy.copied && "border-ok/60")}
              onClick={() => {
                void phoneCopy.copy(entry.phone);
                onTouch();
              }}
            >
              <CopyIcon copied={phoneCopy.copied} />
              {phoneCopy.copied ? "Copié" : "Copier le numéro"}
              <span className="sr-only" aria-live="polite">
                {phoneCopy.copied ? "Numéro copié dans le presse-papiers" : ""}
              </span>
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-body text-fg-muted">Pas de numéro de téléphone.</p>
      )}
      {entry.email ? (
        <div className="flex flex-col gap-2">
          <span className="text-small text-fg-muted">E-mail</span>
          <a className="link break-all" href={`mailto:${entry.email}`} onClick={onTouch}>
            {entry.email}
          </a>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <a href={`mailto:${entry.email}`} onClick={onTouch}>
                <Mail aria-hidden className="size-4" /> Écrire
              </a>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className={cn(mailCopy.copied && "border-ok/60")}
              onClick={() => void mailCopy.copy(entry.email)}
            >
              <CopyIcon copied={mailCopy.copied} />
              {mailCopy.copied ? "Copiée" : "Copier l'adresse"}
            </Button>
          </div>
        </div>
      ) : null}
      <div>
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={favorite}
          onClick={onToggleFav}
          data-testid="contact-panel-fav"
        >
          <Star aria-hidden className={cn("size-4", favorite && "fill-current text-accent")} />
          {favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
        <dt className="text-small text-fg-muted">Service</dt>
        <dd data-testid="contact-panel-service">
          {labels.services.get(entry.service)?.label ?? (entry.service || "À classer")}
        </dd>
        <dt className="text-small text-fg-muted">Fonction</dt>
        <dd>{entry.function || "—"}</dd>
        <dt className="text-small text-fg-muted">Zone</dt>
        <dd>{entry.zone ? zoneLabel(entry.zone, labels.zones) : "—"}</dd>
        {abbr.length ? (
          <>
            <dt className="text-small text-fg-muted">Gare</dt>
            <dd className="font-mono">{abbr.join(", ")}</dd>
          </>
        ) : null}
        {entry.note ? (
          <>
            <dt className="text-small text-fg-muted">Remarque</dt>
            <dd className="whitespace-pre-line">{entry.note}</dd>
          </>
        ) : null}
        {detail?.updated ? (
          <>
            <dt className="text-small text-fg-muted">Modifié</dt>
            <dd className="text-small text-fg-muted">
              {new Date(detail.updated).toLocaleDateString("fr-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Europe/Brussels",
              })}
              {detail.author ? ` par ${detail.author}` : ""}
            </dd>
          </>
        ) : null}
      </dl>
      {children}
    </div>
  );
}
