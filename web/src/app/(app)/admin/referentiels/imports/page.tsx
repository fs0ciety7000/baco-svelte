import type { Metadata } from "next";
import Link from "next/link";

import { TimetableRefresh } from "@/components/referentiels/timetable-refresh";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/status-badge";
import { requirePermission } from "@/server/auth";
import { timetableState } from "@/server/data/timetable";
import { STALE_RUN_MS } from "@/server/timetable/import";

export const metadata: Metadata = { title: "Imports · Référentiels · CSM" };

const when = new Intl.DateTimeFormat("fr-BE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Brussels",
});
const at = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? when.format(d) : "—";
};

/**
 * Administration › Référentiels › Imports : état de l'import quotidien (horaire SNCB GTFS, Infrabel : ponctualité,
 * points opérationnels, sections de lignes) et « Mettre à jour » (bouton aussi présent dans Réseau › Horaires pour qui
 * gère les référentiels). L'import construit trains, relations, gares et lignes.
 */
export default async function Page() {
  await requirePermission("referentiels:manage");
  const s = await timetableState();
  const running =
    s?.state === "running" && Date.now() - Date.parse(s.startedAt ?? "") < STALE_RUN_MS;
  const stale = !!s?.lastOkAt && Date.now() - Date.parse(s.lastOkAt) > 26 * 3600_000;
  const rows: [string, string][] = s
    ? [
        ["Dernier import réussi", at(s.lastOkAt)],
        ["Dernier lancement", `${at(s.startedAt)}${s.trigger ? ` (${s.trigger})` : ""}`],
        ["Durée", s.durationMs ? `${Math.round(s.durationMs / 1000)} s` : "—"],
        ["Horaire SNCB (GTFS)", s.feedVersion ?? "—"],
        ["Semaine de référence", s.window ? `${s.window[0]} → ${s.window[1]}` : "—"],
        ["Infrabel (veille)", s.d1Day ?? "—"],
        ["Trains", String(s.services ?? "—")],
        ["Relations", String(s.relations ?? "—")],
        ["Chemins Infrabel", String(s.paths ?? "—")],
        ["Gares", String(s.stations ?? "—")],
        ["Lignes", String(s.lines ?? "—")],
        [
          "PN Infrabel (données ouvertes)",
          s.network?.crossings
            ? `${s.network.crossings.infrabel} lus · ${s.network.crossings.matched} rapprochés · ${s.network.crossings.created} nouveaux · ${s.network.crossings.deactivated} désactivés`
            : "—",
        ],
        [
          "Zones SPI des gares",
          s.network?.stations
            ? Object.entries(s.network.stations)
                .map(([k, v]) => `${k} ${v}`)
                .join(" · ")
            : "—",
        ],
      ]
    : [];
  return (
    <section className="flex flex-col gap-4" aria-label="Imports">
      <Card>
        <CardHeader
          eyebrow="Référentiel des trains, gares et lignes"
          title="Import quotidien"
          actions={<TimetableRefresh running={running} />}
        />
        <CardContent className="flex flex-col gap-3">
          <p className="flex flex-wrap gap-2" data-testid="imports-state">
            {!s ? <Badge tone="warn">Jamais importé</Badge> : null}
            {s?.state === "ok" && !stale ? <Badge tone="ok">À jour</Badge> : null}
            {stale ? <Badge tone="warn">Plus de 26 h</Badge> : null}
            {s?.state === "error" ? (
              <Badge tone="danger" title={s.error}>
                En échec : {s.error}
              </Badge>
            ) : null}
            {running ? (
              <Badge tone="info">Mise à jour en cours{s?.step ? ` : ${s.step}` : ""}</Badge>
            ) : null}
            {s?.warning ? <Badge tone="warn">{s.warning}</Badge> : null}
            {s?.network?.error ? (
              <Badge tone="warn">Réseau (PN, zones SPI) : {s.network.error}</Badge>
            ) : null}
          </p>
          {rows.length ? (
            <dl className="grid gap-x-6 gap-y-1 text-body sm:grid-cols-[max-content_1fr]">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="font-mono tabular">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="text-small text-fg-subtle">
            L&apos;import tourne chaque matin (à partir de 5 h) et dès qu&apos;un nouvel horaire
            SNCB est publié (vérification toutes les 3 h). Consultation :{" "}
            <Link href="/reseau/horaires" className="link">
              Réseau › Horaires
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
