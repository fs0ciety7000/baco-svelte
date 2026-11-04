import { Download, FileSpreadsheet, FileText } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CardDisclosure } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { frDay } from "@/lib/orders/billing";
import { recapKind, recapRef, type RecapCounts, type RecapWeek } from "@/lib/orders/recap";
import { isStatus } from "@/lib/orders/status";
import { pl } from "@/lib/utils";

// Récapitulatif des bons par semaine (Commandes › Archives, 4 nov. 2026) : une carte repliable par semaine ISO (la plus
// récente d'abord, la semaine en cours ou la plus récente ouverte), compteurs, liste des bons (tableau en desktop,
// cartes en mobile), zip de la semaine et fichier de facturation de la semaine.

export function countsText(c: RecapCounts): string {
  return [
    `${c.bus} ${pl(c.bus, "bon bus", "bons bus")}`,
    `${c.taxi} ${pl(c.taxi, "taxi")}`,
    c.cancelled ? `${c.cancelled} ${pl(c.cancelled, "annulé")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Liens « Fichier facturation » : un district choisi, sinon un par district. */
export function BillingLinks({
  period,
  district,
  label,
}: {
  period: string;
  district: string;
  label: string;
}) {
  const list = district ? [district] : ["DSO", "DSE", "DCE"];
  return (
    <>
      {list.map((d) => (
        <Button key={d} asChild size="sm" variant="secondary">
          <a
            href={`/api/commandes/archives/facturation/${period}.xlsx?district=${d}`}
            download
            data-testid={`billing-${period}-${d}`}
          >
            <FileSpreadsheet aria-hidden className="size-4" />
            {list.length > 1 ? `${label} ${d}` : label}
          </a>
        </Button>
      ))}
    </>
  );
}

export function ArchiveWeeks({
  weeks,
  openKey,
  pdfFor,
  district,
}: {
  weeks: RecapWeek[];
  /** Semaine ouverte d'office (en cours, sinon la plus récente). */
  openKey: string;
  /** PDF archivé de chaque bon (`kind-id` → id de l'archive). */
  pdfFor: Record<string, string>;
  district: string;
}) {
  if (!weeks.length)
    return (
      <EmptyState
        framed
        title="Aucun bon sur cette période"
        description="Les bons terminés, envoyés ou annulés apparaissent ici, semaine par semaine (date de service)."
      />
    );
  return (
    <div className="flex flex-col gap-3" data-testid="archive-weeks">
      {weeks.map((w) => (
        <CardDisclosure
          key={w.key}
          title={w.label}
          count={w.items.length}
          defaultOpen={w.key === openKey}
          data-testid={`week-${w.key}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-small text-fg-muted" data-testid={`week-counts-${w.key}`}>
              {countsText(w.counts)}
            </p>
            <Button asChild size="sm" variant="secondary">
              <a
                href={`/api/commandes/archives/semaine/${w.key}`}
                download
                data-testid={`week-zip-${w.key}`}
              >
                <Download aria-hidden className="size-4" /> Télécharger la semaine
              </a>
            </Button>
            <BillingLinks period={w.key} district={district} label="Facturation" />
          </div>
          <div className="relative hidden overflow-x-auto md:block">
            <Table>
              <THead>
                <tr>
                  <Th>N° de commande</Th>
                  <Th>N° TC / réf.</Th>
                  <Th>Date</Th>
                  <Th>Trajet</Th>
                  <Th>Statut</Th>
                  <Th>PDF</Th>
                </tr>
              </THead>
              <tbody>
                {w.items.map((i) => {
                  const arch = pdfFor[`${i.kind}-${i.id}`];
                  return (
                    <Tr key={`${i.kind}-${i.id}`}>
                      <Td className="whitespace-nowrap font-medium tabular">
                        <span className="flex items-center gap-2">
                          <Badge tone={i.kind === "bus" ? "info" : "neutral"}>{recapKind(i)}</Badge>
                          <Link href={`/commandes/${i.kind}/${i.id}`} className="link">
                            {recapRef(i)}
                          </Link>
                        </span>
                      </Td>
                      <Td className="max-w-40 truncate text-fg-muted">{i.relation || "—"}</Td>
                      <Td className="whitespace-nowrap font-mono text-small tabular">
                        {frDay(i.day)}
                        {i.time ? ` ${i.time}` : ""}
                      </Td>
                      <Td
                        className={`max-w-80 break-words ${i.status === "annule" ? "line-through" : ""}`}
                      >
                        {i.route}
                        {i.company ? <span className="text-fg-muted"> · {i.company}</span> : null}
                      </Td>
                      <Td>{isStatus(i.status) ? <StatusBadge status={i.status} /> : i.status}</Td>
                      <Td>
                        <a
                          href={
                            arch
                              ? `/api/commandes/archives/${arch}`
                              : `/api/commandes/${i.kind}/${i.id}/pdf`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-11 items-center gap-1 link"
                          aria-label={`PDF du bon ${recapRef(i)}${arch ? " (archivé)" : ""}`}
                        >
                          <FileText aria-hidden className="size-4" /> PDF
                        </a>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid={`week-cards-${w.key}`}>
            {w.items.map((i) => (
              <li key={`${i.kind}-${i.id}`}>
                <Link href={`/commandes/${i.kind}/${i.id}`} className="block">
                  <ListCard
                    title={
                      <span className={i.status === "annule" ? "line-through" : ""}>{i.route}</span>
                    }
                    meta={[
                      `${recapKind(i)} ${recapRef(i)}`,
                      i.relation,
                      `${frDay(i.day)}${i.time ? ` ${i.time}` : ""}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    aside={isStatus(i.status) ? <StatusBadge status={i.status} /> : null}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </CardDisclosure>
      ))}
    </div>
  );
}
