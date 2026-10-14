import type { Metadata } from "next";

import { StationsBoard } from "@/components/referentiels/stations-board";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { EmptyState } from "@/components/ui/misc";
import { parseDistricts } from "@/lib/district-param";
import { can } from "@/lib/permissions";
import { pl } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { listStations } from "@/server/data/timetable";

export const metadata: Metadata = { title: "Gares · CSM" };

// Référentiel des gares (14 oct. 2026) : gares desservies (horaire SNCB), noms FR / NL, abréviation, pays (gares
// frontière), lignes et DISTRICT modifiable (droit PtCar : modification). Le district sert aux missions DICOS.

function first(raw: Record<string, string | string[] | undefined>, k: string): string {
  const v = raw[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const DISTRICT_FILTER = [
  { value: "DSO", label: "DSO · Sud-Ouest" },
  { value: "DSE", label: "DSE · Sud-Est" },
  { value: "DCE", label: "DCE · Centre" },
  { value: "DNO", label: "DNO · Nord-Ouest" },
  { value: "DNE", label: "DNE · Nord-Est" },
  { value: "aucun", label: "Sans district" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRoute("/referentiels/gares");
  const raw = await searchParams;
  const f = {
    q: first(raw, "q").slice(0, 60),
    district: parseDistricts(
      raw.district,
      DISTRICT_FILTER.map((o) => o.value),
    ),
    pays: first(raw, "pays"),
    ligne: first(raw, "ligne").slice(0, 12),
    proposition: first(raw, "proposition"),
    type: first(raw, "type"),
  };
  const { rows, total } = await listStations(f);
  const canEdit = can(user, "ptcar:update");

  return (
    <section className="flex flex-col gap-4" aria-label="Gares">
      <FilterForm action="/referentiels/gares" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit live />
        <label className="flex min-w-0 flex-col gap-1 md:w-56">
          <span className="text-small text-fg-muted">Gare</span>
          <Input
            name="q"
            defaultValue={f.q}
            placeholder="Nom FR / NL, abréviation (FMS)…"
            maxLength={60}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-52">
          <span className="text-small text-fg-muted">District</span>
          <MultiSelect
            name="district"
            options={DISTRICT_FILTER}
            defaultValues={f.district}
            allLabel="Tous"
            noun="district"
            data-testid="stations-district-filter"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Pays</span>
          <Select name="pays" defaultValue={f.pays}>
            <option value="">Tous</option>
            <option value="be">Belgique</option>
            <option value="etranger">Gares étrangères</option>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-36">
          <span className="text-small text-fg-muted">Type</span>
          <Select name="type" defaultValue={f.type}>
            <option value="">Tous</option>
            <option value="gare">Gares</option>
            <option value="pang">PANG</option>
            <option value="etranger">Étranger</option>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-52">
          <span className="text-small text-fg-muted">Proposition de district</span>
          <Select name="proposition" defaultValue={f.proposition}>
            <option value="">Toutes les gares</option>
            <option value="oui">Sans district, avec proposition</option>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-28">
          <span className="text-small text-fg-muted">Ligne</span>
          <Input name="ligne" defaultValue={f.ligne} placeholder="96" maxLength={12} />
        </label>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </FilterForm>
      <p className="text-small text-fg-muted">
        <span className="font-mono text-fg tabular">{total}</span> {pl(total, "gare")}
        {total > rows.length ? ` · ${rows.length} affichées, affine la recherche` : ""}
        {canEdit ? " · district modifiable (« Automatique » = proposé par l'import)" : ""}
        {" · "}
        <a href="/api/referentiels/gares/export" className="link" data-print="hide">
          Exporter toutes les gares (CSV)
        </a>
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune gare"
          description="Aucune gare ne correspond (le référentiel est construit chaque matin avec celui des trains)."
        />
      ) : (
        <StationsBoard rows={rows} canEdit={canEdit} />
      )}
    </section>
  );
}
