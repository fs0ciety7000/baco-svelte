import type { Metadata } from "next";
import Link from "next/link";

import { DistrictMenu } from "@/components/ui/district-picker";
import { DISTRICT_NAME_OPTIONS, parseDistricts } from "@/lib/district-param";
import { pl } from "@/lib/utils";
import { ClearFilters, FilterSubmit } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { UserCreate } from "@/components/admin/user-create";
import { Avatar } from "@/components/shell/avatar";
import { ListCount, ListStatus, TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
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

type SP = { q?: string; role?: string; district?: string | string[] };
const DISTRICT_NAMES = ["Sud-Ouest", "Sud-Est", "Centre"];

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
      {/* Barre d'outils sur une ligne (v4 lot 6) : recherche, rôle, districts en menu, « Nouveau compte » à droite. */}
      <div className={TOOLBAR} data-testid="users-toolbar">
        <FilterForm action="/admin" role="search" className="contents">
          <ToolbarSearch defaultValue={f.q} placeholder="Nom, e-mail, identifiant…" />
          <label className="min-w-44 flex-1 md:min-w-0 md:w-48 md:flex-none">
            <span className="sr-only">Rôle</span>
            <CustomSelect
              name="role"
              label="Rôle"
              defaultValue={f.role ?? ""}
              options={[
                { value: "", label: "Tous les rôles" },
                ...filterRoles.map((r) => ({ value: r, label: label(r) })),
              ]}
            />
          </label>
          <div className="min-w-0">
            <DistrictMenu
              name="district"
              label="Districts"
              options={DISTRICT_NAME_OPTIONS}
              defaultValues={parseDistricts(f.district, DISTRICT_NAMES)}
            />
          </div>
          <FilterSubmit />
          <ClearFilters href="/admin" />
        </FilterForm>
        {/* Hors du formulaire de filtres : le bouton du dialogue ne doit pas le soumettre. */}
        <div className="ml-auto">
          <UserCreate roles={choices} canAssignFull={me.role === "admin"} />
        </div>
      </div>
      <ListStatus count={<ListCount n={rows.length} label={pl(rows.length, "compte")} />} />
      {rows.length === 0 ? (
        <EmptyState
          framed
          title="Aucun compte"
          description="Aucun compte ne correspond à ces filtres."
        />
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
                        <Avatar
                          name={u.name}
                          email={u.email}
                          role={u.role}
                          className="rounded-[min(var(--r-box),8px)]"
                        />
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
                  className="flex min-h-14 items-center gap-3 border border-(--card-frame) bg-surface px-3 py-2 rounded-box shadow-rest"
                >
                  <Avatar
                    name={u.name}
                    email={u.email}
                    role={u.role}
                    className="rounded-[min(var(--r-box),8px)]"
                  />
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
