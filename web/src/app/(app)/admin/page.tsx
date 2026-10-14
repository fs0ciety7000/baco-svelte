import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pl } from "@/lib/utils";
import { ClearFilters, FilterSubmit } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { UserCreate } from "@/components/admin/user-create";
import { Avatar } from "@/components/shell/avatar";
import { Input, Select } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { assignableRoles, roleLabel } from "@/lib/roles";
import { DISTRICT_SHORT } from "@/lib/team";
import { requireAdmin } from "@/server/auth";
import { listUsers } from "@/server/data/admin";
import { listRoles } from "@/server/data/roles";

export const metadata: Metadata = { title: "Utilisateurs · CSM" };

type SP = { q?: string; role?: string; district?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  const me = await requireAdmin();
  const f = await searchParams;
  const rows = (await listUsers({ q: f.q ?? "", role: f.role, district: f.district })).filter(
    (u) => u.role !== "connector",
  );
  // Rôles lus dans la collection `roles` (lot L3) : filtre, libellés, création de compte.
  const roles = await listRoles();
  const choices = assignableRoles(roles);
  const filterRoles = [...choices.map((r) => r.key), "disabled"];
  const label = (k: string) => roleLabel(k, roles);
  return (
    <section className="flex flex-col gap-4" aria-label="Utilisateurs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body text-fg-muted">
          <span className="font-mono text-fg tabular">{rows.length}</span>{" "}
          {pl(rows.length, "compte")}
        </p>
        <UserCreate roles={choices} canAssignFull={me.role === "admin"} />
      </div>
      <FilterForm
        action="/admin"
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
        <label className="col-span-2 flex min-w-0 flex-col gap-1 md:w-64">
          <span className="text-small text-fg-muted">Recherche</span>
          <span className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              name="q"
              defaultValue={f.q}
              placeholder="Nom, e-mail, identifiant…"
              className="pl-9"
              maxLength={60}
            />
          </span>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-44">
          <span className="text-small text-fg-muted">Rôle</span>
          <CustomSelect
            name="role"
            defaultValue={f.role ?? ""}
            options={[
              { value: "", label: "Tous" },
              ...filterRoles.map((r) => ({ value: r, label: label(r) })),
            ]}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-44">
          <span className="text-small text-fg-muted">District</span>
          <Select name="district" defaultValue={f.district ?? ""}>
            <option value="">Tous</option>
            {Object.entries(DISTRICT_SHORT).map(([d, s]) => (
              <option key={d} value={d}>
                {s} · {d}
              </option>
            ))}
          </Select>
        </label>
        <div className="col-span-2 flex gap-2">
          <FilterSubmit />
          <ClearFilters href="/admin" />
        </div>
      </FilterForm>
      {rows.length === 0 ? (
        <EmptyState title="Aucun compte" description="Aucun compte ne correspond à ces filtres." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Agent</Th>
                  <Th>E-mail</Th>
                  <Th>Rôle</Th>
                  <Th>Districts</Th>
                  <Th>Droits ajustés</Th>
                  <Th>État</Th>
                </tr>
              </THead>
              <tbody data-testid="users-table">
                {rows.map((u) => (
                  <Tr key={u.id}>
                    <Td>
                      <Link
                        href={`/admin/utilisateurs/${u.id}`}
                        className="flex items-center gap-2 font-medium link"
                      >
                        <Avatar name={u.name} email={u.email} role={u.role} />
                        {u.name || u.username || "—"}
                      </Link>
                    </Td>
                    <Td className="break-all text-fg-muted">{u.email}</Td>
                    <Td>{label(u.role === "disabled" ? u.disabledRole : u.role)}</Td>
                    <Td>
                      {u.districts.length
                        ? u.districts.map((d) => DISTRICT_SHORT[d] ?? d).join(" · ")
                        : "—"}
                    </Td>
                    <Td className="tabular">
                      {u.grants.length || u.denies.length
                        ? `+${u.grants.length} / −${u.denies.length}`
                        : "—"}
                    </Td>
                    <Td>
                      {u.role === "disabled" ? (
                        <Badge tone="danger">Désactivé</Badge>
                      ) : (
                        <Badge tone="ok">Actif</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/admin/utilisateurs/${u.id}`}
                  className="flex min-h-14 items-center gap-3 border border-border bg-surface px-3 py-2"
                >
                  <Avatar name={u.name} email={u.email} role={u.role} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{u.name || u.username || "—"}</span>
                    <span className="truncate text-small text-fg-muted">
                      {label(u.role === "disabled" ? u.disabledRole : u.role)}
                      {u.districts.length
                        ? ` · ${u.districts.map((d) => DISTRICT_SHORT[d] ?? d).join(" · ")}`
                        : ""}
                    </span>
                  </span>
                  {u.role === "disabled" ? <Badge tone="danger">Désactivé</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
