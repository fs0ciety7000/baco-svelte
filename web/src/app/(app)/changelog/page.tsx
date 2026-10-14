import type { Metadata } from "next";

import { ReleaseSections, releaseDate } from "@/components/changelog/release-notes";
import { ChangelogBoard } from "@/components/team/changelog-board";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { releases } from "@/server/changelog";
import { listChangelog, type ChangelogEntry } from "@/server/data/team";

export const metadata: Metadata = { title: "Nouveautés · CSM" };

/**
 * Nouveautés de CSM (14 oct. 2026, ex-/equipe/nouveautes) : le CHANGELOG.md du dépôt, puis les annonces de l'équipe
 * (collection `changelog`, publiées par admin / sysop / modérateur ; masquées à l'invité comme avant). Hors module :
 * garde = agent connecté (le rôle « Écran » est renvoyé vers /tv par requireUser).
 */
export default async function ChangelogPage() {
  const user = await requireUser();
  const all = releases();
  const showAnnouncements = can(user, "changelog:read");
  let announcements: ChangelogEntry[] = [];
  if (showAnnouncements) {
    try {
      announcements = (await listChangelog(1)).items;
    } catch {
      announcements = [];
    }
  }

  const notes =
    all.length === 0 ? (
      <EmptyState
        title="Pas encore de nouveautés"
        description="Les évolutions de CSM apparaîtront ici."
      />
    ) : (
      <ol className="flex flex-col gap-4" data-testid="releases">
        {all.map((r, i) => (
          <li key={r.version}>
            <Card className="gap-4 p-4 md:p-5" data-testid={`release-${r.version}`}>
              <header className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-fg-muted">
                  <span className="font-mono font-semibold text-fg tabular">
                    Version {r.version}
                  </span>
                  <span aria-hidden>·</span>
                  <time dateTime={r.date}>{releaseDate(r.date)}</time>
                  {i === 0 ? (
                    <span className="rounded-control bg-accent-soft px-1.5 text-fg">Actuelle</span>
                  ) : null}
                </p>
                {r.title ? <h2 className="text-h3 font-semibold text-fg">{r.title}</h2> : null}
              </header>
              <ReleaseSections sections={r.sections} />
            </Card>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-3 md:gap-4 md:px-6 md:py-4">
      <h1 className="sr-only">Nouveautés de CSM</h1>
      <div data-page-body className="flex min-w-0 flex-col gap-4">
        <p className="text-small text-fg-muted">
          Ce qui change dans CSM à chaque mise à jour
          {all[0] ? ` · version actuelle ${all[0].version}` : ""}.
        </p>
        {showAnnouncements ? (
          <Tabs defaultValue="versions">
            <TabsList aria-label="Nouveautés">
              <TabsTrigger value="versions">Mises à jour</TabsTrigger>
              <TabsTrigger value="annonces" count={announcements.length || undefined}>
                Annonces de l’équipe
              </TabsTrigger>
            </TabsList>
            <TabsContent value="versions">{notes}</TabsContent>
            <TabsContent value="annonces">
              <ChangelogBoard items={announcements} canEdit={can(user, "changelog:write")} />
            </TabsContent>
          </Tabs>
        ) : (
          notes
        )}
      </div>
    </div>
  );
}
