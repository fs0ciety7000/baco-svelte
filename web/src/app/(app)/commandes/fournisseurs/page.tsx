import type { Metadata } from "next";
import Link from "next/link";

import { SupplierBoard } from "@/components/orders/supplier-board";
import { RefSearchBar } from "@/components/referentiels/ref-ui";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { can } from "@/lib/permissions";
import { pl } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { listSuppliers, type SupplierKind } from "@/server/data/suppliers";

export const metadata: Metadata = { title: "Fournisseurs · CSM" };

// Fournisseurs (demande du 11 oct. 2026) : sociétés de bus et de taxi gérées dans CSM (plus seulement dans l'admin
// PocketBase). Lecture `otto:read` / `generate_taxi:read`, création / modification / suppression selon les droits.

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string }>;
}) {
  const user = await requireRoute("/commandes/fournisseurs");
  const sp = await searchParams;
  const canBus = can(user, "otto:read");
  const canTaxi = can(user, "generate_taxi:read");
  const kind: SupplierKind = (sp.type === "taxi" && canTaxi) || !canBus ? "taxi" : "bus";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const rows = await listSuppliers(kind, q);
  const perm = kind === "bus" ? "otto" : "generate_taxi";
  return (
    <section className="flex flex-col gap-4" aria-label="Fournisseurs">
      {canBus && canTaxi ? (
        <ChipRow aria-label="Type de fournisseur">
          {(["bus", "taxi"] as const).map((k) => (
            <FilterChip key={k} asChild pressed={k === kind}>
              <Link
                href={`/commandes/fournisseurs?type=${k}`}
                aria-current={k === kind ? "true" : undefined}
              >
                {k === "bus" ? "Sociétés de bus" : "Sociétés de taxi"}
              </Link>
            </FilterChip>
          ))}
        </ChipRow>
      ) : null}
      <RefSearchBar
        action="/commandes/fournisseurs"
        q={q}
        hidden={{ type: kind }}
        placeholder="Nom, e-mail, téléphone, lieu…"
      />
      <p className="text-body text-fg-muted" data-testid="suppliers-count">
        <span className="font-mono text-fg tabular">{rows.length}</span>{" "}
        {pl(
          rows.length,
          kind === "bus" ? "société de bus" : "société de taxi",
          kind === "bus" ? "sociétés de bus" : "sociétés de taxi",
        )}
      </p>
      <SupplierBoard
        kind={kind}
        rows={rows}
        canWrite={can(user, `${perm}:write`)}
        canUpdate={can(user, `${perm}:update`)}
        canDelete={can(user, `${perm}:delete`)}
      />
    </section>
  );
}
