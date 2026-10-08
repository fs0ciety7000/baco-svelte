import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DocumentBoard } from "@/components/referentiels/document-board";
import { ProcedureBoard } from "@/components/referentiels/procedure-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { can, isAdmin } from "@/lib/permissions";
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
  const canWrite = can(user, "documents:write");
  const canManage = isAdmin(user) || user.role === "moderator";

  return (
    <section className="flex flex-col gap-4" aria-label="Procédures et documents">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Vue">
        <Button asChild variant={vue === "procedures" ? "primary" : "ghost"} className={vue === "procedures" ? "" : "border border-border"}>
          <Link href="/referentiels/documents">Procédures</Link>
        </Button>
        <Button asChild variant={vue === "documents" ? "primary" : "ghost"} className={vue === "documents" ? "" : "border border-border"}>
          <Link href="/referentiels/documents?vue=documents">Documents</Link>
        </Button>
      </div>

      <form action="/referentiels/documents" method="get" role="search" className="flex flex-wrap items-end gap-2">
        {vue === "documents" ? <input type="hidden" name="vue" value="documents" /> : null}
        <label className="flex min-w-0 flex-1 flex-col gap-1 md:max-w-80">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" />
            <Input name="q" defaultValue={q} placeholder={vue === "documents" ? "Nom du fichier…" : "Titre ou contenu…"} className="pl-9" maxLength={60} />
          </span>
        </label>
        <Button type="submit" variant="secondary">
          Filtrer
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href={vue === "documents" ? "/referentiels/documents?vue=documents" : "/referentiels/documents"}>Effacer</Link>
          </Button>
        ) : null}
      </form>

      {vue === "procedures" ? (
        <ProcedureBoard
          procedures={await listProcedures({ q })}
          categories={await procedureCategories()}
          documents={await listDocumentOptions()}
          canWrite={canWrite}
          canManage={canManage}
        />
      ) : (
        <DocumentBoard
          documents={await listDocuments({ q })}
          categories={await documentCategories()}
          canWrite={canWrite}
          canManage={canManage}
        />
      )}
    </section>
  );
}
