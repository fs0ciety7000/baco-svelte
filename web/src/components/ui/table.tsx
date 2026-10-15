import * as React from "react";

import { cn } from "@/lib/utils";

// Tableau dense (v4, 15 oct. 2026) : cadre en carte légère, en-tête sur fond `--th-bg` (surface-2 ; surface-3 en gras
// dans la direction Quai) en 12 px casse normale, séparateurs de lignes à 70 %, lignes à hauteur de densité, en-tête
// collant, bordure gauche de statut (3 px), nombres alignés à droite. Sous 768 px, utiliser <ListCard>.

/** Séparateur de lignes adouci (70 % de la bordure). */
const ROW_RULE = "border-[color-mix(in_oklab,var(--border)_70%,transparent)]";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table"
      className="relative w-full overflow-x-auto rounded-box border border-(--card-frame) bg-surface shadow-rest"
    >
      <table className={cn("w-full border-collapse text-body", className)} {...props} />
    </div>
  );
}

function THead({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-10 bg-(--th-bg)", className)} {...props} />;
}

function Th({ className, numeric, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-(--th-rule) px-3 text-left text-label font-(weight:--th-weight) tracking-normal whitespace-nowrap text-(--th-fg)",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function Tr({
  className,
  statusColor,
  selected,
  style,
  ...props
}: React.ComponentProps<"tr"> & { statusColor?: string; selected?: boolean }) {
  return (
    <tr
      aria-selected={selected || undefined}
      style={{ ...style, "--status": statusColor ?? "transparent" } as React.CSSProperties}
      className={cn(
        "h-row border-b bg-surface shadow-[inset_3px_0_0_var(--status)] transition-colors last:border-b-0 hover:bg-surface-2 aria-selected:bg-accent-soft",
        ROW_RULE,
        className,
      )}
      {...props}
    />
  );
}

function Td({ className, numeric, ...props }: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return <td className={cn("px-3 py-1", numeric && "tabular text-right", className)} {...props} />;
}

/** Carte de liste mobile : bordure gauche de statut, carte légère, deux lignes au maximum. */
function ListCard({
  statusColor,
  title,
  meta,
  aside,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  statusColor?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div
      style={{ "--status": statusColor ?? "var(--border)" } as React.CSSProperties}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-box border border-(--card-frame) border-l-[3px] border-l-(--status) bg-surface px-3 py-2 shadow-rest",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-body font-medium">{title}</div>
        {meta ? <div className="truncate text-small text-fg-muted">{meta}</div> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </div>
  );
}

export { ListCard, Table, Td, Th, THead, Tr };
