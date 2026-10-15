import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { NewRoleDialog, type BaseChoice } from "@/components/admin/roles/new-role-dialog";
import { CatalogNote, RoleDot } from "@/components/admin/roles/role-bits";
import { NON_ASSIGNABLE } from "@/lib/roles";
import { adjustmentsOf, effectivePerms, isVisible } from "@/lib/roles-editor";
import { pl } from "@/lib/utils";
import { requireAdmin } from "@/server/auth";
import { getUser } from "@/server/data/admin";
import { listRolesAdmin, roleUsage } from "@/server/data/roles";

export const metadata: Metadata = { title: "Rôles · Administration · CSM" };

type SP = { depuis?: string };

/** Administration › Rôles (rôles v3, lot L4) : un rôle = un ensemble de droits ; cartes + « Nouveau rôle ». */
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [roles, usage] = await Promise.all([listRolesAdmin(), roleUsage()]);
  const shown = roles.filter((r) => !NON_ASSIGNABLE.includes(r.key));
  const count = (k: string) => usage[k]?.active ?? 0;
  const bases: BaseChoice[] = shown
    .filter((r) => !r.locked)
    .map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      color: r.color,
      count: count(r.key),
    }));
  // « Créer un rôle à partir de ces ajustements » (fiche d'un agent) : rôle + ajustements de cet agent.
  let prefill: { base: string; perms: string[]; who: string } | undefined;
  if (sp.depuis && /^[a-z0-9-]{15,36}$/.test(sp.depuis)) {
    const u = await getUser(sp.depuis).catch(() => null);
    const role = u ? roles.find((r) => r.key === u.role) : undefined;
    if (u && role && !role.locked) {
      const perms = effectivePerms(role.key, role.perms, adjustmentsOf(u.grants, u.denies)).filter(
        isVisible,
      );
      prefill = { base: role.key, perms, who: u.name || u.username || "cet agent" };
    }
  }
  return (
    <section className="flex flex-col gap-4" aria-label="Rôles">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-body text-fg-muted">
          Un rôle est un ensemble de droits. Chaque agent a un rôle, et peut recevoir des
          ajustements personnels depuis sa fiche.
        </p>
        <NewRoleDialog key={prefill ? `p-${sp.depuis}` : "n"} bases={bases} prefill={prefill} />
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="role-cards">
        {shown.map((r) => {
          const n = count(r.key);
          return (
            <li key={r.id}>
              <Link
                href={`/admin/roles/${r.key}`}
                data-testid={`role-card-${r.key}`}
                className="chamfer flex h-full min-h-11 flex-col gap-2 p-4 shadow-rest transition-colors [--frame:var(--card-frame)] hover:[--fill:var(--surface-2)]"
              >
                <span className="flex items-center gap-2">
                  <RoleDot color={r.color} />
                  <span className="text-body-lg font-semibold text-fg">{r.label}</span>
                  {r.locked ? (
                    <Lock aria-label="Non modifiable" className="ml-auto size-4 text-fg-muted" />
                  ) : null}
                </span>
                {r.description ? (
                  <span className="text-small text-fg-muted">{r.description}</span>
                ) : null}
                <span className="mt-auto flex flex-wrap gap-1.5 pt-1 text-hint text-fg-muted">
                  <span className="rounded-pill bg-surface-2 px-2 py-0.5">
                    <span className="font-medium text-fg tabular">{n}</span> {pl(n, "agent")}
                  </span>
                  <span className="rounded-pill bg-surface-2 px-2 py-0.5">
                    {r.system ? "Rôle CSM" : "Créé par l'équipe"}
                  </span>
                  {r.locked ? (
                    <span className="rounded-pill bg-surface-2 px-2 py-0.5">Non modifiable</span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <CatalogNote />
    </section>
  );
}
