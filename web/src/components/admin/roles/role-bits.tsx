"use client";

import { Check, Info, X } from "lucide-react";
import type * as React from "react";

import { Badge } from "@/components/ui/status-badge";
import { ROLE_COLOR_LABEL, ROLE_COLORS, ROLE_DOT, type RoleColor } from "@/lib/roles";
import { labelOf, preview, type PermDiff } from "@/lib/roles-editor";
import { cn } from "@/lib/utils";

// Briques partagées par Administration › Rôles et la fiche d'un agent (rôles v3, lots L4-L5).

export function RoleDot({ color, className }: { color: RoleColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", ROLE_DOT[color], className)}
    />
  );
}

export function SensitiveBadge() {
  return (
    <Badge tone="warn" title="Droit à risque : données personnelles, suppression ou modération">
      Sensible
    </Badge>
  );
}

/** Message permanent : les droits viennent du code, les rôles les combinent. */
export function CatalogNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-box border border-border bg-surface-2 px-3 py-2 text-small text-fg-muted",
        className,
      )}
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        Les droits disponibles sont fixés par CSM (chacun est contrôlé par le serveur) ; tu peux les
        combiner librement dans des rôles. Pour un besoin non couvert, demande un nouveau droit à
        l&apos;équipe CSM.
      </span>
    </p>
  );
}

/** Choix de la couleur d'un rôle (pastilles en groupe radio, cibles de 44 px). */
export function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: RoleColor;
  onChange: (c: RoleColor) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Couleur" className="flex flex-wrap gap-1">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={ROLE_COLOR_LABEL[c]}
          title={ROLE_COLOR_LABEL[c]}
          disabled={disabled}
          onClick={() => onChange(c)}
          className={cn(
            "grid size-11 cursor-pointer place-items-center rounded-control border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === c
              ? "border-accent bg-accent-soft"
              : "border-transparent hover:border-border-strong",
          )}
        >
          <span className={cn("size-6 rounded-full", ROLE_DOT[c])} />
        </button>
      ))}
    </div>
  );
}

export type Mark = "plus" | "moins" | "added" | "removed";

const MARK_LABEL: Record<Mark, string> = {
  plus: "ajusté",
  moins: "ajusté",
  added: "nouveau",
  removed: "retiré",
};

/**
 * « Peut… / ne peut pas… » : droits visibles du catalogue en deux listes ; `marks` surligne un droit (ajustement d'un
 * agent, changement non enregistré d'un rôle).
 */
export function PermPreview({
  perms,
  marks,
  canTitle = "peut",
  cannotTitle = "ne peut pas",
  testId,
}: {
  perms: readonly string[];
  marks?: Partial<Record<string, Mark>>;
  canTitle?: string;
  cannotTitle?: string;
  testId?: string;
}) {
  const p = preview(perms);
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      <section aria-label={canTitle} className="flex flex-col gap-1">
        <h4 className="text-body font-semibold text-ok">{canTitle}</h4>
        {p.can.length ? (
          <ul className="flex flex-col gap-1" data-testid={testId ? `${testId}-can` : undefined}>
            {p.can.map((e) => (
              <PreviewItem
                key={e.key}
                ok
                label={e.label}
                title={e.sentence}
                mark={marks?.[e.key]}
              />
            ))}
          </ul>
        ) : (
          <p className="text-small text-fg-muted">Aucun droit.</p>
        )}
      </section>
      <section aria-label={cannotTitle} className="flex flex-col gap-1">
        <h4 className="text-body font-semibold text-danger">{cannotTitle}</h4>
        {p.cannot.length ? (
          <ul className="flex flex-col gap-1" data-testid={testId ? `${testId}-cannot` : undefined}>
            {p.cannot.map((e) => (
              <PreviewItem
                key={e.key}
                ok={false}
                label={e.label}
                title={e.sentence}
                mark={marks?.[e.key]}
              />
            ))}
          </ul>
        ) : (
          <p className="text-small text-fg-muted">Rien : tous les droits sont accordés.</p>
        )}
      </section>
    </div>
  );
}

function PreviewItem({
  ok,
  label,
  title,
  mark,
}: {
  ok: boolean;
  label: string;
  title: string;
  mark?: Mark;
}) {
  const Icon = ok ? Check : X;
  return (
    <li
      title={title}
      className={cn(
        "flex items-start gap-2 text-small text-fg",
        mark && "-mx-1 rounded-control bg-accent-soft px-1",
      )}
    >
      <Icon
        aria-hidden
        className={cn("mt-0.5 size-4 shrink-0", ok ? "text-ok" : "text-danger")}
        strokeWidth={2.5}
      />
      <span className="min-w-0 flex-1">{label}</span>
      {mark ? (
        <span className="shrink-0 rounded-control border border-border px-1.5 text-hint text-fg-muted">
          {MARK_LABEL[mark]}
        </span>
      ) : null}
    </li>
  );
}

/** Puces « + Supprimer un bon bus » / « − Voir les statistiques » (changements non enregistrés). */
export function DiffChips({ diff }: { diff: PermDiff }) {
  if (!diff.added.length && !diff.removed.length) return null;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Changements">
      {diff.added.map((k) => (
        <Chip key={`+${k}`} tone="ok">
          + {labelOf(k)}
        </Chip>
      ))}
      {diff.removed.map((k) => (
        <Chip key={`-${k}`} tone="danger">
          − {labelOf(k)}
        </Chip>
      ))}
    </ul>
  );
}

function Chip({ tone, children }: { tone: "ok" | "danger"; children: React.ReactNode }) {
  return (
    <li
      className={cn(
        "rounded-control border px-2 py-0.5 text-small",
        tone === "ok" ? "border-ok/50 text-ok" : "border-danger/50 text-danger",
      )}
    >
      {children}
    </li>
  );
}
