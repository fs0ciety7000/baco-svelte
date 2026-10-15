import type { Metadata } from "next";

import { DistrictMenu } from "@/components/ui/district-picker";
import { DISTRICT_NAME_OPTIONS, parseDistricts } from "@/lib/district-param";
import { pl } from "@/lib/utils";
import { ClearFilters, FilterSubmit } from "@/components/ui/filters";
import { FilterForm } from "@/components/ui/filter-form";
import { PhoneLink } from "@/components/pmr/phone-link";
import { Avatar } from "@/components/shell/avatar";
import { ListCount, ListStatus, TOOLBAR, ToolbarSearch } from "@/components/ui/list-toolbar";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { FULL_ROLE_KEYS, roleLabel } from "@/lib/roles";
import { DISTRICT_SHORT } from "@/lib/team";
import { listRoles } from "@/server/data/roles";
import { requireRoute } from "@/server/auth";
import { listTeam } from "@/server/data/team";

export const metadata: Metadata = { title: "Annuaire de l'équipe · CSM" };

const DISTRICT_NAMES = ["Sud-Ouest", "Sud-Est", "Centre"];

type SP = { q?: string; district?: string | string[] };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRoute("/ressources/equipe");
  const f = await searchParams;
  const [rows, roles] = await Promise.all([
    listTeam({ q: f.q ?? "", district: f.district }),
    listRoles(),
  ]);
  return (
    <section className="flex flex-col gap-4" aria-label="Annuaire de l'équipe">
      {/* Barre d'outils sur une ligne (v4 lot 6) : recherche, districts en menu. */}
      <FilterForm
        action="/ressources/equipe"
        role="search"
        className={TOOLBAR}
        data-testid="team-toolbar"
      >
        <ToolbarSearch defaultValue={f.q} placeholder="Nom, identifiant, fonction…" />
        <div className="min-w-0">
          <DistrictMenu
            name="district"
            label="Districts"
            options={DISTRICT_NAME_OPTIONS}
            defaultValues={parseDistricts(f.district, DISTRICT_NAMES)}
            data-testid="district-picker"
          />
        </div>
        <FilterSubmit />
        <ClearFilters href="/ressources/equipe" />
      </FilterForm>
      <ListStatus count={<ListCount n={rows.length} label={pl(rows.length, "agent")} />} />
      {rows.length === 0 ? (
        <EmptyState
          framed
          title="Aucun agent"
          description="Aucun agent ne correspond à ces filtres."
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="team-list">
          {rows.map((m) => (
            <li
              key={m.id}
              className="flex min-w-0 items-center gap-3 border border-(--card-frame) bg-surface px-3 py-3 rounded-box shadow-rest"
            >
              <Avatar
                name={m.name}
                email={m.username}
                id={m.id}
                avatar={m.avatar}
                role={m.role}
                className="size-10 rounded-[min(var(--r-box),8px)]"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-body font-medium text-fg">{m.name}</span>
                  {m.status ? <Badge tone="info">{m.status}</Badge> : null}
                </span>
                <span className="truncate text-small text-fg-muted">
                  {m.fonction || roleLabel(m.role, roles) || "—"}
                </span>
                {m.workPhone ? (
                  <span className="text-small">
                    <PhoneLink phone={m.workPhone} />
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {m.districts.length ? (
                  <Badge tone="info">
                    {m.districts.map((d) => DISTRICT_SHORT[d] ?? d).join(" · ")}
                  </Badge>
                ) : null}
                {FULL_ROLE_KEYS.includes(m.role) ? (
                  <span className="text-label text-fg-subtle">{roleLabel(m.role, roles)}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
