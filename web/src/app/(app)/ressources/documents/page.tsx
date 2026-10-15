import type { Metadata } from "next";

import { ClearFilters, FilterSubmit, SegmentedNav } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { DocumentBoard } from "@/components/referentiels/document-board";
import { ProcedureBoard } from "@/components/referentiels/procedure-board";
import { TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";

import {
  documentCategories,
  listDocumentOptions,
  listDocuments,
  listProcedures,
  procedureCategories,
} from "@/server/data/referentiels";

export const metadata: Metadata = { title: "Procédures et documents · CSM" };

type SP = { vue?: string; q?: string; categorie?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePermission("documents:read");
  const f = await searchParams;
  const vue = f.vue === "documents" ? "documents" : "procedures";
  const q = (f.q ?? "").trim();
  const categorie = (f.categorie ?? "").trim();
  const canWrite = can(user, "documents:write");
  const canUpdate = can(user, "documents:update");
  const canDelete = can(user, "documents:delete");
  const categories = vue === "documents" ? await documentCategories() : await procedureCategories();

  return (
    <section className="flex flex-col gap-4" aria-label="Procédures et documents">
      {/* Barre d'outils sur une ligne (v4 lot 6) : vue en contrôle segmenté, recherche, catégorie. */}
      <FilterForm
        action="/ressources/documents"
        role="search"
        className={TOOLBAR}
        data-testid="documents-toolbar"
      >
        <SegmentedNav
          label="Vue"
          items={[
            {
              label: "Procédures",
              href: "/ressources/documents",
              current: vue === "procedures",
            },
            {
              label: "Documents",
              href: "/ressources/documents?vue=documents",
              current: vue === "documents",
            },
          ]}
        />
        {vue === "documents" ? <input type="hidden" name="vue" value="documents" /> : null}
        <ToolbarSearch
          defaultValue={q}
          placeholder={vue === "documents" ? "Nom du fichier…" : "Titre ou contenu…"}
        />
        <label className="min-w-0 flex-1 md:w-48 md:flex-none">
          <span className="sr-only">Catégorie</span>
          <Select
            name="categorie"
            label="Catégorie"
            defaultValue={categorie}
            options={[
              { value: "", label: "Toutes les catégories" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
          />
        </label>
        <FilterSubmit />
        <ClearFilters
          href={
            vue === "documents" ? "/ressources/documents?vue=documents" : "/ressources/documents"
          }
        />
      </FilterForm>

      {vue === "procedures" ? (
        <ProcedureBoard
          procedures={await listProcedures({ q, category: categorie })}
          categories={categories}
          documents={await listDocumentOptions()}
          canWrite={canWrite}
          canUpdate={canUpdate}
          canDelete={canDelete}
        />
      ) : (
        <DocumentBoard
          documents={await listDocuments({ q, category: categorie })}
          categories={categories}
          canWrite={canWrite}
          canDelete={canDelete}
        />
      )}
    </section>
  );
}
