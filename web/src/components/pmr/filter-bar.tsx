import { EyeOff, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DateRangePicker } from "@/components/ui/date-field";
import { FilterForm } from "@/components/ui/filter-form";
import {
  ClearFilters,
  CollapsibleFilters,
  FilterChip,
  FilterSubmit,
  SegmentedNav,
} from "@/components/ui/filters";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { DistrictMenu } from "@/components/ui/district-picker";
import { Input } from "@/components/ui/input";
import { isAllDistricts } from "@/lib/district-param";
import { districtCodes, normalizeDistricts } from "@/lib/pmr/district-filter";
import { ASSIST_STATUS, ASSIST_STATUSES, parseStatuses } from "@/lib/pmr/model";

export type PmrFilters = {
  du?: string;
  au?: string;
  /** Codes : « DSO,DSE » ou paramètre répété (`DistrictPicker`, refonte R4). */
  district?: string | string[];
  q?: string;
  /** Statuts cochés : « prevue,absent » ou paramètre répété (cases à cocher, 12 oct. 2026). */
  statut?: string | string[];
  /** « masquees » / « affichees » (choix mémorisé : voir `lib/pmr/cancelled-pref.ts`). */
  annulees?: string;
};

export const hideCancelled = (f: PmrFilters) => f.annulees === "masquees";

/** Nombre de filtres repliés actifs (puce « Filtres (n) ») : statuts cochés, annulées masquées, période libre. */
export function foldedFilterCount(input: {
  statuses: number;
  hideCancelled: boolean;
  customPeriod: boolean;
}): number {
  return input.statuses + Number(input.hideCancelled) + Number(input.customPeriod);
}

/**
 * Barre d'outils des Missions PMR et des Groupes (v4 lot 4, 15 oct. 2026), filtres en GET (URL partageable, sans JS).
 * Desktop : une ligne — période en contrôle segmenté, districts en menu, recherche, « Filtres (n) » qui replie le reste
 * (statuts, plage de dates, « Masquer les annulées »), actions à droite (Export ALEA). Mobile : période, recherche, puis
 * districts et filtres ; le premier résultat arrive bien plus haut qu'avec les quatre rangées de filtres.
 */
export function PmrFilterBar({
  action,
  filters,
  shortcuts,
  statuses = ASSIST_STATUSES,
  myDistricts = "",
  actions,
}: {
  action: string;
  filters: PmrFilters;
  shortcuts: { label: string; du: string; au: string }[];
  /** Statuts proposés (par défaut ceux des missions PMR). */
  statuses?: readonly string[];
  /**
   * Districts du jour de l'agent (codes, « DSO,DSE ») : filtre par défaut des Missions PMR et des Groupes. Avec cette
   * prop, le menu des districts propose « Mes districts » (district explicite dans l'URL).
   */
  myDistricts?: string;
  /** Actions à droite de la barre (Export ALEA). */
  actions?: ReactNode;
}) {
  const hidden = hideCancelled(filters);
  const checked = parseStatuses(filters.statut, statuses);
  const statut = checked.join(",");
  // Filtre district courant : codes (« DSO,DSE »), vide = tous.
  const current = normalizeDistricts(filters.district);
  const keep = Object.fromEntries(
    Object.entries({
      // « tous » explicite quand un défaut existe : les raccourcis ne doivent pas le réappliquer.
      district: current || (myDistricts || isAllDistricts(filters.district) ? "tous" : ""),
      q: filters.q,
      statut,
      annulees: hidden ? "masquees" : "affichees",
    }).filter(([, v]) => v),
  ) as Record<string, string>;
  // Bascule « Masquer les annulées » : mêmes filtres, paramètre ajouté ou retiré.
  const toggle = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ ...keep, du: filters.du ?? "", au: filters.au ?? "" }).filter(
        ([k, v]) => v && k !== "annulees",
      ),
    ),
  );
  toggle.set("annulees", hidden ? "affichees" : "masquees");
  const period = shortcuts.map((s) => ({
    label: s.label,
    href: `${action}?${new URLSearchParams({ ...keep, du: s.du, au: s.au })}`,
    current: filters.du === s.du && (filters.au ?? s.du) === s.au,
  }));
  const folded = foldedFilterCount({
    statuses: checked.length,
    hideCancelled: hidden,
    customPeriod: !period.some((p) => p.current),
  });
  return (
    <FilterForm
      action={action}
      role="search"
      className="flex flex-wrap items-center gap-2"
      data-testid="pmr-toolbar"
    >
      <input type="hidden" name="annulees" value={hidden ? "masquees" : "affichees"} />
      <SegmentedNav label="Période" items={period} data-testid="period" className="md:order-1" />
      {/* Mobile : période, recherche, puis districts / filtres / actions ; desktop : période, districts, recherche. */}
      <label className="relative min-w-0 basis-full md:order-3 md:w-64 md:basis-auto">
        <span className="sr-only">Recherche</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
        />
        <Input
          name="q"
          defaultValue={filters.q}
          placeholder="Gare, train, réf. DICOS…"
          className="pl-9"
          maxLength={60}
        />
      </label>
      <div className="min-w-0 md:order-2">
        {/* Districts en menu (un, plusieurs ou tous) ; « Mes districts » = districts du jour. */}
        <DistrictMenu
          name="district"
          label="Districts"
          defaultValues={districtCodes(current)}
          emptyValue="tous"
          mine={districtCodes(myDistricts)}
          data-testid="district-picker"
        />
      </div>
      <CollapsibleFilters always active={folded} toggleClassName="md:order-4">
        {/* Plusieurs statuts à la fois (12 oct. 2026) ; aucune case = tous. */}
        <CheckboxGroup
          legend="Statut"
          name="statut"
          options={statuses.map((s) => ({
            value: s,
            label: ASSIST_STATUS[s as keyof typeof ASSIST_STATUS]?.label ?? s,
          }))}
          defaultValues={checked}
        />
        <DateRangePicker
          nameFrom="du"
          nameTo="au"
          defaultFrom={filters.du ?? ""}
          defaultTo={filters.au ?? ""}
          presets={["today", "tomorrow", "7d", "week"]}
          fieldClassName="md:w-40"
        />
        <FilterChip asChild pressed={hidden}>
          <Link
            href={`${action}?${toggle}`}
            aria-pressed={hidden}
            role="button"
            data-testid="hide-cancelled"
          >
            <EyeOff aria-hidden className="size-4" />
            Masquer les annulées
          </Link>
        </FilterChip>
        <ClearFilters href={action} />
      </CollapsibleFilters>
      {actions ? (
        <div className="ml-auto flex flex-wrap items-center gap-2 md:order-5">{actions}</div>
      ) : null}
      <FilterSubmit />
    </FilterForm>
  );
}
