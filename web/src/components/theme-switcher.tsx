"use client";

import { Monitor } from "lucide-react";
import { useTransition } from "react";

import { saveUiPreferences } from "@/app/preferences-actions";
import type { UiPreferences } from "@/design/preferences";
import { THEMES, themeById } from "@/design/tokens";
import { cn } from "@/lib/utils";

/** Choix du thème (5 + automatique) et de la densité : appliqué tout de suite, mémorisé côté serveur. */
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

  const choices = [{ id: "auto" as const, label: "Automatique" }, ...THEMES];
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Thème" className="flex flex-wrap gap-2">
        {choices.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value.theme === t.id}
            onClick={() => apply({ ...value, theme: t.id })}
            className={cn(
              "inline-flex h-control cursor-pointer items-center gap-2 border px-3 text-body transition-colors",
              value.theme === t.id
                ? "border-accent bg-surface-2 text-fg"
                : "border-border-strong bg-surface text-fg-muted hover:text-fg",
            )}
          >
            {t.id === "auto" ? (
              <Monitor className="size-4" aria-hidden />
            ) : (
              <span
                aria-hidden
                data-theme={t.id}
                className="size-4 border border-border-strong bg-[linear-gradient(135deg,var(--bg)_50%,var(--accent)_50%)]"
              />
            )}
            {t.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Densité" className="flex gap-2">
        {(["confortable", "compact"] as const).map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value.density === d}
            onClick={() => apply({ ...value, density: d })}
            className={cn(
              "h-control cursor-pointer border px-3 text-body capitalize transition-colors",
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
