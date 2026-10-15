"use client";

import type * as React from "react";

import { cn } from "@/lib/utils";
import type { ShellCountKey } from "@/navigation";

import { useShellStatus } from "./shell-status";

// Compteurs du shell (lot 3, v4) : ce qui attend l'agent, en pastille teintée selon sa nature (barre latérale, barre
// d'onglets mobile) ou neutre (onglets d'un module).
// Le chiffre est dessiné par CSS (`content: attr(data-count)`) : il ne s'ajoute ni au texte ni au nom accessible du
// lien (« Commandes » reste « Commandes »). Il est annoncé par une phrase complète (`CountNote`, reliée au lien par
// `aria-describedby`).

export const COUNT_META: Record<ShellCountKey, { tone: string; title: string }> = {
  commandes: { tone: "var(--warn)", title: "bons terminés à envoyer" },
  pmr: { tone: "var(--danger)", title: "missions impactées par un retard" },
  operations: { tone: "var(--info)", title: "messages non lus au Journal (24 h)" },
};

/** Valeur d'un compteur (0 ou absent = rien à afficher). */
export function useShellCount(key: string | undefined): number {
  const { status } = useShellStatus();
  if (!key) return 0;
  return (status?.counts as Record<string, number | undefined> | undefined)?.[key] ?? 0;
}

/** Phrase lue par les lecteurs d'écran (« 2 bons terminés à envoyer »), à relier par `aria-describedby`. */
export function countSentence(countKey: ShellCountKey, value: number): string {
  return `${value} ${COUNT_META[countKey].title}`;
}

/** Description masquée d'un compteur (hors du lien, pour ne pas changer son nom). */
export function CountNote({
  id,
  countKey,
  value,
}: {
  id: string;
  countKey: ShellCountKey;
  value: number;
}) {
  return (
    <span id={id} className="sr-only">
      {countSentence(countKey, value)}
    </span>
  );
}

/**
 * Pastille de compteur (décorative : `aria-hidden`, chiffre en CSS). `tinted` : fond teinté du ton (part `--tint` du
 * thème) et texte du ton ; sinon neutre (`surface-2`, comme `Count`). Au-delà de 99 : « 99+ ».
 */
export function CountPill({
  countKey,
  value,
  tinted = true,
  className,
  ...props
}: {
  countKey: ShellCountKey;
  value: number;
  tinted?: boolean;
} & Omit<React.ComponentProps<"span">, "children">) {
  const meta = COUNT_META[countKey];
  return (
    <span
      aria-hidden
      data-count={value > 99 ? "99+" : String(value)}
      title={countSentence(countKey, value)}
      style={tinted ? ({ "--tone": meta.tone } as React.CSSProperties) : undefined}
      className={cn(
        "inline-grid h-5 min-w-5 shrink-0 place-items-center rounded-pill px-1.5 text-label leading-none font-semibold tracking-normal tabular after:content-[attr(data-count)]",
        tinted
          ? "bg-[color-mix(in_oklab,var(--tone)_var(--tint),var(--surface))] text-(--tone)"
          : "bg-surface-2 text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
