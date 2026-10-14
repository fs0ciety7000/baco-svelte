"use client";

import { useCallback } from "react";

import { Combobox } from "@/components/ui/combobox";
import { canonicalStation, stationCandidates, type StationRef } from "@/lib/stations/search";

// Champ de gare (bons bus et taxi, retour utilisateur du 11 oct. 2026 : la liste native `datalist` ne proposait rien de
// visible et un nom approximatif empêchait de trouver les lignes et les arrêts intermédiaires). Liste filtrée à la
// frappe (accents, casse, tirets ignorés ; abréviation PtCar acceptée : « FMS » → Mons), choix au clavier ou au clic,
// et le nom tapé est remplacé par le nom exact du référentiel dès qu'il correspond à une gare connue.
// Depuis le 14 oct. 2026 : référentiel des gares (`stations`) — nom NL et alias acceptés (« Bergen » → Mons,
// « Maubeuge » → « Maubeuge (FR) »), le nom FR est toujours celui retenu ; la saisie libre reste permise.
// Refonte R2 (14 oct. 2026) : écrit sur le socle `Combobox` (saisie libre, `loadOptions` = `stationCandidates`,
// correction `canonicalStation` à la sortie du champ) ; mêmes règles qu'avant.

const MAX = 8;

export function StationInput({
  value,
  defaultValue,
  onChange,
  name,
  refs,
  disabled,
  placeholder = "Nom ou abréviation (ex. Mons, FMS)",
  ...aria
}: {
  /** Valeur contrôlée (formulaires des bons) ; sinon `defaultValue` + `name` (filtres GET). */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  /** Gares connues : premier nom = nom retenu (FR), puis NL et alias ; abréviation PtCar. */
  refs: StationRef[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  maxLength?: number;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
  "aria-label"?: string;
  "data-testid"?: string;
}) {
  // Propositions : noms FR retenus (« Bergen » → Mons), sans la gare déjà saisie telle quelle.
  const load = useCallback(
    (q: string) =>
      stationCandidates(q, refs, MAX, true)
        .filter((n) => n !== q)
        .map((n) => ({ value: n, label: n })),
    [refs],
  );
  const normalize = useCallback((v: string) => canonicalStation(v, refs), [refs]);
  return (
    <Combobox
      {...aria}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onChange}
      loadOptions={load}
      normalize={normalize}
      allowFree
      openOnFocus
      disabled={disabled}
      placeholder={placeholder}
      listLabel="Gares proposées"
      max={MAX}
    />
  );
}
