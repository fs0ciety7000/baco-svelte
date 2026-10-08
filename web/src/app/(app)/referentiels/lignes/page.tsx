import { MapPin, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { ListCard } from "@/components/ui/table";
import { DISTRICT_LABEL } from "@/lib/pmr/districts";
import { requireRoute } from "@/server/auth";
import { getLineDetail, listLines } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "Lignes · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ligne?: string; district?: string }>;
}) {
  await requireRoute("/referentiels/lignes");
  const sp = await searchParams;
  const district = ["DSE", "DSO", "DCE"].includes(sp.district ?? "") ? sp.district! : "";
  const lines = await listLines();
  const shown = district ? lines.filter((l) => l.district === district) : lines;
  const detail = sp.ligne ? await getLineDetail(sp.ligne) : null;

  return (
    <section className="flex flex-col gap-4" aria-label="Lignes">
      <form action="/referentiels/lignes" method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-col gap-1 md:w-48">
          <span className="text-small text-fg-muted">District</span>
          <Select name="district" defaultValue={district}>
            <option value="">Tous</option>
            <option value="DSE">DSE · Sud-Est</option>
            <option value="DSO">DSO · Sud-Ouest</option>
            <option value="DCE">DCE · Centre</option>
          </Select>
        </label>
        <label className="flex min-w-0 flex-col gap-1 md:w-56">
          <span className="text-small text-fg-muted">Ligne</span>
          <Select name="ligne" defaultValue={sp.ligne ?? ""}>
            <option value="">—</option>
            {shown.map((l) => (
              <option key={l.line} value={l.line}>
                {l.line} ({l.stations} gares)
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Afficher
        </Button>
      </form>

      {!detail ? (
        <>
          <p className="text-small text-fg-muted">
            <span className="font-mono text-fg tabular">{shown.length}</span> ligne(s) · choisissez-en une.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="lines-grid">
            {shown.map((l) => (
              <li key={l.line} className="min-w-0">
                <Link href={`/referentiels/lignes?ligne=${encodeURIComponent(l.line)}`} className="block">
                  <ListCard
                    title={<span className="font-mono">{l.line}</span>}
                    meta={`${l.stations} gares${l.district ? ` · ${l.district}` : ""}`}
                  />
                </Link>
              </li>
            ))}
          </ul>
          {shown.length === 0 ? (
            <EmptyState title="Aucune ligne" description="Aucune ligne pour ce district." />
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-h3 font-mono">{detail.line}</h2>
            {detail.district ? (
              <Badge tone="info">
                {detail.district} · {DISTRICT_LABEL[detail.district] ?? ""}
              </Badge>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="ml-auto border border-border">
              <Link href="/referentiels/lignes">Changer de ligne</Link>
            </Button>
          </div>

          <details open className="flex flex-col gap-2">
            <summary className="label-mono cursor-pointer text-fg-muted">
              Gares · {detail.stations.length}
            </summary>
            <ol className="mt-2 flex flex-col gap-1" data-testid="line-stations">
              {detail.stations.map((s) => (
                <li
                  key={s.id}
                  className="flex min-h-11 items-center gap-2 border border-border px-2 py-1 md:min-h-0"
                >
                  <span className="w-6 font-mono text-small text-fg-muted tabular">
                    {s.hasOrder ? s.position : "·"}
                  </span>
                  <Link
                    href={`/referentiels/ptcar?q=${encodeURIComponent(s.station)}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {s.station}
                  </Link>
                  {!s.hasOrder ? (
                    <span title="Position inconnue (ordre incomplet dans BACO)">
                      <TriangleAlert aria-hidden className="size-4 text-warn" />
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
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
                  <Link href={`/operations/carte-pn?q=${encodeURIComponent(detail.line)}`}>
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
      )}
    </section>
  );
}
