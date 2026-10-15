import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

/**
 * Barre d'outils de liste (v4 lot 6, 15 oct. 2026), même grammaire que Missions PMR : une ligne en desktop
 * (recherche, filtre principal, « Filtres (n) » qui replie le reste, actions à droite), recherche pleine largeur en
 * mobile. À placer dans un `FilterForm` (`className={TOOLBAR}`) ; le panneau de `CollapsibleFilters always` passe sur sa
 * propre ligne quand il est ouvert.
 */
export const TOOLBAR = "flex flex-wrap items-center gap-2";

/** Champ de recherche de la barre d'outils : loupe, libellé lu par les lecteurs d'écran, pleine largeur en mobile. */
export function ToolbarSearch({
  name = "q",
  label = "Recherche",
  defaultValue,
  placeholder,
  maxLength = 60,
  className,
  inputClassName,
  ...props
}: {
  name?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  inputClassName?: string;
  "data-testid"?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className={cn("relative min-w-0 basis-full md:w-64 md:basis-auto", className)}>
      <span className="sr-only">{label}</span>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
      />
      <Input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        className={cn("pl-9", inputClassName)}
        {...props}
      />
    </label>
  );
}

/**
 * Ligne d'état sous la barre d'outils : nombre de résultats (chiffres tabulaires), précisions, action discrète à droite.
 * Une seule ligne de texte 13 px : le premier résultat reste haut en mobile.
 */
export function ListStatus({
  count,
  sync,
  live,
  className,
}: {
  count: ReactNode;
  sync?: ReactNode;
  live?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-fg-muted",
        className,
      )}
    >
      {count}
      {sync ? (
        <>
          <span aria-hidden className="text-fg-subtle max-sm:hidden">
            ·
          </span>
          {sync}
        </>
      ) : null}
      {live ? <span className="ml-auto">{live}</span> : null}
    </div>
  );
}

/** Nombre en tête de la ligne d'état : « 829 gares ». */
export function ListCount({ n, label, extra }: { n: number; label: string; extra?: ReactNode }) {
  return (
    <span>
      <span className="font-medium text-fg tabular">{n}</span> {label}
      {extra}
    </span>
  );
}
