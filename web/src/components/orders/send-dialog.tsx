"use client";

import { Download, FileText, Mail, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { transitionOrder } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { Missing } from "@/lib/orders/schemas";
import type { OrderKind } from "@/lib/orders/status";

/**
 * Feuille d'envoi (audit UX §3.3) : contrôles, destinataires, brouillon Outlook (.eml avec le PDF joint),
 * puis confirmation explicite « Oui, marquer envoyé ». Le statut ne change jamais seul.
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
  const [downloaded, setDownloaded] = useState(false);
  const [pending, start] = useTransition();
  const ready = !!id && missing.length === 0;
  const base = id ? `/api/commandes/${kind}/${id}` : "";

  useEffect(() => {
    if (!open) setDownloaded(false);
  }, [open]);

  const download = async (what: "eml" | "pdf") => {
    if (!(await flush())) {
      toast.error("Enregistrement impossible : corrigez la saisie avant l'envoi.");
      return;
    }
    if (what === "eml") {
      // Téléchargement par lien : le fichier part avec le cookie de session (même domaine).
      const a = document.createElement("a");
      a.href = `${base}/eml`;
      a.rel = "noopener";
      document.body.append(a);
      a.click();
      a.remove();
      setDownloaded(true);
    } else {
      window.open(`${base}/pdf`, "_blank", "noopener");
    }
  };

  const markSent = () =>
    start(async () => {
      let res: Awaited<ReturnType<typeof transitionOrder>>;
      try {
        res = await transitionOrder({ kind, id: id ?? "", to: "envoye" });
      } catch {
        toast.error("Serveur injoignable : réessayez dans un instant.");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Commande marquée envoyée.");
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        eyebrow="// Envoi au fournisseur"
        title="Préparer l'envoi"
        description="Le brouillon s'ouvre dans Outlook avec le bon en PDF. Vérifiez l'expéditeur (boîte fonctionnelle), puis envoyez."
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
              {to || "—"}
            </dd>
            <dt className="label-mono pt-0.5 text-fg-muted">Copie</dt>
            <dd className="break-all text-fg">{cc || "—"}</dd>
            <dt className="label-mono pt-0.5 text-fg-muted">Pièce</dt>
            <dd className="flex items-center gap-1.5 text-fg">
              <FileText aria-hidden className="size-4 text-fg-muted" /> Bon de commande (PDF)
            </dd>
          </dl>
        )}

        {downloaded ? (
          <div
            className="mt-4 flex flex-col gap-2 border border-info/60 bg-[color-mix(in_oklab,var(--info)_8%,var(--surface))] p-3"
            data-testid="confirm-banner"
          >
            <p className="text-body font-medium text-fg">Avez-vous envoyé l&apos;e-mail ?</p>
            <p className="text-small text-fg-muted">
              La commande passe à « Envoyé » seulement si vous le confirmez.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => download("pdf")} disabled={!id}>
            <FileText aria-hidden /> Aperçu PDF
          </Button>
          {downloaded ? (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Pas encore
              </Button>
              <Button
                variant="primary"
                onClick={markSent}
                loading={pending}
                data-testid="mark-sent"
              >
                <Mail aria-hidden /> Oui, marquer envoyé
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              onClick={() => download("eml")}
              disabled={!ready}
              data-testid="download-eml"
            >
              <Download aria-hidden /> Brouillon Outlook (.eml)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
