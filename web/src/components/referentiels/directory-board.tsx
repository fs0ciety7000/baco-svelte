"use client";

import { Clock, Mail, Phone, Plus, Search, Star, X } from "lucide-react";
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
} from "@/app/(app)/referentiels/actions";
import { CopyIcon, useCopy } from "@/components/pmr/copy";
import {
  ContactActions,
  ContactForm,
  toInput,
  type Facets,
} from "@/components/referentiels/contact-board";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { Input } from "@/components/ui/input";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { EmptyState, Kbd } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { dialable } from "@/lib/pmr/model";
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
import { cn, pl } from "@/lib/utils";
import type { Contact } from "@/server/data/referentiels";

// Annuaire (Ressources › Annuaire), refonte du 14 oct. 2026 (`docs/design/REFONTE-ANNUAIRE.md`) : l'agent au téléphone
// doit trouver un numéro en 3 secondes. Toutes les fiches (≈ 400) sont chargées une fois ; la recherche tourne dans le
// navigateur à chaque frappe (accents, fautes, mots dans le désordre, numéro, abréviation de gare), classée par
// pertinence et surlignée. Favoris et récents suivent le compte (`users.preferences.directory`). L'état (saisie,
// filtres, fiche ouverte) est recopié dans l'URL par `history.replaceState` (lien partageable, retour arrière).

type Initial = { q: string; category: string; zone: string; group: string; id: string };

const RECENT_SHOWN = 5;

