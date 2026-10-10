"use client";

import { Monitor } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { saveUiPreferences } from "@/app/preferences-actions";
import { SHORTCUTS_KEY, shortcutsEnabled } from "@/components/shell/page-shortcuts";
import {
  browserNotifyEnabled,
  browserNotifySupported,
  setBrowserNotify,
} from "@/lib/browser-notify";
import { Switch } from "@/components/ui/checkbox";
import type { UiPreferences } from "@/design/preferences";
import { type ThemeId, THEMES, themeById } from "@/design/tokens";
import { cn } from "@/lib/utils";

/** Aperçu d'un thème : ses propres variables (data-theme sur l'élément), fond, accent et statuts. */
function ThemePreview({ id, className }: { id: ThemeId; className?: string }) {
  return (
    <span
      aria-hidden
      data-theme={id}
      className={cn(
        "flex flex-col justify-between overflow-hidden rounded-box border border-border bg-bg p-1.5",
        className,
      )}
    >
      <span className="flex items-center gap-1">
        <span className="h-2 w-6 rounded-control bg-accent" />
        <span className="h-1.5 w-8 rounded-control bg-fg-muted opacity-60" />
      </span>
      <span className="flex gap-1">
        {(["ok", "warn", "danger", "info", "progress"] as const).map((s) => (
          <span key={s} className="size-2 rounded-full" style={{ background: `var(--${s})` }} />
        ))}
      </span>
    </span>
  );
}

/** Choix du thème (11 + automatique) et de la densité : appliqué tout de suite, mémorisé côté serveur. */
export function ThemeSwitcher({
  value,
  onChange,
}: {
  value: UiPreferences;
  onChange: (next: UiPreferences) => void;
}) {
  const [, startTransition] = useTransition();

  const apply = (next: UiPreferences) => {
    const root = document.documentElement;
    root.dataset.theme = next.theme;
    root.dataset.density = next.density;
    if (next.theme === "auto") delete root.dataset.scheme;
    else root.dataset.scheme = themeById(next.theme).scheme;
    onChange(next);
    startTransition(() => saveUiPreferences(next));
  };

  const choices = [
    {
      id: "auto" as const,
      label: "Automatique",
      description: "Commandement ou Ivoire selon le système",
    },
    ...THEMES,
  ];
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Thème" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {choices.map((t) => {
          const checked = value.theme === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => apply({ ...value, theme: t.id })}
              className={cn(
                "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-box border p-2 text-left transition-colors",
                checked
                  ? "border-accent bg-surface-2"
                  : "border-border-strong bg-surface hover:border-fg-muted",
              )}
            >
              {t.id === "auto" ? (
                <span aria-hidden className="grid h-12 grid-cols-2 overflow-hidden rounded-box">
                  <ThemePreview id="commandement" />
                  <ThemePreview id="ivoire" />
                </span>
              ) : (
                <ThemePreview id={t.id} className="h-12" />
              )}
              <span className="flex items-center gap-1.5 text-body font-medium text-fg">
                {t.id === "auto" ? <Monitor className="size-4" aria-hidden /> : null}
                {t.label}
              </span>
              <span className="line-clamp-2 text-small text-fg-muted">{t.description}</span>
            </button>
          );
        })}
      </div>
      <ShortcutsToggle />
      <BrowserNotifyToggle />
      <div role="radiogroup" aria-label="Densité" className="flex gap-2">
        {(["confortable", "compact"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value.density === d}
            onClick={() => apply({ ...value, density: d })}
            className={cn(
              "h-control cursor-pointer rounded-control border px-3 text-body capitalize transition-colors",
              value.density === d
                ? "border-accent bg-surface-2 text-fg"
                : "border-border-strong bg-surface text-fg-muted hover:text-fg",
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Raccourcis à une touche (« / », « N ») : désactivables (WCAG 2.1.4), mémorisé dans ce navigateur. */
function ShortcutsToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(shortcutsEnabled()), []);
  return (
    <label className="flex items-center justify-between gap-3 text-body">
      <span>
        Raccourcis à une touche{" "}
        <span className="text-small text-fg-muted">(« / » recherche, « N » nouveau)</span>
      </span>
      <Switch
        checked={on}
        onCheckedChange={(v) => {
          setOn(v);
          try {
            window.localStorage.setItem(SHORTCUTS_KEY, v ? "on" : "off");
          } catch {}
        }}
        aria-label="Raccourcis à une touche"
      />
    </label>
  );
}

/**
 * Notifications du navigateur (demande du 10 oct. 2026) : urgences, mentions et retards de train quand CSM est en
 * arrière-plan. Activer demande la permission du navigateur ; mémorisé dans ce navigateur.
 */
function BrowserNotifyToggle() {
  const [on, setOn] = useState(false);
  const [state, setState] = useState<"ok" | "unsupported" | "denied">("ok");
  useEffect(() => {
    if (!browserNotifySupported()) return setState("unsupported");
    if (Notification.permission === "denied") setState("denied");
    setOn(browserNotifyEnabled());
  }, []);
  const hint =
    state === "unsupported"
      ? "Ce navigateur ne les prend pas en charge."
      : state === "denied"
        ? "Bloquées par le navigateur : autorise-les dans les réglages du site (icône du cadenas)."
        : "Urgences, mentions et retards de train, quand CSM est en arrière-plan.";
  return (
    <label className="flex items-center justify-between gap-3 text-body">
      <span>
        Notifications du navigateur{" "}
        <span
          className={cn("block text-small", state === "ok" ? "text-fg-muted" : "text-warn")}
          data-testid="browser-notify-hint"
        >
          {hint}
        </span>
      </span>
      <Switch
        checked={on}
        disabled={state !== "ok"}
        onCheckedChange={async (v) => {
          if (!v) {
            setBrowserNotify(false);
            return setOn(false);
          }
          const perm =
            Notification.permission === "granted"
              ? "granted"
              : await Notification.requestPermission().catch(() => "denied" as const);
          if (perm !== "granted") {
            if (perm === "denied") setState("denied");
            return setOn(false);
          }
          setBrowserNotify(true);
          setOn(true);
          try {
            new Notification("Notifications CSM activées", {
              body: "CSM t'alertera des urgences, mentions et retards quand il est en arrière-plan.",
              tag: "csm-notif-test",
            });
          } catch {}
        }}
        aria-label="Notifications du navigateur"
      />
    </label>
  );
}
