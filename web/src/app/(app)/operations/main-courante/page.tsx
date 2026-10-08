import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ComposerToggle } from "@/components/ops/composer-toggle";
import { LogBoard } from "@/components/ops/log-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORY, LOG_CATEGORIES } from "@/lib/ops/log";
import { addDays, brusselsDay, formatLongDay } from "@/lib/orders/time";
import { can, isAdmin } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import {
  listLog,
  listMentionable,
  listPinned,
  logListSchema,
  type LogFilters,
} from "@/server/data/ops";
import type { LinkedObject } from "@/server/data/ops";

import { LiveRefresh } from "../../commandes/live-refresh";

export const metadata: Metadata = { title: "Main courante · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<LogFilters & { entree?: string }>;
}) {
  const user = await requirePermission("journal:read");
  const raw = await searchParams;
  const coordinator = isAdmin(user) || user.role === "moderator";
  const f = logListSchema.parse(raw);
  const canWrite = can(user, "journal:write");
  const [{ day, rows, total, search }, pinned, agents] = await Promise.all([
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
  const keep = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const all = {
      jour: day === today ? undefined : day,
      categorie: f.categorie,
      urgentes: f.urgentes ? "1" : undefined,
      retirees: f.retirees ? "1" : undefined,
      ...over,
    };
    for (const [k, v] of Object.entries(all)) if (v) sp.set(k, v);
    return sp.size ? `/operations/main-courante?${sp}` : "/operations/main-courante";
  };
  return (
    <section className="flex flex-col gap-4" aria-label="Main courante">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {search ? (
          <p className="text-body text-fg-muted">
            <span className="font-mono text-fg tabular">{total}</span> résultat(s){" "}
            {f.q ? `pour « ${f.q} »` : "liés au passage à niveau"} (180 derniers jours) ·{" "}
            <Link href={keep({})} className="text-accent underline-offset-2 hover:underline">
              revenir au fil
            </Link>
          </p>
        ) : (
          <nav aria-label="Jour" className="flex items-center gap-1">
            <Button asChild size="icon" variant="ghost" aria-label="Jour précédent">
              <Link href={keep({ jour: addDays(day, -1) })}>
                <ChevronLeft aria-hidden />
              </Link>
            </Button>
            <h2
              className="min-w-0 px-1 text-body-lg font-semibold first-letter:uppercase"
              data-testid="log-day"
            >
              {formatLongDay(day)}
            </h2>
            <Button asChild size="icon" variant="ghost" aria-label="Jour suivant">
              <Link href={keep({ jour: addDays(day, 1) })}>
                <ChevronRight aria-hidden />
              </Link>
            </Button>
            {day !== today ? (
              <Button asChild size="sm" variant="ghost" className="border border-border">
                <Link href={keep({ jour: undefined })}>Aujourd&apos;hui</Link>
              </Button>
            ) : null}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <LiveRefresh topics={["ops_log", "ops_log_reads"]} />
          {!search ? (
            <Button asChild size="sm" variant="ghost" className="border border-border">
              <a href={`/api/operations/main-courante/export?du=${day}&au=${day}`} download>
                <Download aria-hidden /> CSV du jour
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" aria-label="Catégories">
          <Button
            asChild
            size="sm"
            variant={!f.categorie ? "primary" : "ghost"}
            className={f.categorie ? "border border-border" : ""}
          >
            <Link
              href={keep({ categorie: undefined })}
              aria-current={!f.categorie ? "true" : undefined}
            >
              Toutes
            </Link>
          </Button>
          {LOG_CATEGORIES.map((c) => (
            <Button
              key={c}
              asChild
              size="sm"
              variant={f.categorie === c ? "primary" : "ghost"}
              className={f.categorie === c ? "" : "border border-border"}
            >
              <Link
                href={keep({ categorie: c })}
                aria-current={f.categorie === c ? "true" : undefined}
              >
                {CATEGORY[c].label}
              </Link>
            </Button>
          ))}
          <Button
            asChild
            size="sm"
            variant={f.urgentes ? "primary" : "ghost"}
            className={f.urgentes ? "" : "border border-border"}
          >
            <Link href={keep({ urgentes: f.urgentes ? undefined : "1" })} aria-pressed={f.urgentes}>
              Urgentes
            </Link>
          </Button>
          {coordinator ? (
            <Button
              asChild
              size="sm"
              variant={f.retirees ? "primary" : "ghost"}
              className={f.retirees ? "" : "border border-border"}
            >
              <Link
                href={keep({ retirees: f.retirees ? undefined : "1" })}
                aria-pressed={f.retirees}
              >
                Avec les retirées
              </Link>
            </Button>
          ) : null}
        </div>
        <form
          action="/operations/main-courante"
          method="get"
          role="search"
          className="flex gap-2 md:max-w-md"
        >
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher dans la main courante</span>
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
          <Button type="submit">Rechercher</Button>
        </form>
      </div>

      {canWrite ? <ComposerToggle agents={agents} linkKinds={linkKinds} /> : null}

      <LogBoard
        rows={rows}
        pinned={search || day !== today ? [] : pinned}
        me={user.id}
        coordinator={coordinator}
        canWrite={canWrite}
        agents={agents}
        linkKinds={linkKinds}
        showDay={search}
      />
    </section>
  );
}
