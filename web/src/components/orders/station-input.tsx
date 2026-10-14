"use client";

import { useId, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { canonicalStation, stationCandidates, type StationRef } from "@/lib/stations/search";
import { cn } from "@/lib/utils";

// Champ de gare (bons bus et taxi, retour utilisateur du 11 oct. 2026 : la liste native `datalist` ne proposait rien de
// visible et un nom approximatif empêchait de trouver les lignes et les arrêts intermédiaires). Liste filtrée à la
// frappe (accents, casse, tirets ignorés ; abréviation PtCar acceptée : « FMS » → Mons), choix au clavier ou au clic,
// et le nom tapé est remplacé par le nom exact du référentiel dès qu'il correspond à une gare connue.
// Depuis le 14 oct. 2026 : référentiel des gares (`stations`) — nom NL et alias acceptés (« Bergen » → Mons,
// « Maubeuge » → « Maubeuge (FR) »), le nom FR est toujours celui retenu ; la saisie libre reste permise.

export function StationInput({
  value,
  onChange,
  refs,
  disabled,
  placeholder = "Nom ou abréviation (ex. Mons, FMS)",
  ...aria
}: {
  value: string;
  onChange: (value: string) => void;
  /** Gares connues : premier nom = nom retenu (FR), puis NL et alias ; abréviation PtCar. */
  refs: StationRef[];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const options = useMemo(
    () => (open ? stationCandidates(value, refs, 8, true).filter((n) => n !== value) : []),
    [open, value, refs],
  );

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  return (
    <div className="relative min-w-0">
      <Input
        {...aria}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        aria-activedescendant={options.length ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Laisse le clic sur une proposition aboutir avant de fermer ; corrige ensuite vers le nom exact.
          blurTimer.current = setTimeout(() => {
            setOpen(false);
            const exact = canonicalStation(value, refs);
            if (exact !== value) onChange(exact);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (!options.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + options.length) % options.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active] ?? options[0]!);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {options.length ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Gares proposées"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-box border border-border-strong bg-surface py-1 shadow-lg"
        >
          {options.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                // Avant le blur du champ : la proposition est retenue.
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
                pick(name);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center px-3 text-body text-fg",
                i === active && "bg-surface-2",
              )}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
