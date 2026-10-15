"use client";

import type * as React from "react";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { modColor } from "@/design/module-color";
import { ChevronDown, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";
import {
  activeModule,
  activeTab,
  CHANGELOG_LINK,
  tabGroups,
  type NavModule,
  type ShellCountKey,
} from "@/navigation";

import { CountNote, CountPill, useShellCount } from "./counts";
import { useShell } from "./shell-context";
import { useShellStatus } from "./shell-status";

/**
 * Barre latérale desktop (lot 3 du design v4, 15 oct. 2026) : sections titrées « Travail » (temps réel, à traiter) et
 * « Référence » (consultation), puis l'Administration (admin / sysop). Rail de 96 px (libellé sous l'icône) entre 768
 * et 1280 px, 232 px au-delà. Entrée active = carte (`--nav-on`, ombre de repos) + trait de 3 px de la couleur du module
 * (l'accent hors des thèmes « taxonomie »). Compteurs en pastilles teintées selon leur nature. En pied : carte « État
 * des flux » (temps réel, DICOS, iRail) et Nouveautés. Fonds et cartes viennent du thème (`--nav-*`, `tokens.ts`) : les
 * « Autres thèmes » gardent leur barre d'origine (surface, sans carte ni ombre pour la forme « angle »).
 */

const SECTIONS: { id: NonNullable<NavModule["section"]>; label: string }[] = [
  { id: "travail", label: "Travail" },
  { id: "reference", label: "Référence" },
];

/** Classes communes d'une entrée (module ou page d'administration), selon l'état actif. */
function itemClass(active: boolean, extra?: string) {
  return cn(
    "relative rounded-control text-fg-muted transition-colors outline-none hover:bg-surface-3 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent",
    active && "bg-nav-on text-fg shadow-rest hover:bg-nav-on",
    extra,
  );
}

/** Trait de l'entrée active, collé au bord de la barre (3 px, arrondi selon le thème). */
function ActiveMark({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      aria-hidden
      className="absolute top-2 bottom-2 -left-2 w-[3px] rounded-r-pill bg-[var(--mod,var(--accent))]"
    />
  );
}

const ADMIN_OPEN_KEY = "csm-sidebar-admin";

/**
 * Section « Administration » (admin / sysop, 14 oct. 2026) : pages en accès direct groupées (Comptes, Supervision,
 * Réglages) dès 1280 px, repliable (mémorisé par navigateur) ; sur le rail (768–1279 px), une entrée unique qui ouvre
 * un menu latéral avec les mêmes pages.
 */
function AdminSection({ admin, pathname }: { admin: NavModule; pathname: string }) {
  const onAdmin = pathname === admin.href || pathname.startsWith(`${admin.href}/`);
  const current = onAdmin ? activeTab(pathname, admin) : undefined;
  const groups = tabGroups(admin);
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(ADMIN_OPEN_KEY) === "0") setOpen(false);
    } catch {
      /* stockage indisponible : section ouverte */
    }
  }, []);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(ADMIN_OPEN_KEY, next ? "1" : "0");
    } catch {
      /* rien */
    }
  };
  const Icon = admin.icon;
  const show = open || onAdmin;

  return (
    <div
      className="mx-2 border-t border-border py-2"
      data-testid="sidebar-admin"
      style={{ "--mod": modColor(admin.id) } as React.CSSProperties}
    >
      {/* Rail : une entrée, menu latéral. */}
      <Menu.Root>
        <Menu.Trigger
          aria-current={onAdmin ? "page" : undefined}
          className={itemClass(
            onAdmin,
            "flex w-full cursor-pointer flex-col items-center gap-1 px-1 py-2 text-small xl:hidden",
          )}
        >
          <ActiveMark on={onAdmin} />
          <Icon className={cn("size-5", onAdmin && "text-(--mod)")} aria-hidden />
          <span className="text-center leading-tight">Admin</span>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            side="right"
            align="start"
            sideOffset={8}
            className="z-50 w-60 rounded-box border border-border bg-surface py-1 shadow-float data-[state=open]:animate-fade-in"
          >
            {groups.map((g, i) => (
              <Menu.Group key={g.label}>
                {i > 0 ? <Menu.Separator className="my-1 h-px bg-border" /> : null}
                <Menu.Label className="label-mono px-3 py-1 text-fg-subtle">{g.label}</Menu.Label>
                {g.tabs.map((t) => {
                  const TabIcon = t.icon ?? Icon;
                  return (
                    <Menu.Item key={t.href} asChild>
                      <Link
                        href={t.href}
                        aria-current={current?.href === t.href ? "page" : undefined}
                        className={cn(
                          "flex h-control cursor-pointer items-center gap-3 px-3 text-body text-fg outline-none select-none data-[highlighted]:bg-surface-3",
                          current?.href === t.href && "font-medium text-accent",
                        )}
                      >
                        <TabIcon className="size-4 text-fg-muted" aria-hidden /> {t.label}
                      </Link>
                    </Menu.Item>
                  );
                })}
              </Menu.Group>
            ))}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {/* Barre large : groupes titrés, pages en accès direct. */}
      <div className="hidden xl:block">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={show}
          aria-controls="sidebar-admin-pages"
          disabled={onAdmin}
          className="flex h-9 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-small font-medium text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default"
        >
          <Icon className={cn("size-4", onAdmin && "text-(--mod)")} aria-hidden />
          Administration
          {!onAdmin ? (
            <ChevronDown
              aria-hidden
              className={cn("ml-auto size-4 transition-transform", !show && "-rotate-90")}
            />
          ) : null}
        </button>
        {show ? (
          <div id="sidebar-admin-pages" className="flex flex-col gap-1.5 pt-1">
            {groups.map((g) => (
              <div key={g.label} role="group" aria-label={g.label}>
                <p className="label-mono px-3 pb-0.5 text-fg-subtle">{g.label}</p>
                <ul className="flex flex-col gap-0.5">
                  {g.tabs.map((t) => {
                    const on = current?.href === t.href;
                    const TabIcon = t.icon ?? Icon;
                    return (
                      <li key={t.href}>
                        <Link
                          href={t.href}
                          aria-current={on ? "page" : undefined}
                          data-testid={`sidebar-admin-${t.href.split("/").pop()}`}
                          className={itemClass(
                            on,
                            "flex h-9 items-center gap-3 px-3 text-body compact:h-8",
                          )}
                        >
                          <ActiveMark on={on} />
                          <TabIcon className={cn("size-4", on && "text-(--mod)")} aria-hidden />
                          {t.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Entrée d'un module : icône, libellé, compteur teinté (annoncé par une description). */
function ModuleLink({ module: m, active }: { module: NavModule; active: boolean }) {
  const countKey = m.id as ShellCountKey;
  const value = useShellCount(m.id);
  const noteId = useId();
  const Icon = m.icon;
  return (
    <li>
      <Link
        href={m.href}
        aria-current={active ? "page" : undefined}
        aria-describedby={value ? noteId : undefined}
        // Couleur du module (thèmes « taxonomie » comme Craie ; ailleurs, l'accent).
        style={{ "--mod": modColor(m.id) } as React.CSSProperties}
        className={itemClass(
          active,
          "flex flex-col items-center gap-1 px-1 py-2 text-small xl:h-9 xl:flex-row xl:gap-3 xl:px-3 xl:py-0 xl:text-body xl:font-medium compact:xl:h-8",
        )}
      >
        <ActiveMark on={active} />
        <Icon
          className={cn("size-5 shrink-0 xl:size-[1.125rem]", active && "text-(--mod)")}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="text-center leading-tight">{m.label}</span>
        {value ? (
          <CountPill
            countKey={countKey}
            value={value}
            data-testid={`nav-count-${m.id}`}
            className="absolute top-1 right-1 xl:static xl:ml-auto"
          />
        ) : null}
      </Link>
      {value ? <CountNote id={noteId} countKey={countKey} value={value} /> : null}
    </li>
  );
}

function ago(iso: string, now: number): { text: string; stale: boolean } {
  const min = Math.max(0, Math.round((now - new Date(iso.replace(" ", "T")).getTime()) / 60_000));
  const text =
    min < 1 ? "à l'instant" : min < 60 ? `il y a ${min} min` : `il y a ${Math.floor(min / 60)} h`;
  return { text, stale: min > 60 };
}

/** Une ligne de la carte « État des flux » : pastille d'état, source, état en clair (la couleur n'est jamais seule). */
function Feed({
  testId,
  label,
  state,
  tone,
  pulse,
}: {
  testId: string;
  label: string;
  state: string;
  tone: "ok" | "warn" | "danger" | "idle";
  pulse?: boolean;
}) {
  return (
    <li className="flex items-center gap-2" data-testid={testId}>
      <span
        aria-hidden
        className={cn(
          "size-[7px] shrink-0 rounded-full",
          tone === "ok" && "bg-ok",
          tone === "warn" && "bg-warn",
          tone === "danger" && "bg-danger",
          tone === "idle" && "bg-fg-subtle",
          pulse && "shadow-[0_0_0_3px_color-mix(in_oklab,var(--ok)_25%,transparent)]",
        )}
      />
      <span className="font-medium text-fg">{label}</span>
      <span className="ml-auto truncate text-fg-muted tabular">{state}</span>
    </li>
  );
}

type FeedTone = "ok" | "warn" | "danger" | "idle";
const TONE_BG: Record<FeedTone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  idle: "bg-fg-subtle",
};

/** État des flux en version rail : trois pastilles et « Flux », détail en infobulle et en texte masqué. */
function RailFeeds({ feeds }: { feeds: { label: string; state: string; tone: FeedTone }[] }) {
  const summary = feeds.map((f) => `${f.label} : ${f.state}`).join(" · ");
  return (
    <div
      data-testid="feed-rail"
      title={summary}
      className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-box bg-nav-card px-1 py-2 text-label text-fg-muted shadow-[var(--nav-card-shadow)] xl:hidden"
    >
      <span aria-hidden className="flex gap-1">
        {feeds.map((f) => (
          <span key={f.label} className={cn("size-[7px] rounded-full", TONE_BG[f.tone])} />
        ))}
      </span>
      <span aria-hidden>Flux</span>
      <span className="sr-only">État des flux : {summary}</span>
    </div>
  );
}

const IRAIL_STATE = {
  ok: { text: "répond", tone: "ok" },
  lent: { text: "lent", tone: "warn" },
  coupé: { text: "injoignable", tone: "danger" },
} as const;

export function Sidebar() {
  const { modules, admin, version } = useShell();
  const { status, live } = useShellStatus();
  const pathname = usePathname();
  const active = activeModule(pathname, modules);
  const dicos = status?.dicosAt ? ago(status.dicosAt, Date.now()) : null;
  const irail = status?.irail ? IRAIL_STATE[status.irail.state] : null;
  const onChangelog = pathname === CHANGELOG_LINK.href;
  const ids = useId();
  // Un module sans section rejoint « Travail » (aucun ne doit disparaître de la barre).
  const sections = SECTIONS.map((s) => ({
    ...s,
    modules: modules.filter((m) => (m.section ?? "travail") === s.id),
  })).filter((s) => s.modules.length);

  return (
    <nav
      data-print="hide"
      aria-label="Navigation principale"
      className="sticky top-0 hidden h-dvh w-24 shrink-0 flex-col overflow-y-auto border-r border-nav-rule bg-nav md:flex xl:w-58"
    >
      <Link
        href="/"
        aria-label="CSM, accueil"
        className="mx-2 mt-1.5 flex h-10 shrink-0 items-center justify-center gap-2.5 rounded-control px-2 outline-none focus-visible:ring-2 focus-visible:ring-accent xl:justify-start"
      >
        <span
          aria-hidden
          className="display grid size-[26px] shrink-0 place-items-center rounded-[min(var(--r-control),7px)] bg-fg text-small leading-none text-bg"
        >
          C
        </span>
        <span aria-hidden className="hidden min-w-0 flex-col xl:flex">
          <span className="display text-body-lg leading-5">CSM</span>
          <span className="truncate text-label tracking-normal text-fg-muted normal-case">
            Client Solutions
          </span>
        </span>
      </Link>
      {sections.map((s, i) => (
        <div key={s.id} className="px-2">
          {/* Titre de section dès 1280 px ; sur le rail, un simple filet entre les sections. */}
          <p
            id={`${ids}-${s.id}`}
            className="label-mono hidden px-3 pt-4 pb-1.5 text-fg-subtle xl:block"
          >
            {s.label}
          </p>
          {i > 0 ? (
            <span aria-hidden className="mx-3 my-1.5 block h-px bg-border xl:hidden" />
          ) : null}
          <ul
            aria-labelledby={`${ids}-${s.id}`}
            className={cn("flex flex-col gap-0.5", i === 0 && "pt-2 xl:pt-0")}
          >
            {s.modules.map((m) => (
              <ModuleLink key={m.id} module={m} active={active?.id === m.id} />
            ))}
          </ul>
        </div>
      ))}
      {admin ? (
        <div className="pt-3">
          <AdminSection admin={admin} pathname={pathname} />
        </div>
      ) : null}
      <div aria-hidden className="flex-1" />
      {/* Pied collant : l'état des flux reste visible quand l'Administration fait défiler la barre. */}
      <div className="sticky bottom-0 flex flex-col gap-1 bg-nav p-2">
        {/* État des flux : une ligne par source, au lieu de « En direct » répété sur chaque carte. */}
        <ul
          aria-label="État des flux"
          className="hidden flex-col gap-1.5 rounded-box bg-nav-card px-3 py-2.5 text-small shadow-[var(--nav-card-shadow)] xl:flex"
        >
          <Feed
            testId="feed-live"
            label="Temps réel"
            state={live === "direct" ? "connecté" : live === "coupé" ? "coupé" : "connexion…"}
            tone={live === "direct" ? "ok" : live === "coupé" ? "danger" : "warn"}
            pulse={live === "direct"}
          />
          {status?.counts.pmr !== undefined ? (
            <Feed
              testId="feed-dicos"
              label="DICOS"
              state={dicos ? dicos.text : "pas aujourd'hui"}
              tone={!dicos || dicos.stale ? "warn" : "ok"}
            />
          ) : null}
          <Feed
            testId="feed-irail"
            label="iRail"
            state={irail ? irail.text : "au repos"}
            tone={irail ? irail.tone : "idle"}
          />
        </ul>
        {/* Sur le rail (768-1279 px) : pastille compacte, une pastille par source, détail au survol et pour les lecteurs
            d'écran (décision du 15 oct. 2026). */}
        <RailFeeds
          feeds={[
            {
              label: "Temps réel",
              state: live === "direct" ? "connecté" : live === "coupé" ? "coupé" : "connexion…",
              tone: live === "direct" ? "ok" : live === "coupé" ? "danger" : "warn",
            },
            ...(status?.counts.pmr !== undefined
              ? [
                  {
                    label: "DICOS",
                    state: dicos ? dicos.text : "pas aujourd'hui",
                    tone: (!dicos || dicos.stale ? "warn" : "ok") as FeedTone,
                  },
                ]
              : []),
            {
              label: "iRail",
              state: irail ? irail.text : "au repos",
              tone: irail ? irail.tone : "idle",
            },
          ]}
        />
        {/* Nouveautés et version livrée : discret, sous l'état des flux (icône seule sur le rail). */}
        <Link
          href={CHANGELOG_LINK.href}
          aria-current={onChangelog ? "page" : undefined}
          data-testid="sidebar-changelog"
          title={version ? `${CHANGELOG_LINK.label} · version ${version}` : CHANGELOG_LINK.label}
          className={itemClass(
            onChangelog,
            "flex min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-small xl:min-h-9 xl:flex-row xl:justify-start xl:gap-2 xl:px-3 xl:py-0",
          )}
        >
          <Sparkles aria-hidden className="size-4 shrink-0" />
          <span>{CHANGELOG_LINK.label}</span>
          {version ? (
            <span className="hidden font-mono text-fg-subtle tabular xl:ml-auto xl:inline">
              v{version}
            </span>
          ) : null}
        </Link>
      </div>
    </nav>
  );
}
