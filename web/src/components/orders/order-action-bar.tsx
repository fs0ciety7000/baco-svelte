"use client";

import { ArrowLeft, Copy, FileText, MoreHorizontal, Save, Send, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { ActionBar } from "@/components/ui/form-kit";
import { Sheet } from "@/components/ui/sheet";
import type { BusLine } from "@/lib/orders/schemas";
import { mainActionOf, type OrderKind, type Status } from "@/lib/orders/status";
import { cn } from "@/lib/utils";

import { useDeleteOrder, useRemaining } from "./delete-order";
import { TransitionButton, useOrderTransitions } from "./transitions";

const itemClass =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-control px-3 text-left text-body text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Barre d'actions des bons bus et taxi (refonte R6). Desktop : inchangée (actions à la suite + menu « ⋯ »). Mobile
 * (< 768 px) : une seule action principale pleine largeur + « ⋯ » qui ouvre une feuille du bas avec les actions
 * secondaires, et l'annulation séparée en bas, en rouge, qui ouvre le dialogue de motif. Le dialogue de transition est
 * rendu ici, hors de la feuille : la fermer ne le démonte pas.
 */
export function OrderActionBar({
  kind,
  orderId,
  status,
  statusBeforeCancel,
  coordinator,
  buses,
  editable,
  canWrite,
  busy,
  flush,
  onSend,
  onCreate,
  onDuplicate,
  onTemplate,
  listHref,
  deletion,
  deleteLabel,
}: {
  kind: OrderKind;
  orderId?: string;
  status: Status;
  statusBeforeCancel?: string;
  coordinator: boolean;
  buses?: BusLine[];
  editable: boolean;
  canWrite: boolean;
  busy: boolean;
  flush: () => Promise<boolean>;
  onSend: () => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onTemplate: () => void;
  listHref: string;
  /** Suppression permise (`orderDeletion`) : `until` = fin de la fenêtre de 8 h du créateur, `null` = sans limite. */
  deletion?: { until: string | null } | null;
  /** Désignation du bon dans la confirmation (« TC_1234 », « taxi n° 12 »). */
  deleteLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const del = useDeleteOrder({ kind, id: orderId ?? "", label: deleteLabel ?? "" });
  const remaining = useRemaining(deletion?.until);
  const canDelete = !!orderId && !!deletion;
  const deleteHint = remaining ? `Supprimable encore ${remaining}` : "";
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const tr = useOrderTransitions({
    kind,
    id: orderId ?? "",
    status,
    statusBeforeCancel,
    coordinator,
    buses,
    before: flush,
    hideSend: true,
  });
  const transitions = orderId ? tr.list : [];
  const main = mainActionOf({
    canSend: editable && status === "termine",
    canCreate: editable && !orderId,
    transitions,
  });
  const mainTo = main?.type === "transition" ? main.t.to : null;
  // Mobile : la feuille ne contient que les transitions secondaires ; l'annulation est à part, en bas.
  const secondary = transitions.filter((t) => t.to !== mainTo && t.tone !== "danger");
  const destructive = transitions.filter((t) => t.tone === "danger");
  const pdfHref = orderId ? `/api/commandes/${kind}/${orderId}/pdf` : null;

  /** Ferme la feuille puis lance l'action (le dialogue de motif s'ouvre hors de la feuille). */
  const fromSheet = (fn: () => void) => () => {
    setSheetOpen(false);
    fn();
  };

  return (
    <ActionBar className="max-md:flex-nowrap" data-testid="order-action-bar">
      {main?.type === "send" ? (
        <Button
          type="button"
          variant="primary"
          onClick={onSend}
          data-testid="prepare-send"
          className="max-md:flex-1"
        >
          <Send aria-hidden /> Valider l&apos;envoi
        </Button>
      ) : null}
      {main?.type === "create" ? (
        <Button
          type="button"
          variant="primary"
          onClick={onCreate}
          data-testid="create-order"
          className="max-md:flex-1"
        >
          Créer le bon
        </Button>
      ) : null}
      {/* Desktop : toutes les transitions dans l'ordre ; mobile : seulement l'action principale. */}
      {transitions.map((t) => (
        <TransitionButton
          key={t.to}
          t={t}
          tr={tr}
          className={t.to === mainTo ? "max-md:flex-1" : "max-md:hidden"}
        />
      ))}

      {/* Desktop : menu « ⋯ » d'origine. */}
      <div className="relative ml-auto max-md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Plus d'actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal />
        </Button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 bottom-full z-30 mb-2 flex w-60 flex-col border border-border-strong bg-surface py-1 shadow-lg"
            onClick={() => setMenuOpen(false)}
          >
            {pdfHref ? (
              <a
                role="menuitem"
                className="flex min-h-11 items-center gap-2 px-3 text-body hover:bg-surface-2"
                href={pdfHref}
                target="_blank"
                rel="noopener"
              >
                <FileText aria-hidden className="size-4" /> Aperçu PDF
              </a>
            ) : null}
            {orderId && canWrite ? (
              <button
                role="menuitem"
                type="button"
                className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-left text-body hover:bg-surface-2"
                onClick={onDuplicate}
                disabled={busy}
              >
                <Copy aria-hidden className="size-4" /> Dupliquer (aujourd&apos;hui)
              </button>
            ) : null}
            {canWrite ? (
              <button
                role="menuitem"
                type="button"
                className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-left text-body hover:bg-surface-2"
                onClick={onTemplate}
              >
                <Save aria-hidden className="size-4" /> Enregistrer comme modèle
              </button>
            ) : null}
            <Link
              role="menuitem"
              className="flex min-h-11 items-center gap-2 px-3 text-body hover:bg-surface-2"
              href={listHref}
            >
              Retour à la liste
            </Link>
            {canDelete ? (
              <button
                role="menuitem"
                type="button"
                className="mt-1 flex min-h-11 cursor-pointer flex-col items-start justify-center border-t border-border px-3 py-1.5 text-left text-body text-danger hover:bg-surface-2"
                onClick={del.open}
                disabled={del.pending}
                data-testid="menu-delete-order"
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 aria-hidden className="size-4" /> Supprimer le bon
                </span>
                {deleteHint ? <span className="text-hint text-fg-muted">{deleteHint}</span> : null}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Mobile : « ⋯ » ouvre une feuille du bas. */}
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Plus d'actions"
        aria-haspopup="dialog"
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen(true)}
        className={cn("shrink-0 md:hidden", !main && "ml-auto")}
        data-testid="order-more"
      >
        <MoreHorizontal />
      </Button>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Actions du bon">
        <div className="flex flex-col gap-1" data-testid="order-actions-sheet">
          {secondary.map((t) => (
            <button
              key={t.to}
              type="button"
              className={itemClass}
              disabled={tr.pending}
              onClick={fromSheet(() => tr.click(t))}
              data-testid={`sheet-transition-${t.to}`}
            >
              <Undo2 aria-hidden className="size-4 text-fg-muted" /> {t.label}
            </button>
          ))}
          {pdfHref ? (
            <a
              className={itemClass}
              href={pdfHref}
              target="_blank"
              rel="noopener"
              onClick={() => setSheetOpen(false)}
            >
              <FileText aria-hidden className="size-4 text-fg-muted" /> Aperçu PDF
            </a>
          ) : null}
          {orderId && canWrite ? (
            <button
              type="button"
              className={itemClass}
              disabled={busy}
              onClick={fromSheet(onDuplicate)}
            >
              <Copy aria-hidden className="size-4 text-fg-muted" /> Dupliquer (aujourd&apos;hui)
            </button>
          ) : null}
          {canWrite ? (
            <button type="button" className={itemClass} onClick={fromSheet(onTemplate)}>
              <Save aria-hidden className="size-4 text-fg-muted" /> Enregistrer comme modèle
            </button>
          ) : null}
          <Link className={itemClass} href={listHref} onClick={() => setSheetOpen(false)}>
            <ArrowLeft aria-hidden className="size-4 text-fg-muted" /> Retour à la liste
          </Link>
          {destructive.length || canDelete ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {destructive.map((t) => (
                <Button
                  key={t.to}
                  type="button"
                  variant="danger"
                  className="w-full"
                  disabled={tr.pending}
                  onClick={fromSheet(() => tr.click(t))}
                  data-testid={`sheet-transition-${t.to}`}
                >
                  {t.label}
                </Button>
              ))}
              {canDelete ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full border border-danger/60 text-danger"
                    disabled={del.pending}
                    onClick={fromSheet(del.open)}
                    data-testid="sheet-delete-order"
                  >
                    <Trash2 aria-hidden /> Supprimer le bon
                  </Button>
                  {deleteHint ? (
                    <p className="text-center text-hint text-fg-muted">{deleteHint}</p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </Sheet>
      {tr.dialog}
      {del.dialog}
    </ActionBar>
  );
}
