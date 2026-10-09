import { ChevronDown, Download, Search, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DutyChip } from "@/components/ops/duty-districts";
import { JournalChat } from "@/components/ops/journal-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY, LOG_CATEGORIES, type LogCategory } from "@/lib/ops/log";
import { addDays, brusselsDay } from "@/lib/orders/time";
import { can, isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import {
  listLog,
  listMentionable,
  listPinned,
  logListSchema,
  type LinkedObject,
  type LogFilters,
} from "@/server/data/ops";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Journal · CSM" };

const chip = (on: boolean) =>
  cn("shrink-0", on ? "" : "border border-border text-fg-muted hover:text-fg");

/** Journal (ex-main courante) : fil plein écran façon messagerie (décision du 9 oct. 2026). */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<LogFilters & { entree?: string; train?: string; categorie?: string }>;
}) {
  const user = await requirePermission("journal:read");
  const raw = await searchParams;
  const coordinator = isAdmin(user) || user.role === "moderator";
  const f = logListSchema.parse(raw);
  const canWrite = can(user, "journal:write");
  const [{ rows, total, search, hasMore, limit }, pinned, agents] = await Promise.all([
    listLog(raw, { coordinator }),
    listPinned(),
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
    : train
      ? "incident"
      : undefined;
  const keep = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const all = {
      categorie: f.categorie,
      urgentes: f.urgentes ? "1" : undefined,
      retirees: f.retirees ? "1" : undefined,
      agents: f.agents ? "1" : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(all)) if (v) sp.set(k, v);
    return sp.size ? `/operations/journal?${sp}` : "/operations/journal";
  };

  const searchForm = (
    <form
      action="/operations/journal"
      method="get"
      role="search"
      className="flex min-w-0 flex-1 gap-2 md:max-w-sm"
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Rechercher dans le journal</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
        />
        <Input
          name="q"
          defaultValue={f.q}
          placeholder="Rechercher (180 jours)…"
          className="pl-9"
          maxLength={80}
        />
      </label>
    </form>
  );
  const csvLink = search ? null : (
    <Button asChild size="sm" variant="ghost" className="border border-border max-sm:hidden">
      <a
        href={`/api/operations/main-courante/export?du=${addDays(today, -6)}&au=${today}`}
        download
      >
        <Download aria-hidden /> CSV 7 j
      </a>
    </Button>
  );
  const active = [f.categorie, f.urgentes, f.retirees, f.agents].filter(Boolean).length;
  const filters = (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label="Filtres">
      <Button
        asChild
        size="sm"
        variant={!f.categorie ? "primary" : "ghost"}
        className={chip(!f.categorie)}
      >
        <Link
          href={keep({ categorie: undefined })}
          aria-current={!f.categorie ? "true" : undefined}
        >
          Tout
        </Link>
      </Button>
      {LOG_CATEGORIES.map((c) => (
        <Button
          key={c}
          asChild
          size="sm"
          variant={f.categorie === c ? "primary" : "ghost"}
          className={chip(f.categorie === c)}
        >
          <Link href={keep({ categorie: c })} aria-current={f.categorie === c ? "true" : undefined}>
            {CATEGORY[c].label}
          </Link>
        </Button>
      ))}
      <Button
        asChild
        size="sm"
        variant={f.urgentes ? "primary" : "ghost"}
        className={chip(f.urgentes)}
      >
        <Link href={keep({ urgentes: f.urgentes ? undefined : "1" })} aria-pressed={f.urgentes}>
          Urgents
        </Link>
      </Button>
      <Button asChild size="sm" variant={f.agents ? "primary" : "ghost"} className={chip(f.agents)}>
        <Link href={keep({ agents: f.agents ? undefined : "1" })} aria-pressed={f.agents}>
          Sans iRail
        </Link>
      </Button>
      {coordinator ? (
        <Button
          asChild
          size="sm"
          variant={f.retirees ? "primary" : "ghost"}
          className={chip(f.retirees)}
        >
          <Link href={keep({ retirees: f.retirees ? undefined : "1" })} aria-pressed={f.retirees}>
            Avec les retirés
          </Link>
        </Button>
      ) : null}
    </div>
  );

  const header = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-x-3 gap-y-2 md:flex-wrap">
        {search ? (
          <p className="min-w-0 flex-1 text-body text-fg-muted md:flex-none">
            <span className="font-mono text-fg tabular">{total}</span> résultat(s){" "}
            {f.q ? `pour « ${f.q} »` : "liés au passage à niveau"} (180 jours) ·{" "}
            <Link href={keep({})} className="text-accent underline-offset-2 hover:underline">
              revenir au fil
            </Link>
          </p>
        ) : (
          <div className="flex min-w-0 flex-1 items-baseline gap-2 md:flex-none">
            <h2 className="text-body-lg font-semibold whitespace-nowrap" data-testid="log-day">
              Fil du journal
            </h2>
            <span className="font-mono text-small text-fg-muted tabular max-sm:hidden">
              {total} message(s)
            </span>
          </div>
        )}
        <div className="hidden min-w-0 flex-1 md:flex">{searchForm}</div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LiveRefresh topics={["ops_log", "ops_log_reads"]} />
          <DutyChip districts={user.duty_districts ?? []} today={user.duty_day === today} />
          <span className="max-md:hidden">{csvLink}</span>
        </div>
      </div>
      <div className="max-md:hidden">{filters}</div>
      <details className="group md:hidden" open={search || active > 0}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-small text-fg-muted [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal aria-hidden className="size-4" /> Rechercher et filtrer
          {active ? <span className="label-mono text-accent">· {active} actif(s)</span> : null}
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
    <section aria-label="Journal">
      <JournalChat
        rows={rows}
        pinned={search ? [] : pinned}
        me={user.id}
        coordinator={coordinator}
        canWrite={canWrite}
        agents={agents}
        linkKinds={linkKinds}
        showDay={search}
        header={header}
        preset={train || presetCategory ? { train, category: presetCategory } : undefined}
        olderHref={hasMore ? keep({ n: String(Math.min(1000, limit + 100)) }) : undefined}
      />
    </section>
  );
}
