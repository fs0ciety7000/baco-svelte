"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bus, CornerDownLeft, MapPin, Monitor, Palette, TrainFront, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { saveUiPreferences } from "@/app/preferences-actions";
import { paletteSearch, type SearchHit } from "@/app/search-actions";
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

import { useShell } from "./shell-context";

/**
 * Palette ⌘K / Ctrl+K. Ne s'ouvre qu'avec le modificateur (corrige le bug v1 : un « K » tapé dans un champ
 * ouvrait la palette). Groupes : Créer, Aller à (modules et onglets), Administration, Affichage.
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

  // Recherche dans les données (contacts, bons, PtCar, trains), après 250 ms sans frappe.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return void setHits([]);
    let cancelled = false;
    const t = window.setTimeout(() => {
      void paletteSearch(q)
        .then((r) => !cancelled && setHits(r))
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
          <Command label="Palette de commandes" loop>
            <CommandInput
              placeholder="Rechercher un contact, un bon, une gare, un train… ou aller à"
              autoFocus
              value={query}
              onValueChange={setQuery}
            />
            <CommandList className="max-h-[min(60dvh,26rem)]">
              <CommandEmpty>Aucun résultat</CommandEmpty>
              {hits.length > 0 ? (
                <CommandGroup heading="Résultats">
                  {hits.map((h, i) => {
                    const Icon = { contact: UserRound, bus: Bus, ptcar: MapPin, train: TrainFront }[
                      h.kind
                    ];
                    return (
                      <CommandItem
                        key={`${i}-${h.href}`}
                        // La valeur contient la saisie : cmdk ne masque pas un résultat venu du serveur.
                        value={`${query} ${h.label} ${h.meta} ${h.href}`}
                        onSelect={() => go(h.href)}
                      >
                        <Icon /> <span className="truncate">{h.label}</span>
                        {h.meta ? (
                          <span className="ml-auto truncate text-small text-fg-muted">
                            {h.meta}
                          </span>
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null}
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
