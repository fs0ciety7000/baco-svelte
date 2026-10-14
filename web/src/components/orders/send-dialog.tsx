"use client";

import { Download, FileText, Mail, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { transitionOrder } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { Missing } from "@/lib/orders/schemas";
import type { OrderKind } from "@/lib/orders/status";

/**
 * Feuille d'envoi (audit UX §3.3) : contrôles, destinataires, puis « Valider l'envoi » = brouillon Outlook (.eml avec le
 * PDF joint) et passage en « Envoyé » (14 oct. 2026).
 */
export function SendDialog({
  kind,
  id,
  open,
  onOpenChange,
  missing,
  to,
  cc,
  flush,
}: {
  kind: OrderKind;
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: Missing[];
  to: string;
  cc: string;
  /** Enregistre la saisie avant de générer le PDF. */
  flush: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const ready = !!id && missing.length === 0;
  // Sans adresse e-mail (société sans adresse, rien saisi) : PDF seul, transmis autrement ; pas de brouillon .eml.
  const noMail = !to.trim();
  const base = id ? `/api/commandes/${kind}/${id}` : "";

  const fetchFile = (href: string) => {
    // Téléchargement par lien : le fichier part avec le cookie de session (même domaine).
    const a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    document.body.append(a);
    a.click();
    a.remove();
  };

  /**
   * « Valider l'envoi » (14 oct. 2026) : ouvre le brouillon Outlook (.eml : adresse du fournisseur, PDF joint, message
   * généré) — ou le PDF seul sans adresse — puis passe le bon en « Envoyé / finalisé » (clôture, PDF archivé).
   */
  const validate = () =>
    start(async () => {
      if (!(await flush())) {
        toast.error("Enregistrement impossible : corrige la saisie avant l'envoi.");
        return;
      }
      fetchFile(noMail ? `${base}/pdf?download=1` : `${base}/eml`);
      let res: Awaited<ReturnType<typeof transitionOrder>>;
      try {
        res = await transitionOrder({ kind, id: id ?? "", to: "envoye" });
      } catch {
        toast.error("Serveur injoignable : le bon n'est pas passé en « Envoyé ». Réessaie.");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        noMail
          ? "PDF téléchargé : commande « Envoyée »."
          : "Brouillon ouvert dans Outlook : commande « Envoyée ».",
      );
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        eyebrow="Envoi au fournisseur"
        title="Valider l'envoi"
        description={
          noMail
            ? "Aucune adresse e-mail pour ce fournisseur : le bon est téléchargé en PDF, à transmettre (téléphone, autre canal)."
            : "Le brouillon s'ouvre dans Outlook avec l'adresse du fournisseur, le message et le bon en PDF. Vérifie l'expéditeur (boîte fonctionnelle), puis envoie."
        }
      >
        {missing.length ? (
          <div role="alert" className="flex flex-col gap-2 border border-danger/60 p-3">
            <p className="flex items-center gap-2 text-body font-medium text-danger">
              <TriangleAlert aria-hidden className="size-4" /> À compléter avant l&apos;envoi
            </p>
            <ul className="list-inside list-disc text-body text-fg">
              {missing.map((m) => (
                <li key={m.field + m.message}>{m.message}</li>
              ))}
            </ul>
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="label-mono pt-0.5 text-fg-muted">À</dt>
            <dd className="break-all text-fg" data-testid="send-to">
              {to || "Aucune adresse (PDF seul)"}
            </dd>
            <dt className="label-mono pt-0.5 text-fg-muted">Copie</dt>
            <dd className="break-all text-fg">{cc || "—"}</dd>
            <dt className="label-mono pt-0.5 text-fg-muted">Pièce</dt>
            <dd className="flex items-center gap-1.5 text-fg">
              <FileText aria-hidden className="size-4 text-fg-muted" /> Bon de commande (PDF)
            </dd>
            <dt className="label-mono pt-0.5 text-fg-muted">Statut</dt>
            <dd className="text-fg">Passe en « Envoyé » à la validation</dd>
          </dl>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => window.open(`${base}/pdf`, "_blank", "noopener")}
            disabled={!id}
          >
            <FileText aria-hidden /> Aperçu PDF
          </Button>
          <Button
            variant="primary"
            onClick={validate}
            disabled={!ready}
            loading={pending}
            data-testid="validate-send"
          >
            {noMail ? <Download aria-hidden /> : <Mail aria-hidden />} Valider l&apos;envoi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lien vers le PDF du bon dans l'encadré « Aperçu du bon » (disponible dès le premier enregistrement). */
export function PdfLink({ href }: { href: string }) {
  return href ? (
    <a
      className="inline-flex min-h-11 items-center gap-2 text-body link"
      href={href}
      target="_blank"
      rel="noopener"
    >
      <FileText aria-hidden className="size-4" /> Ouvrir le PDF du bon
    </a>
  ) : (
    <p className="text-hint text-fg-muted">
      Le PDF sera disponible après le premier enregistrement.
    </p>
  );
}
