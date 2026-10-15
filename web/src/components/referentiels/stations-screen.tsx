import { Download } from "lucide-react";

import { StationsBoard } from "@/components/referentiels/stations-board";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { ClearFilters, CollapsibleFilters } from "@/components/ui/filters";
import { ListCount, ListStatus, TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { EmptyState } from "@/components/ui/misc";
import { parseDistricts } from "@/lib/district-param";
import { pl } from "@/lib/utils";
import { listStations } from "@/server/data/timetable";

// Référentiel des gares (14 oct. 2026) : gares desservies (horaire SNCB), noms FR / NL, abréviation, pays (gares
// frontière), lignes et DISTRICT modifiable (droit « Modifier les référentiels du réseau »). Le district sert aux missions
// DICOS. Écran partagé (navigation v3 : « une fiche, un éditeur, deux portes ») : Réseau › Gares (consultation, et
// modification pour qui gère) et Administration › Référentiels › Gares et districts (même écran, filtres de contrôle).

type Raw = Record<string, string | string[] | undefined>;

function first(raw: Raw, k: string): string {
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

export async function StationsScreen({
  raw,
  action,
  canEdit,
}: {
  raw: Raw;
  /** Chemin de la page (formulaire de filtres en GET). */
  action: string;
  canEdit: boolean;
}) {
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
  const folded = [f.pays, f.type, f.proposition, f.ligne].filter(Boolean).length;

  return (
    <section className="flex flex-col gap-4" aria-label="Gares">
      {/* Barre d'outils sur une ligne (v4 lot 6) : recherche, districts, « Filtres (n) », export à droite. */}
      <FilterForm action={action} role="search" className={TOOLBAR} data-testid="stations-toolbar">
        <FormAutoSubmit live />
        <ToolbarSearch label="Gare" defaultValue={f.q} placeholder="Gare ou abréviation (FMS)…" />
        <label className="min-w-44 flex-1 md:min-w-0 md:w-52 md:flex-none">
          <span className="sr-only">District</span>
          <MultiSelect
            name="district"
            label="District"
            options={DISTRICT_FILTER}
            defaultValues={f.district}
            allLabel="Tous les districts"
            noun="district"
            data-testid="stations-district-filter"
          />
        </label>
        <CollapsibleFilters always active={folded}>
          <label className="flex min-w-0 flex-col gap-1 md:w-40">
            <span className="text-small text-fg-muted">Pays</span>
            <CustomSelect
              name="pays"
              defaultValue={f.pays}
              options={[
                { value: "", label: "Tous" },
                { value: "be", label: "Belgique" },
                { value: "etranger", label: "Gares étrangères" },
              ]}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-36">
            <span className="text-small text-fg-muted">Type</span>
            <CustomSelect
              name="type"
              defaultValue={f.type}
              options={[
                { value: "", label: "Tous" },
                { value: "gare", label: "Gares" },
                { value: "pang", label: "PANG" },
                { value: "etranger", label: "Étranger" },
              ]}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-52">
            <span className="text-small text-fg-muted">Proposition de district</span>
            <CustomSelect
              name="proposition"
              defaultValue={f.proposition}
              options={[
                { value: "", label: "Toutes les gares" },
                { value: "oui", label: "Sans district, avec proposition" },
              ]}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 md:w-28">
            <span className="text-small text-fg-muted">Ligne</span>
            <Input name="ligne" defaultValue={f.ligne} placeholder="96" maxLength={12} />
          </label>
          <ClearFilters href={action} />
        </CollapsibleFilters>
        <Button asChild variant="secondary" size="sm" className="ml-auto" data-print="hide">
          <a href="/api/referentiels/gares/export">
            <Download aria-hidden /> Exporter (CSV)
          </a>
        </Button>
        <button type="submit" tabIndex={-1} aria-hidden className="sr-only">
          Afficher
        </button>
      </FilterForm>
      <ListStatus
        count={
          <ListCount
            n={total}
            label={pl(total, "gare")}
            extra={total > rows.length ? ` · ${rows.length} affichées, affine la recherche` : ""}
          />
        }
        sync={canEdit ? "district modifiable (« Automatique » = proposé par l'import)" : undefined}
      />
      {rows.length === 0 ? (
        <EmptyState
          framed
          title="Aucune gare"
          description="Aucune gare ne correspond (le référentiel est construit chaque matin avec celui des trains)."
        />
      ) : (
        // Clé = filtres : nouvelle recherche, rendu progressif et sélection repartent de zéro.
        <StationsBoard key={JSON.stringify(f)} rows={rows} canEdit={canEdit} />
      )}
    </section>
  );
}
