"use client";

import { useState } from "react";

import { StationInput } from "@/components/orders/station-input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Combobox } from "@/components/ui/combobox";
import { DistrictMenu, DistrictPicker } from "@/components/ui/district-picker";
import { DISTRICT_NAME_OPTIONS } from "@/lib/district-param";
import { Field } from "@/components/ui/field";
import type { ListOption } from "@/components/ui/listbox";
import { MultiSelect } from "@/components/ui/multi-select";

// Données fictives uniquement.
const COMPANIES: ListOption[] = [
  { value: "c1", label: "Autocars Démo" },
  { value: "c2", label: "Éole Bus Démo", hint: "Sans adresse e-mail" },
  { value: "c3", label: "Voyages Fictifs" },
  { value: "c4", label: "Bus d'Essai" },
  { value: "c5", label: "Transports Exemple" },
  { value: "c6", label: "Société archivée", disabled: true },
];
const CATEGORIES: ListOption[] = ["Police", "Pompiers", "Infrabel", "Communes"].map((v) => ({
  value: v,
  label: v,
}));
const STATIONS = [
  { abbr: "FMS", names: ["Mons", "Bergen"] },
  { abbr: "FTY", names: ["Tournai", "Doornik"] },
  { abbr: "FCR", names: ["Charleroi-Central"] },
  { names: ["Maubeuge (FR)", "Maubeuge"] },
];
const STATUTS: ListOption[] = [
  { value: "prevue", label: "Prévue" },
  { value: "en_cours", label: "En cours" },
  { value: "realisee", label: "Réalisée" },
  { value: "absent", label: "Client absent" },
  { value: "annulee", label: "Annulée" },
];

/** Recherche et choix multiples (refonte R2 + R4) : états fermé, ouvert, vide, erreur, désactivé. */
export function SearchDemo() {
  const [company, setCompany] = useState("c3");
  const [station, setStation] = useState("");
  const [category, setCategory] = useState("");
  const [statuts, setStatuts] = useState<string[]>(["prevue", "en_cours"]);
  const [districts, setDistricts] = useState<string[]>(["DSO"]);
  const [duty, setDuty] = useState<string[]>(["Sud-Est"]);
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="search-demo">
      <Card>
        <CardHeader eyebrow="Combobox" title="Recherche dans une liste" />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Société" hint={`Valeur : ${company || "(vide)"}`}>
            <Combobox
              options={COMPANIES}
              value={company}
              onValueChange={setCompany}
              placeholder="Choisir une société…"
              emptyText="Aucune société"
              data-testid="demo-combobox"
            />
          </Field>
          <Field label="Gare (saisie libre, référentiel)" hint="« FMS », « Bergen » → Mons">
            <StationInput value={station} onChange={setStation} refs={STATIONS} />
          </Field>
          <Field label="Catégorie (saisie libre)" hint={`Valeur : ${category || "(vide)"}`}>
            <Combobox
              allowFree
              openOnFocus
              options={CATEGORIES}
              value={category}
              onValueChange={setCategory}
              createLabel={(q) => `Nouvelle catégorie « ${q} »`}
            />
          </Field>
          <Field label="Erreur" error="Choisis une société.">
            <Combobox options={COMPANIES} placeholder="Choisir…" />
          </Field>
          <Field label="Désactivé">
            <Combobox options={COMPANIES} defaultValue="c1" disabled />
          </Field>
          <Field label="Vide (aucune option)">
            <Combobox options={[]} placeholder="Rien à proposer" emptyText="Aucun chauffeur" />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader
          eyebrow="MultiSelect · DistrictPicker · CheckboxGroup"
          title="Choix multiples"
        />
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Statuts" hint={`Valeurs : ${statuts.join(", ") || "(tous)"}`}>
              <MultiSelect
                options={STATUTS}
                values={statuts}
                onValuesChange={setStatuts}
                noun="statut"
                data-testid="demo-multiselect"
              />
            </Field>
            <Field label="Avec recherche, désactivé">
              <MultiSelect options={STATUTS} searchable disabled defaultValues={["absent"]} />
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-small text-fg-muted">
              Districts (filtre) : {districts.join(", ") || "tous"}
            </p>
            <DistrictPicker
              values={districts}
              onValuesChange={setDistricts}
              mine={["DSO", "DSE"]}
              data-testid="demo-district-picker"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-small text-fg-muted">Districts en menu (barre d&apos;outils PMR)</p>
            <DistrictMenu name="demo-district" mine={["DSO"]} defaultValues={["DSO"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-small text-fg-muted">Districts d&apos;un compte (sans « Tous »)</p>
            <DistrictPicker
              options={DISTRICT_NAME_OPTIONS}
              values={duty}
              onValuesChange={setDuty}
              allLabel={null}
              showHint="always"
              label="Districts du jour"
            />
          </div>
          <CheckboxGroup
            legend="Statut (cases)"
            options={STATUTS.slice(0, 4)}
            defaultValues={["prevue"]}
            checkAll
          />
        </CardContent>
      </Card>
    </div>
  );
}
