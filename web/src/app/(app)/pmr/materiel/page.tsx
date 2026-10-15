import type { Metadata } from "next";

import { FilterSubmit, SegmentedNav } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { EquipmentBoard } from "@/components/pmr/equipment-board";
import { TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/permissions";
import { brusselsDay } from "@/lib/orders/time";

import { requirePermission } from "@/server/auth";
import { EQUIPMENT_VIEWS, listEquipment, listZones, type EquipmentView } from "@/server/data/pmr";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Rampes et matériel · CSM" };

const VIEW_LABEL: Record<EquipmentView, string> = {
  "hors-service": "Hors service",
  reparation: "Réparation demandée",
  validite: "Validité dépassée",
  toutes: "Toutes",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string; q?: string; zone?: string }>;
}) {
  const user = await requirePermission("pmr:read");
  const sp = await searchParams;
  const [list, zones] = await Promise.all([
    listEquipment({ view: sp.vue ?? "hors-service", q: sp.q, zone: sp.zone }),
    listZones(),
  ]);
  const link = (v: EquipmentView) =>
    `/pmr/materiel?${new URLSearchParams({ vue: v, ...(sp.q ? { q: sp.q } : {}), ...(sp.zone ? { zone: sp.zone } : {}) })}`;
  return (
    <section className="flex flex-col gap-4" aria-label="Rampes et matériel">
      {/* Barre d'outils sur une ligne (v4 lot 6) : vues avec compteurs, recherche, zone, direct à droite. */}
      <FilterForm
        action="/pmr/materiel"
        role="search"
        className={TOOLBAR}
        data-testid="equipment-toolbar"
      >
        <nav aria-label="Vues" className="min-w-0 max-md:w-full">
          <SegmentedNav
            label="Vue"
            scroll
            items={EQUIPMENT_VIEWS.map((v) => ({
              label: VIEW_LABEL[v],
              href: link(v),
              current: v === list.view,
              count: list.counts[v],
            }))}
          />
        </nav>
        <input type="hidden" name="vue" value={list.view} />
        <ToolbarSearch defaultValue={sp.q} placeholder="Gare, quai, n° de rampe…" />
        <label className="min-w-0 flex-1 md:w-48 md:flex-none">
          <span className="sr-only">Zone</span>
          <Select
            name="zone"
            label="Zone"
            defaultValue={sp.zone ?? ""}
            options={[
              { value: "", label: "Toutes les zones" },
              ...zones.map((z) => ({ value: z.id, label: z.code })),
            ]}
          />
        </label>
        <FilterSubmit />
        <span className="ml-auto">
          <LiveRefresh topics={["pmr_equipment"]} />
        </span>
      </FilterForm>
      <EquipmentBoard
        rows={list.rows}
        zones={zones}
        today={brusselsDay()}
        canWrite={can(user, "pmr:write")}
        coordinator={can(user, "pmr_equipment:manage")}
      />
    </section>
  );
}
