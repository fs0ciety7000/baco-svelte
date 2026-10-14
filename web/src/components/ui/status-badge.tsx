import * as React from "react";

import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "info" | "progress";

const toneVar: Record<Tone, string> = {
  neutral: "var(--fg-muted)",
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  info: "var(--info)",
  progress: "var(--progress)",
};

// L'accent est réservé à l'action (bouton primaire, sélection, focus). Statut unifié des commandes bus et taxi, cycle v3
// (14 oct. 2026) : en cours (info), terminé = à envoyer (progress), envoyé / finalisé (ok), annulé (danger).
export const ORDER_STATUS = {
  brouillon: { label: "Brouillon / en cours", tone: "info" },
  termine: { label: "Terminé", tone: "progress" },
  envoye: { label: "Envoyé / finalisé", tone: "ok" },
  annule: { label: "Annulé", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

export type OrderStatus = keyof typeof ORDER_STATUS;

/** Badge : casse normale (lisibilité, audit du 9 oct. 2026), pastille, fond du ton à 12 %, bordure à 40 % (contraste testé). */
function Badge({
  tone = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      data-slot="badge"
      style={{ "--tone": toneVar[tone] } as React.CSSProperties}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-control border text-small font-medium border-[color-mix(in_oklab,var(--tone)_40%,transparent)] bg-[color-mix(in_oklab,var(--tone)_12%,var(--surface))] px-2 whitespace-nowrap text-(--tone)",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="size-1.5 rounded-control bg-(--tone)" />
      {children}
    </span>
  );
}

function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = ORDER_STATUS[status];
  return (
    <Badge tone={s.tone} className={className}>
      {s.label}
    </Badge>
  );
}

/** Couleur de la bordure gauche de statut (lignes de tableau, cartes). */
export function statusColor(status: OrderStatus): string {
  return toneVar[ORDER_STATUS[status].tone];
}

export { Badge, StatusBadge };
