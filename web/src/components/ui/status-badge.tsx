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

// L'accent est réservé à l'action (bouton primaire, sélection, focus) : « Confirmé » a sa couleur `progress`
// (audit du 9 oct. 2026 : confirmé se confondait avec « en cours » / « envoyé »).
// Statut unifié des commandes bus et taxi. Pas de « facturé » : une commande dont l'envoi est confirmé est
// facturée d'office (décision utilisateur du 8 octobre 2026).
export const ORDER_STATUS = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  envoye: { label: "Envoyé", tone: "info" },
  confirme: { label: "Confirmé", tone: "progress" },
  en_cours: { label: "En cours", tone: "warn" },
  termine: { label: "Terminé", tone: "ok" },
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
