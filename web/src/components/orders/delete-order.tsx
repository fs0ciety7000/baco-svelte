"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { deleteOrder } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { ORDER_DELETE_WINDOW_MS, remainingLabel, type OrderKind } from "@/lib/orders/status";

// Suppression d'un bon (demande du 14 oct. 2026) : bouton dans le menu « ⋯ » (desktop), la feuille d'actions (mobile) et
// le panneau du Suivi ; confirmation explicite. Droits revérifiés par `deleteOrder` et par PocketBase (hook `checkDelete`).

/** Temps restant de la fenêtre du créateur (« 7h05 »), recalculé chaque minute après le montage (pas d'écart d'hydratation). */
export function useRemaining(until: string | null | undefined): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!until) return setLabel("");
    const tick = () => setLabel(remainingLabel(until));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [until]);
  return label;
}

/**
 * Suppression proposée dans un formulaire de bon : celle calculée par le serveur (`deletionFor`), ou, pour un bon créé
 * à l'instant dans ce même écran (pas encore rechargé), la fenêtre de 8 h du créateur à partir de maintenant (l'agent
 * vient de le créer : il en a le droit d'écriture ; le serveur revérifie de toute façon).
 */
export function useFormDeletion(opts: {
  kind: OrderKind;
  serverDeletion: { until: string | null; label?: string } | null | undefined;
  initialId: string | null;
  id: string | null;
  number: number | null;
  relation?: string;
}): { deletion: { until: string | null } | null; label: string } {
  const [createdHere, setCreatedHere] = useState<string | null>(null);
  useEffect(() => {
    if (!opts.initialId && opts.id && !createdHere)
      setCreatedHere(new Date(Date.now() + ORDER_DELETE_WINDOW_MS).toISOString());
  }, [opts.initialId, opts.id, createdHere]);
  const rel = (opts.relation ?? "").trim();
  const label =
    opts.kind === "bus"
      ? /^TC_/i.test(rel)
        ? rel
        : `bus n° ${opts.number ?? ""}`
      : `taxi n° ${opts.number ?? ""}`;
  if (opts.serverDeletion) return { deletion: { until: opts.serverDeletion.until }, label };
  if (createdHere && opts.id) return { deletion: { until: createdHere }, label };
  return { deletion: null, label };
}

/**
 * Logique + dialogue de confirmation. `redirect` : la Server Action renvoie vers la liste du module (fiche) ; sinon
 * `onDeleted` (panneau du Suivi). Le dialogue doit être rendu hors d'une feuille qui se ferme.
 */
export function useDeleteOrder({
  kind,
  id,
  label,
  redirect = true,
  onDeleted,
}: {
  kind: OrderKind;
  id: string;
  label: string;
  redirect?: boolean;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      let res: Awaited<ReturnType<typeof deleteOrder>>;
      try {
        res = await deleteOrder(kind, id, { redirect });
      } catch (e) {
        // Redirection de la Server Action : la navigation est faite par Next.
        if (
          e &&
          typeof e === "object" &&
          String((e as { digest?: unknown }).digest).includes("REDIRECT")
        )
          return;
        toast.error("Serveur injoignable (réseau ou mise à jour en cours) : réessaie.");
        return;
      }
      if (res && !res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Bon ${label} supprimé.`);
      setOpen(false);
      onDeleted?.();
    });
  return {
    open: () => setOpen(true),
    pending,
    dialog: open ? (
      <Dialog open onOpenChange={(o) => !o && !pending && setOpen(false)}>
        <DialogContent
          title="Supprimer le bon"
          description="L'historique du bon est supprimé avec lui ; un PDF déjà archivé est gardé. Cette action est définitive."
        >
          <p className="text-body text-fg" data-testid="delete-order-question">
            Supprimer définitivement le bon {label} ?
          </p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Retour
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={pending}
              onClick={confirm}
              data-testid="delete-order-confirm"
            >
              <Trash2 aria-hidden /> Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ) : null,
  };
}

/** Bouton autonome (panneau du Suivi). */
export function DeleteOrderButton({
  kind,
  id,
  label,
  until,
  size = "md",
  onDeleted,
}: {
  kind: OrderKind;
  id: string;
  label: string;
  until: string | null;
  size?: "sm" | "md";
  onDeleted?: () => void;
}) {
  const del = useDeleteOrder({ kind, id, label, redirect: false, onDeleted });
  const remaining = useRemaining(until);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant="ghost"
        className="text-danger"
        onClick={del.open}
        disabled={del.pending}
        data-testid="delete-order"
        title={remaining ? `Supprimable encore ${remaining}` : undefined}
      >
        <Trash2 aria-hidden /> Supprimer
      </Button>
      {del.dialog}
    </>
  );
}