export function DirectoryBoard({
  entries,
  facets,
  updated,
  initial,
  prefs,
  canWrite,
  canUpdate,
  canDelete,
}: {
  entries: DirectoryEntry[];
  facets: Facets;
  updated: Record<string, string>;
  initial: Initial;
  prefs: DirectoryPrefs;
  canWrite: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initial.q);
  const [category, setCategory] = useState(initial.category);
  const [zone, setZone] = useState(initial.zone);
  const [group, setGroup] = useState(initial.group);
  const [favorites, setFavorites] = useState(prefs.favorites);
  const [recent, setRecent] = useState(prefs.recent);
  const [openId, setOpenId] = useState<string | null>(initial.id || null);
  const [detail, setDetail] = useState<Contact | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wanted = useRef<string | null>(null);

  const index = useMemo(() => buildIndex(entries), [entries]);
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const deferred = useDeferredValue(query);
  const q = useMemo(() => parseQuery(deferred), [deferred]);
  const browsing = isEmptyQuery(q);
  const filtered = !!(category || zone || group);
  // Bonus de classement tirés des préférences au chargement : une étoile ou une fiche ouverte ne réordonne pas la liste
  // sous les yeux de l'agent.
  const hits = useMemo(
    () =>
      searchDirectory(index, q, {
        ...prefs,
        keep: (e) =>
          (!category || e.category === category) &&
          (!zone || e.zone === zone) &&
          (!group || e.group === group),
      }),
    [index, q, prefs, category, zone, group],
  );
  const suggestion = useMemo(
    () => (hits.length ? null : suggestQuery(index, q)),
    [hits.length, index, q],
  );
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) if (e.category) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [entries]);

  // État → URL (sans rendu serveur : `replaceState`, voir CLAUDE.md « Paramètre d'URL d'un panneau »).
  useEffect(() => {
    const t = window.setTimeout(() => {
      const url = new URL(window.location.href);
      const set = (k: string, v: string) =>
        v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
      set("q", query.trim());
      set("category", category);
      set("zone", zone);
      set("group", group);
      set("id", openId ?? "");
      url.searchParams.delete("page");
      if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, category, zone, group, openId]);

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

  const clearAll = () => {
    setQuery("");
    setCategory("");
    setZone("");
    setGroup("");
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

  const favEntries = favorites.map((id) => byId.get(id)).filter(Boolean) as DirectoryEntry[];
  const recentEntries = recent
    .map((id) => byId.get(id))
    .filter((e): e is DirectoryEntry => !!e && !favorites.includes(e.id))
    .slice(0, RECENT_SHOWN);
  const showShortcuts =
    browsing && !filtered && (favEntries.length > 0 || recentEntries.length > 0);

  const rowProps = {
    q,
    favorites,
    selectedId: openId,
    onOpen: open,
    onToggleFav: toggleFav,
    onTouch: touch,
  };
  const groups = useMemo(() => {
    if (!browsing) return [];
    const m = new Map<string, Hit[]>();
    for (const h of hits) {
      const g = h.entry.group || "Sans groupe";
      m.set(g, [...(m.get(g) ?? []), h]);
    }
    return [...m.entries()].sort(([a], [b]) =>
      a === "Sans groupe" ? 1 : b === "Sans groupe" ? -1 : a.localeCompare(b, "fr"),
    );
  }, [browsing, hits]);

  const detailEntry = openId ? byId.get(openId) : undefined;
  const shown = detail && detail.id === openId ? detail : null;

  return (
    <section className="flex flex-col gap-4" aria-label="Annuaire">
      <div className="flex flex-col gap-3">
        <form
          role="search"
          action="/referentiels"
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const first = hits[0];
            if (!browsing && first) open(first.entry.id);
          }}
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher dans l&apos;annuaire</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-fg-muted"
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
              className="h-12 pr-12 pl-11 text-body-lg [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Effacer la recherche"
                className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg"
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
          {canWrite ? (
            <Button
              type="button"
              variant="secondary"
              className="h-12 shrink-0"
              onClick={() => setCreateOpen(true)}
              data-testid="contact-new"
              data-shortcut="new"
              aria-keyshortcuts="n"
              aria-label="Nouveau contact"
            >
              <Plus aria-hidden />
              <span className="hidden sm:inline">Nouveau contact</span>
            </Button>
          ) : null}
        </form>
        <p className="-mt-1 hidden text-small text-fg-muted md:block">
          Accents et fautes de frappe tolérés · abréviation de gare (FMS) · numéro avec ou sans
          espaces ni +32 · <Kbd>↓</Kbd> pour parcourir les résultats, <Kbd>Entrée</Kbd> pour ouvrir
          le premier
        </p>

        {facets.categories.length ? (
          <ChipRow role="group" aria-label="Catégorie">
            <FilterChip pressed={!category} onClick={() => setCategory("")}>
              Toutes
            </FilterChip>
            {facets.categories.map((c) => (
              <FilterChip
                key={c}
                pressed={category === c}
                onClick={() => setCategory(category === c ? "" : c)}
              >
                {c}
                <span className="tabular text-fg-subtle">{catCounts.get(c) ?? 0}</span>
              </FilterChip>
            ))}
          </ChipRow>
        ) : null}

        <div className="grid grid-cols-2 items-center gap-2 md:flex md:flex-wrap">
          {facets.zones.length ? (
            <div className="min-w-0 md:w-52">
              <Select
                aria-label="Zone"
                label="Zone"
                clearable
                placeholder="Toutes les zones"
                value={zone}
                onValueChange={setZone}
                options={facets.zones.map((z) => ({ value: z, label: z }))}
                className="md:min-h-control-sm md:text-small"
              />
            </div>
          ) : null}
          {facets.groups.length ? (
            <div className="min-w-0 md:w-60">
              <Select
                aria-label="Groupe"
                label="Groupe"
                clearable
                placeholder="Tous les groupes"
                value={group}
                onValueChange={setGroup}
                options={facets.groups.map((g) => ({ value: g, label: g }))}
                className="md:min-h-control-sm md:text-small"
              />
            </div>
          ) : null}
          <div className="col-span-2 flex min-h-control-sm items-center gap-3 whitespace-nowrap md:ml-auto">
            <p
              id="annuaire-count"
              aria-live="polite"
              className="text-small text-fg-muted"
              data-testid="contacts-count"
            >
              {browsing && !filtered ? (
                <>
                  <span className="font-mono text-fg tabular">{entries.length}</span>{" "}
                  {pl(entries.length, "contact")}
                </>
              ) : (
                <>
                  <span className="font-mono text-fg tabular">{hits.length}</span>{" "}
                  {pl(hits.length, "résultat")} sur{" "}
                  <span className="tabular">{entries.length}</span>
                </>
              )}
            </p>
            {!browsing || filtered ? (
              <Button variant="link" size="sm" className="text-small" onClick={clearAll}>
                Tout effacer
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div
        ref={listRef}
        id="annuaire-results"
        data-hl-scope="annuaire"
        onKeyDown={onListKey}
        className="flex flex-col gap-6"
      >
        <LiveHighlight scope="annuaire" sigs={updated} swap={false} />
        {entries.length === 0 ? (
          <EmptyState title="Annuaire vide" description="Aucun contact n'a encore été ajouté." />
        ) : hits.length === 0 ? (
          <EmptyState
            icon={<Search className="size-6" />}
            title={
              browsing
                ? "Aucun contact pour ces filtres"
                : `Aucun résultat pour « ${q.raw.trim()} »`
            }
            description={
              browsing
                ? "Retire un filtre pour élargir la liste."
                : "Essaie une partie du nom, l'abréviation de la gare (FMS), quelques chiffres du numéro ou la fonction (dispatching, securail…)."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {suggestion ? (
                  <Button variant="secondary" onClick={() => setQuery(suggestion)}>
                    Chercher « {suggestion} »
                  </Button>
                ) : null}
                {filtered ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setCategory("");
                      setZone("");
                      setGroup("");
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
                      <ContactRow key={e.id} entry={e} via={[]} {...rowProps} />
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
                      <ContactRow key={e.id} entry={e} via={[]} {...rowProps} />
                    ))}
                  </RowSection>
                ) : null}
              </div>
            ) : null}

            {browsing ? (
              <>
                {groups.length > 1 ? (
                  <nav aria-label="Aller à un groupe">
                    <ChipRow className="md:flex-nowrap md:overflow-x-auto md:pb-1">
                      {groups.map(([g, list]) => (
                        <FilterChip key={g} asChild>
                          <a href={`#groupe-${slug(g)}`}>
                            {g}
                            <span className="tabular text-fg-subtle">{list.length}</span>
                          </a>
                        </FilterChip>
                      ))}
                    </ChipRow>
                  </nav>
                ) : null}
                {groups.map(([g, list]) => (
                  <RowSection
                    key={g}
                    id={`groupe-${slug(g)}`}
                    title={g}
                    count={list.length}
                    testId="directory-group"
                  >
                    {list.map((h) => (
                      <ContactRow
                        key={h.entry.id}
                        entry={h.entry}
                        via={h.via}
                        grouped
                        {...rowProps}
                      />
                    ))}
                  </RowSection>
                ))}
              </>
            ) : (
              <RowSection title="Résultats" hideTitle testId="directory-results">
                {hits.map((h) => (
                  <ContactRow key={h.entry.id} entry={h.entry} via={h.via} {...rowProps} />
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
        title={detailEntry?.name ?? shown?.name ?? "Contact"}
        description={
          detailEntry
            ? [detailEntry.category, detailEntry.zone].filter(Boolean).join(" · ")
            : undefined
        }
      >
        {detailEntry ? (
          <ContactPanel
            entry={detailEntry}
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
            initial={toInput(null)}
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

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "groupe";

const contactOf = (e: DirectoryEntry): Contact => ({
  id: e.id,
  name: e.name,
  phone: e.phone,
  email: e.email,
  category: e.category,
  zone: e.zone,
  group: e.group,
  note: e.note,
  author: "",
  updated: "",
});

function Hl({ segs }: { segs: Segment[] }) {
  return (
    <>
      {segs.map((s, i) =>
        s.hit ? (
          <mark
            key={i}
            className="rounded-[2px] bg-[color-mix(in_oklab,var(--warn)_30%,transparent)] text-fg"
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
  id,
  title,
  count,
  icon,
  hideTitle,
  testId,
  children,
}: {
  id?: string;
  title: string;
  count?: number;
  icon?: React.ReactNode;
  hideTitle?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className="flex min-w-0 scroll-mt-28 flex-col gap-2"
      data-testid={testId}
    >
      {hideTitle ? null : (
        <h2 className="flex items-center gap-2 text-small font-medium text-fg-muted">
          {icon}
          {title}
          {count != null ? <span className="tabular text-fg-subtle">{count}</span> : null}
        </h2>
      )}
      <ul className="overflow-hidden rounded-box border border-border bg-surface">{children}</ul>
    </section>
  );
}

/** Lien d'appel : softphone `etrali:` sur poste fixe, `tel:` sur mobile (décision du 8 oct. 2026, comme `PhoneLink`). */
function callHrefs(phone: string) {
  const n = dialable(phone);
  return n ? { desk: `etrali:${n}`, mobile: `tel:${n}` } : null;
}

function ContactRow({
  entry,
  via,
  q,
  favorites,
  selectedId,
  onOpen,
  onToggleFav,
  onTouch,
  grouped = false,
}: {
  entry: DirectoryEntry;
  via: Hit["via"];
  grouped?: boolean;
  q: Query;
  favorites: string[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onToggleFav: (id: string) => void;
  onTouch: (id: string) => void;
}) {
  const fav = favorites.includes(entry.id);
  const href = entry.phone ? callHrefs(entry.phone) : null;
  const { copied, copy } = useCopy();
  // Dans une section de groupe, le groupe n'est pas répété.
  const meta = [
    entry.category,
    grouped || entry.group === entry.category ? "" : entry.group,
    entry.zone,
  ]
    .filter(Boolean)
    .join(" · ");
  const alias = via.includes("alias")
    ? entry.aliases.find((a) => /^[A-Z0-9]{2,6}$/.test(a))
    : undefined;
  const phoneSegs = highlightPhone(entry.phone, q);
  return (
    <li
      data-testid="contact-row"
      data-hl={entry.id}
      className={cn(
        "flex items-center gap-1 border-b border-border px-1 last:border-b-0 hover:bg-surface-2 md:gap-2 md:px-2",
        selectedId === entry.id && "bg-accent-soft hover:bg-accent-soft",
      )}
    >
      <button
        type="button"
        onClick={() => onToggleFav(entry.id)}
        aria-pressed={fav}
        aria-label={fav ? `Retirer ${entry.name} des favoris` : `Ajouter ${entry.name} aux favoris`}
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
        className="flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col justify-center py-2 text-left focus-visible:outline-1 focus-visible:outline-accent md:min-h-12"
      >
        <span className="flex min-w-0 items-center gap-2">
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
          <span className="truncate text-small text-fg-muted">
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
            onClick={() => onTouch(entry.id)}
            className="inline-flex h-8 w-48 items-center gap-2 rounded-control px-2 font-mono text-body text-fg tabular hover:bg-surface hover:underline"
            aria-label={`Appeler ${entry.name} au ${entry.phone}`}
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
          aria-label={copied ? "Numéro copié" : `Copier le numéro de ${entry.name}`}
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
          aria-label={`Appeler ${entry.name} au ${entry.phone}`}
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
  detail,
  favorite,
  onToggleFav,
  onTouch,
  children,
}: {
  entry: DirectoryEntry;
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
                  <a href={href.desk} onClick={onTouch}>
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
          variant="ghost"
          className="border border-border"
          aria-pressed={favorite}
          onClick={onToggleFav}
          data-testid="contact-panel-fav"
        >
          <Star aria-hidden className={cn("size-4", favorite && "fill-current text-accent")} />
          {favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
        </Button>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
        <dt className="text-small text-fg-muted">Catégorie</dt>
        <dd>{entry.category || "—"}</dd>
        <dt className="text-small text-fg-muted">Groupe</dt>
        <dd>{entry.group || "—"}</dd>
        <dt className="text-small text-fg-muted">Zone</dt>
        <dd>{entry.zone || "—"}</dd>
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
