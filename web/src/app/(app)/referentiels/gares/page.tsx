import type { Metadata } from "next";
import Link from "next/link";

import { StationDistrict } from "@/components/referentiels/station-district";
import { LinesChain, trainsHref } from "@/components/referentiels/trains";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { can } from "@/lib/permissions";
import { pl } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { listStations, type StationRow } from "@/server/data/timetable";

export const metadata: Metadata = { title: "Gares · CSM" };

// Référentiel des gares (14 oct. 2026) : gares desservies (horaire SNCB), noms FR / NL, abréviation, pays (gares
// frontière), lignes et DISTRICT modifiable (droit PtCar : modification). Le district sert aux missions DICOS.

function first(raw: Record<string, string | string[] | undefined>, k: string): string {
  const v = raw[k];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRoute("/referentiels/gares");
  const raw = await searchParams;
  const f = {
    q: first(raw, "q").slice(0, 60),
    district: first(raw, "district"),
    pays: first(raw, "pays"),
    ligne: first(raw, "ligne").slice(0, 12),
  };
  const { rows, total } = await listStations(f);
  const canEdit = can(user, "ptcar:update");

  return (
    <section className="flex flex-col gap-4" aria-label="Gares">
      <FilterForm action="/referentiels/gares" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit />
        <label className="flex min-w-0 flex-col gap-1 md:w-56">
          <span className="text-small text-fg-muted">Gare</span>
          <Input
            name="q"
            defaultValue={f.q}
            placeholder="Nom FR / NL, abréviation (FMS)…"
            maxLength={60}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-44">
          <span className="text-small text-fg-muted">District</span>
          <Select name="district" defaultValue={f.district}>
            <option value="">Tous</option>
            <option value="DSO">DSO · Sud-Ouest</option>
            <option value="DSE">DSE · Sud-Est</option>
            <option value="DCE">DCE · Centre</option>
            <option value="aucun">Sans district</option>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Pays</span>
          <Select name="pays" defaultValue={f.pays}>
            <option value="">Tous</option>
            <option value="be">Belgique</option>
            <option value="etranger">Gares étrangères</option>
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
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune gare"
          description="Aucune gare ne correspond (le référentiel est construit chaque matin avec celui des trains)."
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table data-testid="stations-table">
              <THead>
                <tr>
                  <Th>Gare</Th>
                  <Th>Abrév.</Th>
                  <Th>Pays</Th>
                  <Th>District</Th>
                  <Th>Lignes</Th>
                </tr>
              </THead>
              <tbody>
                {rows.map((s) => (
                  <Tr key={s.id}>
                    <Td className="max-w-80">
                      <StationName s={s} />
                    </Td>
                    <Td className="font-mono text-small">{s.abbr || "—"}</Td>
                    <Td className="text-small">{s.country}</Td>
                    <Td>
                      <DistrictCell s={s} canEdit={canEdit} />
                    </Td>
                    <Td className="max-w-72">
                      <LinesChain lines={s.lines} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((s) => (
              <li key={s.id} className="min-w-0">
                <ListCard
                  title={<StationName s={s} />}
                  meta={`${s.abbr ? `${s.abbr} · ` : ""}${s.country} · ${s.lines.map((l) => `L.${l}`).join(", ") || "—"}`}
                  aside={canEdit ? undefined : <DistrictCell s={s} canEdit={false} />}
                />
                {canEdit ? (
                  <div className="mt-1">
                    <DistrictCell s={s} canEdit />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function StationName({ s }: { s: StationRow }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2">
      <Link href={trainsHref({ vue: "gare", gare: s.name })} className="link font-medium">
        {s.name}
      </Link>
      {s.nameNl ? <span className="text-small text-fg-muted">{s.nameNl}</span> : null}
      {!s.served ? <span className="text-small text-fg-muted">(traversée seulement)</span> : null}
    </span>
  );
}

function DistrictCell({ s, canEdit }: { s: StationRow; canEdit: boolean }) {
  if (canEdit)
    return <StationDistrict id={s.id} name={s.name} district={s.district} manual={s.manual} />;
  return s.district ? (
    <Badge tone="info">
      {s.district}
      {s.manual ? " · modifié" : ""}
    </Badge>
  ) : (
    <span className="text-small text-fg-muted">—</span>
  );
}
