"use client";

import { Bus, Car, Train } from "lucide-react";
import { useState } from "react";

import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DateField, DateRangePicker } from "@/components/ui/date-field";
import { Field } from "@/components/ui/field";
import { Listbox } from "@/components/ui/listbox";
import { MonthField } from "@/components/ui/month-field";
import { Select, type SelectOption } from "@/components/ui/select";
import { TimeField } from "@/components/ui/time-field";

// Données fictives uniquement.
const STATUTS: SelectOption[] = [
  { value: "brouillon", label: "Brouillon / en cours" },
  { value: "termine", label: "Terminé", hint: "Bus démobilisés, à envoyer" },
  { value: "envoye", label: "Envoyé / finalisé" },
  { value: "annule", label: "Annulé", disabled: true },
];
const TYPES: SelectOption[] = [
  { value: "bus", label: "Bus de remplacement", icon: Bus },
  { value: "taxi", label: "Taxi", icon: Car },
  {
    value: "train",
    label: "Relation de train avec un libellé très long qui passe à la ligne au lieu d'être coupé",
    icon: Train,
  },
];

/** Listes et champs date / heure (refonte R1 + R3) : états fermé, ouvert, focus, erreur, désactivé, vide. */
export function PickersDemo() {
  const [statut, setStatut] = useState("termine");
  const [type, setType] = useState("train");
  const [day, setDay] = useState("2026-10-14");
  const [time, setTime] = useState("14:50");
  const [active, setActive] = useState(1);
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="pickers-demo">
      <Card>
        <CardHeader eyebrow="Select" title="Liste à sélection simple" />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Statut" hint={`Valeur : ${statut || "(vide)"}`}>
            <Select
              name="demo-statut"
              options={STATUTS}
              value={statut}
              onValueChange={setStatut}
              clearable
              placeholder="Tous"
              data-testid="demo-select"
            />
          </Field>
          <Field label="Type (icône, retour à la ligne)">
            <Select options={TYPES} value={type} onValueChange={setType} />
          </Field>
          <Field label="Vide">
            <Select options={STATUTS} placeholder="Choisir un statut" />
          </Field>
          <Field label="Erreur" error="Choisis un statut.">
            <Select options={STATUTS} placeholder="Choisir…" />
          </Field>
          <Field label="Désactivé">
            <Select options={STATUTS} defaultValue="envoye" disabled />
          </Field>
          <div className="flex flex-col gap-1.5">
            <p className="text-small text-fg-muted">Ouvert (liste seule)</p>
            <div className="rounded-box border border-border-strong bg-surface shadow-lg">
              <Listbox
                id="demo-listbox"
                label="Statut"
                options={STATUTS}
                selected="termine"
                active={active}
                onActiveChange={setActive}
                onSelect={() => {}}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="DateField · TimeField" title="Date et heure" />
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Date de circulation" hint={`Valeur : ${day || "(vide)"}`}>
            <DateField value={day} onValueChange={setDay} data-testid="demo-date" />
          </Field>
          <Field label="Heure d'appel" hint={`Valeur : ${time || "(vide)"}`}>
            <TimeField value={time} onValueChange={setTime} data-testid="demo-time" />
          </Field>
          <Field label="Date vide">
            <DateField />
          </Field>
          <Field label="Heure à confirmer">
            <TimeField pending />
          </Field>
          <Field label="Date en erreur" error="La date est obligatoire.">
            <DateField />
          </Field>
          <Field label="Désactivés">
            <TimeField defaultValue="06:40" disabled />
          </Field>
          <Field label="Mois (archives)">
            <MonthField defaultValue="2026-10" />
          </Field>
          <Field label="Date désactivée">
            <DateField defaultValue="2026-10-14" disabled />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="DateRangePicker" title="Période et raccourcis" />
        <CardContent className="grid grid-cols-2 gap-3">
          <DateRangePicker defaultFrom="2026-10-13" defaultTo="2026-10-19" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Calendrier" title="Ouvert : novembre (Toussaint, Armistice)" />
        <CardContent>
          <p className="text-small text-fg-muted md:hidden">
            En mobile, le calendrier s&apos;ouvre en feuille du bas (bouton calendrier d&apos;un
            champ date).
          </p>
          <div className="mx-auto hidden w-80 max-w-full rounded-box border border-border-strong bg-surface shadow-lg md:block">
            <Calendar value="2026-11-10" onSelect={() => {}} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
