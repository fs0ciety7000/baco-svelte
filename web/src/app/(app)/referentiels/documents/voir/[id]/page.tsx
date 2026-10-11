import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { dayOf, formatShortDay } from "@/lib/orders/time";
import { previewKind } from "@/lib/referentiels/detect";
import { requirePermission } from "@/server/auth";
import { getDocument } from "@/server/data/referentiels";

export const metadata: Metadata = { title: "Document · CSM" };

// Visionneuse d'un document de la bibliothèque (demande du 11 oct. 2026) : PDF dans un cadre, image affichée, autres
// formats en téléchargement. Le fichier reste servi par la route protégée (jeton de l'agent, fichier protégé).

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retour?: string }>;
}) {
  await requirePermission("documents:read");
  const { id } = await params;
  const { retour } = await searchParams;
  const doc = await getDocument(id);
  if (!doc) notFound();
  const kind = previewKind(doc.fileName);
  const src = `/api/referentiels/documents/${doc.id}`;
  const ext = (doc.fileName.split(".").pop() ?? "").toUpperCase();
  // Retour vers la liste d'où l'on vient (procédures par défaut), jamais vers une autre origine.
  const back =
    retour === "documents" ? "/referentiels/documents?vue=documents" : "/referentiels/documents";

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-label="Visionneuse">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="border border-border">
          <Link href={back}>
            <ArrowLeft aria-hidden /> Retour
          </Link>
        </Button>
        <h2 className="min-w-0 flex-1 truncate text-h3 font-semibold" title={doc.name}>
          {doc.name}
        </h2>
        <div className="flex flex-wrap gap-2">
          {kind ? (
            <Button asChild variant="ghost" size="sm" className="border border-border">
              <a href={`${src}?vue=1`} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> Nouvel onglet
              </a>
            </Button>
          ) : null}
          <Button asChild variant="primary" size="sm" data-testid="document-download">
            <a href={`${src}?dl=1`} download>
              <Download aria-hidden /> Télécharger
            </a>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-small text-fg-muted">
        {ext ? <Badge tone="neutral">{ext}</Badge> : null}
        {doc.category ? <Badge tone="info">{doc.category}</Badge> : null}
        <span>
          Déposé le {formatShortDay(dayOf(doc.created))}
          {doc.author ? ` par ${doc.author}` : ""}
        </span>
      </div>

      {kind === "pdf" ? (
        <div className="flex flex-col gap-2">
          <iframe
            src={`${src}?vue=1`}
            title={`Aperçu : ${doc.name}`}
            className="h-[min(80vh,64rem)] w-full border border-border-strong bg-surface-2"
            data-testid="document-viewer"
          />
          <p className="text-hint text-fg-muted">
            L&apos;aperçu ne s&apos;affiche pas (téléphone) ? Ouvre le document dans un nouvel
            onglet ou télécharge-le.
          </p>
        </div>
      ) : kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={doc.name}
          className="max-h-[80vh] max-w-full self-start border border-border-strong object-contain"
          data-testid="document-viewer"
        />
      ) : (
        <EmptyState
          title="Aperçu indisponible pour ce format"
          description={`Les fichiers ${ext || "de ce type"} s'ouvrent après téléchargement (Word, Excel, PowerPoint…).`}
        />
      )}
    </section>
  );
}
