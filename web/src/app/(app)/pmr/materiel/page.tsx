import Form from "next/form";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EquipmentBoard } from "@/components/pmr/equipment-board";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { can, isAdmin } from "@/lib/permissions";
import { brusselsDay } from "@/lib/orders/time";
import { cn } from "@/lib/utils";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Vues" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <ul className="flex gap-1.5">
            {EQUIPMENT_VIEWS.map((v) => (
              <li key={v}>
                <Link
                  href={link(v)}
                  aria-current={v === list.view ? "page" : undefined}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 border px-3 text-body whitespace-nowrap md:h-control",
                    v === list.view
                      ? "border-accent bg-[color-mix(in_oklab,var(--accent)_12%,var(--surface))] text-fg"
                      : "border-border text-fg-muted hover:text-fg",
                  )}
                >
                  {VIEW_LABEL[v]}{" "}
                  <span className="font-mono text-small tabular text-fg-muted">
                    {list.counts[v]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <LiveRefresh topics={["pmr_equipment"]} />
      </div>
      <Form
        action="/pmr/materiel"
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:items-end"
      >
        <input type="hidden" name="vue" value={list.view} />
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-64">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={sp.q}
              placeholder="Gare, quai, n° de rampe…"
              className="pl-9"
              maxLength={60}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-32">
          <span className="text-small text-fg-muted">Zone</span>
          <Select name="zone" defaultValue={sp.zone ?? ""}>
            <option value="">Toutes</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.code}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          Filtrer
        </Button>
      </Form>
      <EquipmentBoard
        rows={list.rows}
        zones={zones}
        today={brusselsDay()}
        canWrite={can(user, "pmr:write")}
        coordinator={isAdmin(user) || user.role === "moderator"}
      />
    </section>
  );
}
