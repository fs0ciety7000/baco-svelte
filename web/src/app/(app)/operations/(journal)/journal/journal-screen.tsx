import { ChevronDown, Download, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { pl } from "@/lib/utils";
import { FilterForm } from "@/components/ui/filter-form";
import { ChipRow, FilterChip } from "@/components/ui/filters";
import { DutyChip } from "@/components/ops/duty-districts";
import { JournalChat } from "@/components/ops/journal-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOG_CATEGORIES, type LogCategory } from "@/lib/ops/log";
import { addDays, brusselsDay } from "@/lib/orders/time";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";

import {
  listLog,
  listMentionable,
  listPinned,
  logListSchema,
  type JournalView,
  type LinkedObject,
  type LogFilters,
} from "@/server/data/ops";
import { pbForRequest } from "@/server/data/orders";

import { LiveRefresh } from "@/app/(app)/commandes/live-refresh";

export type JournalSearch = LogFilters & { entree?: string; train?: string; categorie?: string };

const BASE: Record<JournalView, string> = {
  infos: "/operations/journal",
  perturbations: "/operations/perturbations",
};

/**
 * Journal (ex-main courante) : fil plein écran façon messagerie (décision du 9 oct. 2026). Depuis le 4 nov. 2026, deux
 * onglets : **Infos** (messages des agents, `/operations/journal`, seul endroit où l'on écrit) et **Perturbations**
 * (perturbations et travaux iRail, `/operations/perturbations`). Plus de catégories à l'écran (urgent et consignes
 * épinglées gardés) ; les valeurs en base ne changent pas.
 */
export async function JournalScreen({
  view,
  searchParams,
}: {
  view: JournalView;
  searchParams: Promise<JournalSearch>;
}) {
  const user = await requirePermission("journal:read");
  const raw = await searchParams;
  // Lien vers un message précis (cloche, ⌘K, Relève) : ouvert dans l'onglet qui le contient.
  if (typeof raw.entree === "string" && /^[a-z0-9]{15}$/.test(raw.entree)) {
    const pb = await pbForRequest();
    const e = await pb
      .collection("ops_log")
      .getOne(raw.entree, { fields: "source" })
      .catch(() => null);
    const other: JournalView | null = e
      ? e.source === "irail"
        ? view === "infos"
          ? "perturbations"
          : null
        : view === "perturbations"
          ? "infos"
          : null
      : null;
    if (other) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") sp.set(k, v);
      redirect(`${BASE[other]}?${sp}`);
    }
  }
  const coordinator = can(user, "journal:moderate");
  const f = logListSchema.parse(raw);
  // On n'écrit que dans Infos (les perturbations viennent d'iRail).
  const canWrite = view === "infos" && can(user, "journal:write");
  const [{ rows, total, search, hasMore, limit }, pinned, agents] = await Promise.all([
    listLog(raw, { coordinator, view }),
    view === "infos" ? listPinned() : Promise.resolve([]),
    canWrite ? listMentionable() : Promise.resolve([]),
  ]);
  const linkKinds = (
    [
      ["bus", "bus:read"],
      ["taxi", "taxi:read"],
      ["pmr", "deplacements:read"],
      ["pn", "carte_pn:read"],
    ] as const
  )
    .filter(([, p]) => can(user, p))
    .map(([k]) => k as LinkedObject["kind"]);
  const today = brusselsDay();
  // Pré-remplissage de la barre d'écriture (lien « Noter au journal » d'un train, ancienne page « nouveau »).
  const train = typeof raw.train === "string" ? raw.train.slice(0, 20) : "";
  const presetCategory: LogCategory | undefined = (LOG_CATEGORIES as readonly string[]).includes(
    typeof raw.categorie === "string" ? raw.categorie : "",
  )
    ? (raw.categorie as LogCategory)
    : undefined;
  const keep = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const all = {
      urgentes: f.urgentes ? "1" : undefined,
      retirees: f.retirees ? "1" : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(all)) if (v) sp.set(k, v);
    return sp.size ? `${BASE[view]}?${sp}` : BASE[view];
  };

  const searchForm = (
    <FilterForm action={BASE[view]} role="search" className="flex min-w-0 flex-1 gap-2 md:max-w-sm">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">
          {view === "infos" ? "Rechercher dans les infos" : "Rechercher dans les perturbations"}
        </span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
        />
        <Input
          name="q"
          defaultValue={f.q}
          placeholder={
            view === "infos"
              ? "Texte, agent, train (180 jours)…"
              : "Gare, ligne, train (180 jours)…"
          }
          className="pl-9"
          maxLength={80}
        />
      </label>
    </FilterForm>
  );
  const csvLink = search ? null : (
    <Button asChild size="sm" variant="secondary" className="max-sm:hidden">
      <a
        href={`/api/operations/main-courante/export?du=${addDays(today, -6)}&au=${today}`}
        download
      >
        <Download aria-hidden /> CSV 7 j
      </a>
    </Button>
  );
  const active = [f.urgentes, f.retirees].filter(Boolean).length;
  const filters = (
    <ChipRow aria-label="Filtres">
      {view === "infos" ? (
        <FilterChip asChild pressed={f.urgentes}>
          <Link
            href={keep({ urgentes: f.urgentes ? undefined : "1" })}
            aria-current={f.urgentes ? "true" : undefined}
          >
            Urgents
          </Link>
        </FilterChip>
      ) : null}
      {coordinator ? (
        <FilterChip asChild pressed={f.retirees}>
          <Link
            href={keep({ retirees: f.retirees ? undefined : "1" })}
            aria-current={f.retirees ? "true" : undefined}
          >
            Avec les retirés
          </Link>
        </FilterChip>
      ) : null}
    </ChipRow>
  );

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-x-3 gap-y-2 md:flex-wrap">
        {search ? (
          <p className="min-w-0 flex-1 text-body text-fg-muted md:flex-none">
            <span className="figures text-fg">{total}</span> {pl(total, "résultat")}{" "}
            {f.q ? `pour « ${f.q} »` : "liés au passage à niveau"} (180 jours) ·{" "}
            <Link href={keep({})} className="link">
              revenir au fil
            </Link>
          </p>
        ) : (
          <div className="flex min-w-0 flex-1 items-baseline gap-2 max-sm:hidden md:flex-none">
            <h2 className="text-body-lg font-semibold whitespace-nowrap" data-testid="log-day">
              {view === "infos" ? "Infos de l'équipe" : "Perturbations et travaux"}
            </h2>
            <span className="text-small text-fg-muted tabular max-sm:hidden">
              {total} {pl(total, "message")}
            </span>
          </div>
        )}
        <div className="hidden min-w-0 flex-1 md:flex">{searchForm}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LiveRefresh topics={["ops_log", "ops_log_reads"]} />
          <DutyChip
            districts={user.duty_districts ?? []}
            today={user.duty_day === today}
            auto={user.dutyFromQuinyx ?? null}
          />
          <span className="max-md:hidden">{csvLink}</span>
        </div>
      </div>
      <div className="max-md:hidden">{filters}</div>
      <details className="group md:hidden" open={search || active > 0}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-small text-fg-muted [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal aria-hidden className="size-4" /> Rechercher et filtrer
          {active ? (
            <span className="inline-grid h-5 min-w-5 place-items-center rounded-pill bg-surface-2 px-1.5 text-label font-semibold text-fg-muted tabular">
              {active}
              <span className="sr-only"> {pl(active, "actif")}</span>
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className="ml-auto size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-2 pb-1">
          {searchForm}
          {filters}
        </div>
      </details>
    </div>
  );

  return (
    <section aria-label={view === "infos" ? "Journal · Infos" : "Journal · Perturbations"}>
      <JournalChat
        rows={rows}
        pinned={search ? [] : pinned}
        me={user.id}
        coordinator={coordinator}
        canWrite={canWrite}
        canUpdate={can(user, "journal:update")}
        agents={agents}
        linkKinds={linkKinds}
        showDay={search}
        header={header}
        preset={
          canWrite && (train || presetCategory) ? { train, category: presetCategory } : undefined
        }
        olderHref={hasMore ? keep({ n: String(Math.min(1000, limit + 100)) }) : undefined}
        highlight={f.q ? f.q.split(/\s+/).filter(Boolean) : []}
      />
    </section>
  );
}
