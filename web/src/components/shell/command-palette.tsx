"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Accessibility,
  Archive,
  ArrowRight,
  Building2,
  Bus,
  CalendarClock,
  Car,
  CornerDownLeft,
  FileText,
  KeyRound,
  Map as MapIcon,
  MapPin,
  MessageSquare,
  Monitor,
  Palette,
  Train,
  Route,
  ScrollText,
  Signpost,
  Sparkles,
  TrainFront,
  TrainTrack,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { saveUiPreferences } from "@/app/preferences-actions";
import { paletteSearch, type SearchGroup, type SearchHit } from "@/app/search-actions";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/misc";
import { THEMES, themeById, type ThemeChoice } from "@/design/tokens";
import type { PaletteGroupId } from "@/lib/search/palette";

import { CHANGELOG_LINK } from "@/navigation";

import { useShell } from "./shell-context";

/** Icône de chaque groupe de résultats. */
const HIT_ICON: Record<PaletteGroupId, LucideIcon> = {
  live: TrainFront,
  bus: Bus,
  taxi: Car,
  suppliers: Building2,
  archives: Archive,
  pmr: Accessibility,
  groups: Users,
  journal: MessageSquare,
  journee: CalendarClock,
  pn: Signpost,
  stations: MapPin,
  lines: TrainTrack,
  relations: Route,
  trains: Train,
  ptcar: MapIcon,
  contacts: UserRound,
  procedures: ScrollText,
  documents: FileText,
  ebp: MapIcon,
  team: Users,
  users: KeyRound,
};

/** Valeur cmdk d'un résultat : elle contient la saisie, cmdk ne masque donc pas un résultat venu du serveur. */
function hitValue(query: string, heading: string, h: SearchHit): string {
  return `${query} ${heading} ${h.label} ${h.meta} ${h.href}`;
}

/**
 * Palette ⌘K / Ctrl+K. Ne s'ouvre qu'avec le modificateur (corrige le bug v1 : un « K » tapé dans un champ
 * ouvrait la palette). Groupes : résultats de la recherche par module (`paletteSearch`, étendue à tous les modules le
 * 14 oct. 2026, selon les droits de l'agent), Créer, Aller à (modules et onglets), Administration, Affichage.
 */
export function CommandPalette() {
  const { modules, admin, actions, ui, setUi, paletteOpen, setPaletteOpen } = useShell();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, setPaletteOpen]);

  // Recherche dans les données de tous les modules, après 250 ms sans frappe.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchGroup[]>([]);
  // Résultat actif contrôlé : à l'arrivée des résultats, le premier (groupe le plus probable) est choisi, sinon cmdk
  // gardait un résultat de la saisie précédente encore présent (Entrée ouvrait la ligne au lieu de la gare).
  const [selected, setSelected] = useState("");
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return void setHits([]);
    let cancelled = false;
    const t = window.setTimeout(() => {
      void paletteSearch(q)
        .then((r) => {
          if (cancelled) return;
          setHits(r);
          const g = r[0];
          const first = g?.items[0];
          if (g && first) setSelected(hitValue(query, g.heading, first));
        })
        .catch(() => !cancelled && setHits([]));
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);
  useEffect(() => {
    if (!paletteOpen) setQuery("");
  }, [paletteOpen]);

  const go = (href: string) => {
    setPaletteOpen(false);
    router.push(href);
  };

  const setTheme = (theme: ThemeChoice) => {
    const next = { ...ui, theme };
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === "auto") delete root.dataset.scheme;
    else root.dataset.scheme = themeById(theme).scheme;
    setUi(next);
    setPaletteOpen(false);
    void saveUiPreferences(next);
  };

  return (
    <DialogPrimitive.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-0 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 overflow-hidden border border-border-strong bg-surface md:rounded-box data-[state=open]:animate-pop-in md:top-[12vh]"
        >
          <DialogPrimitive.Title className="sr-only">Palette de commandes</DialogPrimitive.Title>
          <Command label="Palette de commandes" loop value={selected} onValueChange={setSelected}>
            <CommandInput
              placeholder="Gare, train, IC14, L.96, bon, agent, procédure… ou aller à"
              autoFocus
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[min(60dvh,26rem)]">
              <CommandEmpty>Aucun résultat</CommandEmpty>
              {hits.map((g) => {
                const Icon = HIT_ICON[g.id];
                return (
                  <CommandGroup
                    key={g.id}
                    heading={g.heading}
                    data-testid={`palette-group-${g.id}`}
                  >
                    {g.items.map((h, i) => (
                      <CommandItem
                        key={`${i}-${h.href}`}
                        value={hitValue(query, g.heading, h)}
                        onSelect={() => go(h.href)}
                      >
                        <Icon /> <span className="min-w-0 flex-1 truncate">{h.label}</span>
                        {h.meta ? (
                          <span className="max-w-[45%] shrink-0 truncate text-right text-small text-fg-muted">
                            {h.meta}
                          </span>
                        ) : null}
                      </CommandItem>
                    ))}
                    {g.more ? (
                      <CommandItem
                        value={`${query} ${g.heading} voir tout ${g.more}`}
                        onSelect={() => go(g.more!)}
                        className="text-fg-muted"
                      >
                        <ArrowRight /> Voir tout ({g.heading.split(" › ").pop()})
                      </CommandItem>
                    ) : null}
                  </CommandGroup>
                );
              })}
              {actions.length > 0 ? (
                <CommandGroup heading="Créer">
                  {actions.map((a) => (
                    <CommandItem
                      key={a.href}
                      value={`créer ${a.label}`}
                      onSelect={() => go(a.href)}
                    >
                      <a.icon /> {a.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Aller à">
                {modules.flatMap((m) =>
                  m.tabs.length === 0
                    ? [
                        <CommandItem key={m.href} value={m.label} onSelect={() => go(m.href)}>
                          <m.icon /> {m.label}
                        </CommandItem>,
                      ]
                    : m.tabs.map((t) => (
                        <CommandItem
                          key={t.href}
                          value={`${m.label} ${t.label} ${(t.keywords ?? []).join(" ")}`}
                          onSelect={() => go(t.href)}
                        >
                          <m.icon /> <span className="text-fg-muted">{m.label}</span>
                          <span aria-hidden className="text-fg-muted">
                            ›
                          </span>
                          {t.label}
                        </CommandItem>
                      )),
                )}
                <CommandItem
                  value={`${CHANGELOG_LINK.label} ${CHANGELOG_LINK.keywords.join(" ")}`}
                  onSelect={() => go(CHANGELOG_LINK.href)}
                >
                  <Sparkles /> {CHANGELOG_LINK.label}
                </CommandItem>
              </CommandGroup>
              {admin ? (
                <CommandGroup heading="Administration">
                  {admin.tabs.map((t) => (
                    <CommandItem
                      key={t.href}
                      value={`administration ${t.label}`}
                      onSelect={() => go(t.href)}
                    >
                      <admin.icon /> {t.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              <CommandGroup heading="Affichage">
                <CommandItem value="thème automatique" onSelect={() => setTheme("auto")}>
                  <Monitor /> Thème automatique
                </CommandItem>
                {THEMES.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`thème ${t.label}`}
                    onSelect={() => setTheme(t.id)}
                  >
                    <Palette /> Thème {t.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="hidden items-center gap-3 border-t border-border px-3 py-2 text-small text-fg-muted md:flex">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> naviguer
              </span>
              <span className="flex items-center gap-1">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>{" "}
                ouvrir
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Échap</Kbd> fermer
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Kbd>/</Kbd> recherche de la page · <Kbd>N</Kbd> nouveau
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
