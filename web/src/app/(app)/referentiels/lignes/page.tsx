import { MapPin, TrainFront } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { trainsHref } from "@/components/referentiels/trains";
import { Button } from "@/components/ui/button";
import { FilterForm } from "@/components/ui/filter-form";
import { FormAutoSubmit } from "@/components/ui/form-auto-submit";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import { lineLabel } from "@/lib/lines";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";
import { pl } from "@/lib/utils";
import { requireRoute } from "@/server/auth";
import { getLineDetail, listLines, type LineDetail } from "@/server/data/referentiels";
import { normLine } from "@/server/data/timetable";

export const metadata: Metadata = { title: "Lignes · CSM" };

// Ressources › Lignes (14 oct. 2026) : toutes les lignes du référentiel des trains (chemins Infrabel), gares dans l'ordre
// des points kilométriques, district majoritaire tiré de Ressources › Gares. Passages à niveau et zones SPI : référentiels
// BACO, par libellé de ligne.

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ligne?: string; district?: string; gare?: string }>;
}) {
  await requireRoute("/referentiels/lignes");
  const sp = await searchParams;
  const district = ["DSE", "DSO", "DCE", "DNO", "DNE", "aucun"].includes(sp.district ?? "")
    ? sp.district!
    : "";
  const gare = (sp.gare ?? "").trim().slice(0, 60);
  const ligne = normLine(sp.ligne);
  const [lines, detail] = await Promise.all([
    listLines(gare),
    ligne ? getLineDetail(ligne) : Promise.resolve(null),
  ]);
  const shown = lines.filter(
    (l) =>
      !district || (district === "aucun" ? !l.districts.length : l.districts.includes(district)),
  );

  return (
    <section className="flex flex-col gap-4" aria-label="Lignes">
      <FilterForm action="/referentiels/lignes" className="flex flex-wrap items-end gap-2">
        <FormAutoSubmit live />
        <label className="flex min-w-0 flex-col gap-1 md:w-48">
          <span className="text-small text-fg-muted">District</span>
          <Select name="district" defaultValue={district}>
            <option value="">Tous</option>
            <option value="DSE">DSE · Sud-Est</option>
            <option value="DSO">DSO · Sud-Ouest</option>
            <option value="DCE">DCE · Centre</option>
            <option value="DNO">DNO · Nord-Ouest</option>
            <option value="DNE">DNE · Nord-Est</option>
            <option value="aucun">Sans district</option>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-56">
          <span className="text-small text-fg-muted">Gare</span>
          <Input
            name="gare"
            defaultValue={gare}
            placeholder="Nom FR / NL ou abréviation (FMS)…"
            maxLength={60}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-72">
          <span className="text-small text-fg-muted">Ligne</span>
          <Select name="ligne" defaultValue={detail ? detail.line : ""}>
            <option value="">—</option>
            {shown.map((l) => (
              <option key={l.line} value={l.line}>
                {lineLabel(l.line)} · {l.name}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </FilterForm>

      {!detail ? (
        <>
          <p className="text-small text-fg-muted">
            <span className="font-mono text-fg tabular">{shown.length}</span>{" "}
            {pl(shown.length, "ligne")}
            {gare ? ` desservant « ${gare} »` : ""} · gares dans l&apos;ordre d&apos;après les
            trajets Infrabel, mises à jour chaque matin avec le référentiel des trains.
          </p>
          {ligne ? (
            <p className="text-small text-warn" role="status">
              Ligne {lineLabel(ligne)} inconnue du référentiel.
            </p>
          ) : null}
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="lines-grid">
            {shown.map((l) => (
              <li key={l.line} className="min-w-0">
                <Link
                  href={`/referentiels/lignes?ligne=${encodeURIComponent(l.line)}`}
                  className="block"
                >
                  <ListCard
                    title={
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="font-mono">{lineLabel(l.line)}</span>
                        <span className="truncate text-small font-normal text-fg-muted">
                          {l.name}
                        </span>
                      </span>
                    }
                    meta={[
                      `${l.stations} ${pl(l.stations, "gare")}`,
                      l.branches ? `${l.branches} ${pl(l.branches, "embranchement")}` : "",
                      l.matches.length ? l.matches.join(", ") : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    aside={
                      l.districts.length ? (
                        <span className="flex gap-1">
                          {l.districts.map((d) => (
                            <Badge key={d} tone="info">
                              {d}
                            </Badge>
                          ))}
                        </span>
                      ) : undefined
                    }
                  />
                </Link>
              </li>
            ))}
          </ul>
          {shown.length === 0 ? (
            <EmptyState
              title="Aucune ligne"
              description={
                gare
                  ? "Aucune ligne ne dessert cette gare."
                  : lines.length
                    ? "Aucune ligne pour ce district."
                    : "Le référentiel des lignes est construit chaque matin avec celui des trains."
              }
            />
          ) : null}
        </>
      ) : (
        <LineView detail={detail} />
      )}
    </section>
  );
}

function LineView({ detail }: { detail: LineDetail }) {
  const trunk = detail.stations.filter((s) => !s.branch);
  const label = lineLabel(detail.line);
  return (
    <div className="flex flex-col gap-5" data-testid="line-detail">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h3 font-mono">{label}</h2>
        {detail.name ? <span className="min-w-0 text-fg-muted">{detail.name}</span> : null}
        {detail.district ? (
          <Badge tone="info">
            {detail.district} · {DISTRICT_LABEL[detail.district] ?? ""}
          </Badge>
        ) : null}
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <Button asChild variant="ghost" size="sm" className="border border-border">
            <Link href={trainsHref({ vue: "ligne", ligne: detail.line })}>
              <TrainFront aria-hidden className="size-4" /> Relations sur la ligne
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="border border-border">
            <Link href="/referentiels/lignes">Changer de ligne</Link>
          </Button>
        </div>
      </div>

      <details open className="flex flex-col gap-2">
        <summary className="label-mono cursor-pointer text-fg-muted">
          Gares · {detail.stations.length}
        </summary>
        {detail.stations.length === 0 ? (
          <p className="mt-2 text-small text-fg-muted">
            Ligne absente du référentiel des trains (aucun train voyageurs observé).
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            <p className="text-small text-fg-muted">
              {detail.oriented
                ? "Dans le sens des points kilométriques Infrabel (km aux gares de début ou de fin de section)."
                : "Ordre des trajets Infrabel (sens kilométrique non publié pour cette ligne)."}{" "}
              District : Ressources › Gares.
            </p>
            <StationList stations={trunk} testId="line-stations" />
            {detail.branches.map((b) => {
              const list = detail.stations.filter((s) => s.branch === b.b);
              if (!list.length) return null;
              return (
                <section
                  key={b.b}
                  className="flex flex-col gap-1"
                  aria-label={`Embranchement ${b.b}`}
                >
                  <h3 className="text-small font-medium">
                    {b.from ? `Embranchement depuis ${b.from}` : "Tronçon séparé"}
                    <span className="font-normal text-fg-muted"> · vers {b.to}</span>
                  </h3>
                  <StationList stations={list} testId={`line-branch-${b.b}`} />
                </section>
              );
            })}
          </div>
        )}
      </details>

      <details className="flex flex-col gap-2">
        <summary className="label-mono cursor-pointer text-fg-muted">
          Passages à niveau · {detail.crossings.length}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {detail.crossings.length === 0 ? (
            <p className="text-small text-fg-muted">Aucun PN au référentiel pour cette ligne.</p>
          ) : null}
          {detail.crossings.map((c) => (
            <div key={c.id} className="flex items-start gap-2 border border-border px-2 py-1.5">
              <span className="font-mono text-small tabular">PN {c.number}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate">{c.address || "—"}</p>
                <p className="text-small text-fg-muted">
                  {c.bk ? `BK ${c.bk}` : ""} {c.zone ? `· ${c.zone}` : ""}
                </p>
              </div>
            </div>
          ))}
          {detail.crossings.length ? (
            <Button asChild variant="ghost" size="sm" className="self-start border border-border">
              <Link href={`/operations/carte-pn?q=${encodeURIComponent(label)}`}>
                <MapPin aria-hidden className="size-4" /> Ouvrir dans la Carte PN
              </Link>
            </Button>
          ) : null}
        </div>
      </details>

      <details className="flex flex-col gap-2">
        <summary className="label-mono cursor-pointer text-fg-muted">
          Zones SPI · {detail.spi.length}
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {detail.spi.length === 0 ? (
            <p className="text-small text-fg-muted">Aucune zone SPI pour cette ligne.</p>
          ) : null}
          {detail.spi.map((s) => (
            <div key={s.id} className="flex items-start gap-2 border border-border px-2 py-1.5">
              {s.zone ? <Badge tone="info">{s.zone}</Badge> : null}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{s.place || "—"}</p>
                {s.address ? <p className="text-small text-fg-muted">{s.address}</p> : null}
                {s.notes ? <p className="text-small">{s.notes}</p> : null}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function StationList({ stations, testId }: { stations: LineDetail["stations"]; testId: string }) {
  return (
    <ol
      className="flex flex-col divide-y divide-border rounded-box border border-border bg-surface"
      data-testid={testId}
    >
      {stations.map((s, i) => (
        <li key={`${s.name}-${i}`} className="flex flex-col">
          {s.gap ? (
            <p className="bg-surface-2 px-3 py-1 text-small text-fg-muted">
              Section parcourue sous un autre n° de ligne
            </p>
          ) : null}
          <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
            <span className="w-6 shrink-0 font-mono text-small text-fg-muted tabular">{i + 1}</span>
            <Link
              href={trainsHref({ vue: "gare", gare: s.name })}
              className="link min-w-0 flex-1 font-medium break-words md:truncate"
            >
              {s.name}
            </Link>
            {s.abbr ? (
              <Link
                href={`/referentiels/ptcar?q=${encodeURIComponent(s.abbr)}`}
                className="link font-mono text-small"
                title="Abréviation PtCar"
              >
                {s.abbr}
              </Link>
            ) : null}
            {/* km : colonne alignée en desktop, rien en mobile quand il n'y en a pas. */}
            <span className="font-mono text-small text-fg-muted tabular empty:hidden md:inline-block md:w-16 md:text-right md:empty:inline-block">
              {s.km !== null ? `km ${s.km.toLocaleString("fr-BE")}` : ""}
            </span>
            {s.district ? (
              <Badge tone="info">{s.district}</Badge>
            ) : (
              <span className="w-10 text-center text-small text-fg-subtle">—</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
