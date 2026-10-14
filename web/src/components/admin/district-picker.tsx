"use client";

import { DistrictPicker as UiDistrictPicker } from "@/components/ui/district-picker";
import { DISTRICT_NAME_OPTIONS } from "@/lib/district-param";

export const DISTRICT_NAMES = ["Sud-Ouest", "Sud-Est", "Centre"] as const;

/**
 * Districts permanents d'un compte (rôles v2, 11 oct. 2026) : un, deux ou les trois. Ils règlent les filtres et les
 * alertes par défaut (comme les districts du jour) ; ils ne limitent pas l'écriture. Rendu commun `DistrictPicker`
 * (refonte R4), sans puce « Tous ».
 */
export function DistrictPicker({
  value,
  onChange,
  label = "Districts",
  ...aria
}: {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  /** Posés par `Field` (id, aide). */
  id?: string;
  "aria-describedby"?: string;
}) {
  return (
    <UiDistrictPicker
      options={DISTRICT_NAME_OPTIONS}
      values={value}
      onValuesChange={onChange}
      allLabel={null}
      label={label}
      id={aria.id}
      aria-describedby={aria["aria-describedby"]}
    />
  );
}
