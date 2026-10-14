import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn, pl } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { referentialQuality } from "@/server/data/admin-referentiels";

export const metadata: Metadata = { title: "Référentiels · Administration · CSM" };

const when = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Brussels",
});

function at(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : when.format(d);
}

/**
 * Administration › Référentiels (navigation v3, 14 oct. 2026) : tableau de bord qualité. Une carte par référentiel :
 * nombre de fiches, anomalies (chacune mène à la liste filtrée), dernière modification, dernier import.
 */
export default async function Page() {
  await requirePermission("referentiels:manage");
  const cards = await referentialQuality();
  const anomalies = cards.reduce(
    (n, c) =>
      n +
      c.issues.reduce(
        (m, i) => m + (c.id === "pn" && /Désactivés/.test(i.label) ? 0 : (i.count ?? 0)),
        0,
      ),
    0,
  );
  return (
    <section className="flex flex-col gap-4" aria-label="Qualité des référentiels">
      <p className="text-small text-fg-muted" data-testid="ref-quality-total">
        <span className="font-mono text-fg tabular">{anomalies}</span> {pl(anomalies, "point")} à
        vérifier. Les écrans de Réseau restent en consultation pour tous ; les modifications se font
        ici (ou par « Modifier » sur une fiche de Réseau).
      </p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="ref-quality">
        {cards.map((c) => (
          <li key={c.id} className="min-w-0">
            <Card className="h-full" data-testid={`ref-card-${c.id}`}>
              <CardHeader
                eyebrow={c.total === null ? undefined : `${c.total} ${pl(c.total, c.noun)}`}
                title={c.title}
                actions={
                  <Link href={c.href} className="link text-small">
                    Ouvrir
                  </Link>
                }
              />
              <CardContent className="flex flex-col gap-2">
                <ul className="flex flex-col">
                  {c.issues.map((i) => {
                    const n = i.count ?? 0;
                    const warn = n > 0 && !/Désactivés/.test(i.label);
                    return (
                      <li key={i.label}>
                        <Link
                          href={i.href}
                          className="flex min-h-11 items-center gap-2 border-b border-border py-1 text-body last:border-b-0 hover:text-fg"
                        >
                          {warn ? (
                            <AlertTriangle aria-hidden className="size-4 shrink-0 text-warn" />
                          ) : (
                            <CheckCircle2 aria-hidden className="size-4 shrink-0 text-ok" />
                          )}
                          <span className="min-w-0 flex-1 text-fg-muted">{i.label}</span>
                          <span
                            className={cn(
                              "font-mono tabular",
                              warn ? "font-semibold text-fg" : "text-fg-subtle",
                            )}
                          >
                            {i.count === null ? "?" : n}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {c.last?.at ? (
                  <p className="text-small text-fg-subtle">
                    {c.id === "imports" ? "Dernier import réussi" : "Dernière modification"} :{" "}
                    {at(c.last.at)}
                    {c.last.by && c.id !== "imports" ? ` · ${c.last.by}` : ""}
                  </p>
                ) : null}
                {c.note ? <p className="text-small text-fg-subtle">{c.note}</p> : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
