import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pl } from "@/lib/utils";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { ContactBoard } from "@/components/referentiels/contact-board";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { contactFacets, listContacts } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "Annuaire · CSM" };

type SP = { q?: string; category?: string; zone?: string; group?: string; page?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("repertoire:read");
  const f = await searchParams;
  const q = (f.q ?? "").trim();
  const [{ rows, total }, facets] = await Promise.all([
    listContacts({ q, category: f.category, zone: f.zone, group: f.group, page: f.page }),
    contactFacets(),
  ]);
  const canWrite = can(user, "repertoire:write");
  return (
    <section className="flex flex-col gap-4" aria-label="Annuaire">
      <p className="text-body text-fg-muted" data-testid="contacts-count">
        <span className="font-mono text-fg tabular">{total}</span> {pl(total, "contact")}
        {total > rows.length ? ` · ${rows.length} affichés : affinez les filtres` : ""}
      </p>
      <FilterForm
        action="/referentiels"
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
        <FormAutoSubmit />
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-60">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder="Nom, tél., e-mail, groupe…"
              className="pl-9"
              maxLength={60}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-44">
          <span className="text-small text-fg-muted">Catégorie</span>
          <Select name="category" defaultValue={f.category ?? ""}>
            <option value="">Toutes</option>
            {facets.categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-40">
          <span className="text-small text-fg-muted">Zone</span>
          <Select name="zone" defaultValue={f.zone ?? ""}>
            <option value="">Toutes</option>
            {facets.zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-44">
          <span className="text-small text-fg-muted">Groupe</span>
          <Select name="group" defaultValue={f.group ?? ""}>
            <option value="">Tous</option>
            {facets.groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </label>
        <div className="col-span-2 flex gap-2">
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
          <Button asChild variant="ghost">
            <Link href="/referentiels">Effacer</Link>
          </Button>
        </div>
      </FilterForm>
      <ContactBoard rows={rows} facets={facets} canWrite={canWrite} />
    </section>
  );
}
