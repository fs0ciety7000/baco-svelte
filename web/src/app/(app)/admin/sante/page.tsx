import type { Metadata } from "next";

import { MaintenanceToggle } from "@/components/admin/maintenance-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/status-badge";
import { Table, Td, Th, THead } from "@/components/ui/table";
import { sinceLabel } from "@/lib/orders/time";
import { isNewer } from "@/lib/pmr/extension-releases";
import {
  archivesVerdict,
  backupVerdict,
  cronVerdict,
  everyLabel,
  formatBytes,
  toMs,
  type Verdict,
} from "@/lib/supervision";
import { requireAdmin } from "@/server/auth";
import { getSetting, moduleVolumes } from "@/server/data/admin";
import { env } from "@/server/env";
import { readExtensionRelease } from "@/server/extension";
import { readSupervision, supervisionEnabled } from "@/server/supervision";

export const metadata: Metadata = { title: "Santé · CSM" };

async function pbHealth(): Promise<{ ok: boolean; ms: number }> {
  const t = Date.now();
  try {
    const res = await fetch(`${env.PB_URL}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return { ok: res.ok, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

const TONE: Record<Verdict, Tone> = { ok: "ok", warn: "warn", danger: "danger", idle: "neutral" };
const CRON_LABEL: Record<string, string> = {
  "train-watches": "Trains suivis",
  "mission-trains": "Retards des trains de mission",
  "irail-journal": "Perturbations iRail → Journal",
  "order-pdf-r2": "Archives des bons → R2",
  "dicos-stale": "Alerte synchro DICOS",
  "pmr-retention": "Conservation PMR (12 / 24 mois)",
  "notifications-purge": "Purge des notifications",
  "user-sessions-purge": "Purge des sessions",
  "order-pdf-backup": "Zips mensuels des bons",
  "journal-retention": "Conservation du Journal",
};

const since = (v: string) => {
  const t = toMs(v);
  return Number.isNaN(t) ? "—" : sinceLabel(new Date(t));
};

export default async function Page() {
  await requireAdmin();
  const [health, volumes, maintenance, sup, release] = await Promise.all([
    pbHealth(),
    moduleVolumes(),
    getSetting<{ on?: boolean; message?: string }>("maintenance"),
    readSupervision(),
    readExtensionRelease(),
  ]);
  const now = Date.now();
  const backup = sup?.backups;
  const bv = backupVerdict(backup?.last?.modified, now);
  const av = sup ? archivesVerdict(sup.archives) : "idle";
  const crons = [...(sup?.crons ?? [])].sort((a, b) => a.expectedMin - b.expectedMin);
  const cronIssues = crons.filter((c) => {
    const v = cronVerdict(c, now);
    return v === "warn" || v === "danger";
  }).length;

  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Santé">
      <Card>
        <CardHeader eyebrow="Services" title="État" />
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-fg-muted">Application web</dt>
            <dd>
              <Badge tone="ok">En ligne</Badge>
            </dd>
            <dt className="text-fg-muted">Base PocketBase</dt>
            <dd className="flex items-center gap-2">
              {health.ok ? (
                <Badge tone="ok">Joignable</Badge>
              ) : (
                <Badge tone="danger">Injoignable</Badge>
              )}
              <span className="text-small text-fg-muted tabular">{health.ms} ms</span>
            </dd>
            <dt className="text-fg-muted">Dernière sauvegarde</dt>
            <dd className="flex min-w-0 flex-col gap-1" data-testid="health-backup">
              {!sup ? (
                <span className="text-small text-fg-muted">
                  {supervisionEnabled()
                    ? "Supervision injoignable."
                    : "Supervision coupée (CSM_INTERNAL_SECRET absent)."}
                </span>
              ) : backup?.error ? (
                <Badge tone="danger">Lecture impossible</Badge>
              ) : backup?.last ? (
                <>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[bv]}>{since(backup.last.modified)}</Badge>
                    <span className="text-small text-fg-muted">
                      {backup.count} conservée{(backup.count ?? 0) > 1 ? "s" : ""} ·{" "}
                      {backup.s3 ? "R2" : "volume"} · {formatBytes(backup.last.size)}
                    </span>
                  </span>
                  <span className="truncate font-mono text-hint text-fg-muted">
                    {backup.last.key}
                  </span>
                </>
              ) : (
                <Badge tone="danger">Aucune sauvegarde</Badge>
              )}
            </dd>
            <dt className="text-fg-muted">E-mail (SMTP)</dt>
            <dd data-testid="health-smtp">
              {sup ? (
                sup.smtp ? (
                  <Badge tone="ok">Configuré</Badge>
                ) : (
                  <Badge tone="warn">Non configuré</Badge>
                )
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-fg-muted">Archives des bons</dt>
            <dd className="flex flex-wrap items-center gap-2" data-testid="health-archives">
              {!sup ? (
                "—"
              ) : sup.archives.error ? (
                <Badge tone="danger">Lecture impossible</Badge>
              ) : !sup.archives.r2 ? (
                <span className="text-small text-fg-muted">
                  Copie R2 coupée ({sup.archives.total ?? 0} PDF sur le volume)
                </span>
              ) : (
                <>
                  <Badge tone={TONE[av]}>{sup.archives.pending ?? 0} en attente de copie R2</Badge>
                  {sup.archives.errors ? (
                    <span className="text-small text-danger">
                      dont {sup.archives.errors} en erreur
                    </span>
                  ) : null}
                </>
              )}
            </dd>
            <dt className="text-fg-muted">Journal</dt>
            <dd className="text-small">
              {sup?.journal.months
                ? `Messages conservés ${sup.journal.months} mois (à valider DPO)`
                : "Conservation illimitée (purge coupée)"}
              {sup?.journal.oldest ? ` · plus ancien : ${since(sup.journal.oldest)}` : ""}
            </dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader eyebrow="Bascule" title="Mode maintenance" />
        <CardContent>
          <MaintenanceToggle
            on={!!maintenance?.value?.on}
            message={maintenance?.value?.message ?? ""}
          />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          eyebrow="Tâches planifiées"
          title={
            cronIssues
              ? `${cronIssues} tâche${cronIssues > 1 ? "s" : ""} à vérifier`
              : "Tâches planifiées"
          }
        />
        <CardContent>
          {crons.length === 0 ? (
            <p className="text-small text-fg-muted">
              Aucune information (supervision injoignable).
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <THead>
                    <tr>
                      <Th>Tâche</Th>
                      <Th>Fréquence</Th>
                      <Th>Dernier passage</Th>
                      <Th numeric>Durée</Th>
                      <Th>État</Th>
                    </tr>
                  </THead>
                  <tbody data-testid="health-crons">
                    {crons.map((c) => {
                      const v = cronVerdict(c, now);
                      return (
                        <tr key={c.name} className="border-b border-border">
                          <Td>
                            <span className="flex flex-col">
                              <span>{CRON_LABEL[c.name] ?? c.name}</span>
                              <span className="font-mono text-hint text-fg-muted">{c.name}</span>
                            </span>
                          </Td>
                          <Td className="text-fg-muted">{everyLabel(c.expectedMin)}</Td>
                          <Td>{since(c.lastEnd)}</Td>
                          <Td numeric>{c.runs ? `${c.durationMs} ms` : "—"}</Td>
                          <Td>
                            <span className="flex flex-col items-start gap-0.5">
                              <Badge tone={TONE[v]}>{VERDICT_LABEL[v]}</Badge>
                              {c.error ? (
                                <span
                                  className="max-w-80 truncate text-hint text-danger"
                                  title={c.error}
                                >
                                  {c.error}
                                </span>
                              ) : null}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              <ul className="flex flex-col divide-y divide-border md:hidden">
                {crons.map((c) => {
                  const v = cronVerdict(c, now);
                  return (
                    <li key={c.name} className="flex items-start justify-between gap-3 py-2">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-body">{CRON_LABEL[c.name] ?? c.name}</span>
                        <span className="text-small text-fg-muted">
                          {everyLabel(c.expectedMin)} · {since(c.lastEnd)}
                        </span>
                        {c.error ? (
                          <span className="truncate text-hint text-danger">{c.error}</span>
                        ) : null}
                      </span>
                      <Badge tone={TONE[v]}>{VERDICT_LABEL[v]}</Badge>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-hint text-fg-muted">
                « Pas encore passée » : aucun passage depuis le dernier démarrage de PocketBase
                (tâches de nuit comprises).
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Extension DICOS" title="Versions en circulation" />
        <CardContent>
          {!sup || sup.extension.length === 0 ? (
            <p className="text-small text-fg-muted">Aucun appareil connecté.</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="health-extension">
              {sup.extension.map((x) => {
                const old = !!release && !!x.version && isNewer(release.version, x.version);
                return (
                  <li key={x.version || "inconnue"} className="flex flex-wrap items-center gap-2">
                    <Badge tone={!x.version ? "neutral" : old ? "warn" : "ok"}>
                      {x.version ? `v${x.version}` : "Jamais synchronisé"}
                    </Badge>
                    <span className="text-small">
                      {x.tokens} appareil{x.tokens > 1 ? "s" : ""}
                    </span>
                    {x.last ? (
                      <span className="text-small text-fg-muted">
                        · dernière synchro {since(x.last)}
                      </span>
                    ) : null}
                    {old ? <span className="text-small text-warn">· à mettre à jour</span> : null}
                  </li>
                );
              })}
              {release ? (
                <li className="text-hint text-fg-muted">Version publiée : v{release.version}</li>
              ) : null}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader eyebrow="Activité" title="Fiches créées sur 30 jours" />
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-3">
            {volumes.map((v) => (
              <li key={v.label} className="flex flex-col rounded-control bg-surface-2 px-3 py-2">
                <span className="text-small text-fg-muted">{v.label}</span>
                <span className="figures text-h3">{v.count ?? "—"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}

const VERDICT_LABEL: Record<Verdict, string> = {
  ok: "OK",
  warn: "En retard",
  danger: "En erreur",
  idle: "Pas encore passée",
};
