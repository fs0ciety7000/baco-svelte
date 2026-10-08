import type { Metadata } from "next";

import { MaintenanceToggle } from "@/components/admin/maintenance-toggle";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { requireAdmin } from "@/server/auth";
import { getSetting, moduleVolumes } from "@/server/data/admin";
import { env } from "@/server/env";

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

export default async function Page() {
  await requireAdmin();
  const [health, volumes, maintenance] = await Promise.all([
    pbHealth(),
    moduleVolumes(),
    getSetting<{ on?: boolean; message?: string }>("maintenance"),
  ]);
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Santé">
      <Card>
        <CardHeader eyebrow="// Services" title="État" />
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
              <span className="font-mono text-small text-fg-muted">{health.ms} ms</span>
            </dd>
            <dt className="text-fg-muted">Sauvegardes</dt>
            <dd className="text-small">
              PocketBase chaque nuit à 2 h (14 conservées) + volume Coolify toutes les 2 h 30.
            </dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader eyebrow="// Bascule" title="Mode maintenance" />
        <CardContent>
          <MaintenanceToggle
            on={!!maintenance?.value?.on}
            message={maintenance?.value?.message ?? ""}
          />
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader eyebrow="// Activité" title="Fiches créées sur 30 jours" />
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-3">
            {volumes.map((v) => (
              <li
                key={v.label}
                className="flex flex-col border border-border bg-surface-2 px-3 py-2"
              >
                <span className="text-small text-fg-muted">{v.label}</span>
                <span className="font-mono text-h3 tabular">{v.count ?? "—"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
