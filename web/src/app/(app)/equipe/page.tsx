import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { pl } from "@/lib/utils";
import { FilterForm } from "@/components/ui/filter-form";
import { PhoneLink } from "@/components/pmr/phone-link";
import { Avatar } from "@/components/shell/avatar";
import { Button } from "@/components/ui/button";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { DISTRICT_SHORT, ROLE_LABEL } from "@/lib/team";
import { requireRoute } from "@/server/auth";
import { listTeam } from "@/server/data/team";

export const metadata: Metadata = { title: "Annuaire de l'équipe · CSM" };

type SP = { q?: string; district?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRoute("/equipe");
  const f = await searchParams;
  const rows = await listTeam({ q: f.q ?? "", district: f.district as never });
  return (
    <section className="flex flex-col gap-4" aria-label="Annuaire de l'équipe">
      <FilterForm
        action="/equipe"
        role="search"
        className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-end"
      >
        <FormAutoSubmit />
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
              placeholder="Nom, identifiant, fonction…"
              className="pl-9"
              maxLength={60}
            />
          </span>
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
          <Button type="submit" variant="secondary">
            Filtrer
          </Button>
          <Button asChild variant="ghost">
            <Link href="/equipe">Effacer</Link>
          </Button>
        </div>
      </FilterForm>
      <p className="text-body text-fg-muted">
        <span className="font-mono text-fg tabular">{rows.length}</span> {pl(rows.length, "agent")}
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Aucun agent" description="Aucun agent ne correspond à ces filtres." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" data-testid="team-list">
          {rows.map((m) => (
            <li
              key={m.id}
              className="flex min-w-0 items-center gap-3 border border-border bg-surface px-3 py-3"
            >
              <Avatar
                name={m.name}
                email={m.username}
                id={m.id}
                avatar={m.avatar}
                className="size-10"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-body font-medium text-fg">{m.name}</span>
                <span className="truncate text-small text-fg-muted">
                  {m.fonction || ROLE_LABEL[m.role] || "—"}
                </span>
                {m.workPhone ? (
                  <span className="text-small">
                    <PhoneLink phone={m.workPhone} />
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {m.district ? (
                  <Badge tone="info">{DISTRICT_SHORT[m.district] ?? m.district}</Badge>
                ) : null}
                {m.role === "moderator" || m.role === "admin" || m.role === "sysop" ? (
                  <span className="label-mono text-fg-muted">{ROLE_LABEL[m.role]}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
