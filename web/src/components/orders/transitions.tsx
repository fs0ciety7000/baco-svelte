"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { transitionOrder } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { TimeField } from "@/components/ui/time-field";
import type { BusLine } from "@/lib/orders/schemas";
import { transitionsFor, type OrderKind, type Status, type Transition } from "@/lib/orders/status";

type Extra = Omit<Parameters<typeof transitionOrder>[0], "kind" | "id" | "to">;

/**
 * Boutons de transition d'une commande (panneau du suivi, en-tête du formulaire), cycle v3 du 14 oct. 2026.
 * Terminer propose les heures de démobilisation (bus) ; Valider l'envoi ouvre le brouillon Outlook (.eml) puis passe le
 * bon en « Envoyé / finalisé » ; Annuler exige un motif. Le serveur revérifie chaque transition.
 */
export function TransitionButtons({
  size = "md",
  ...props
}: TransitionOptions & { size?: "sm" | "md" }) {
  const tr = useOrderTransitions(props);
  if (tr.list.length === 0) return null;
  return (
    <>
      {tr.list.map((t) => (
        <TransitionButton key={t.to} t={t} tr={tr} size={size} />
      ))}
      {tr.dialog}
    </>
  );
}

/** Un bouton de transition (variante selon le rôle : principale, retour, annulation). */
export function TransitionButton({
  t,
  tr,
  size = "md",
  className,
  variant,
}: {
  t: Transition;
  tr: OrderTransitions;
  size?: "sm" | "md";
  className?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <Button
      size={size}
      variant={variant ?? (t.primary ? "primary" : t.tone === "danger" ? "danger" : "secondary")}
      loading={tr.pending && !tr.dialogOpen}
      disabled={tr.pending}
      onClick={() => tr.click(t)}
      data-testid={`transition-${t.to}`}
      className={className}
    >
      {t.label}
    </Button>
  );
}

export type TransitionOptions = {
  kind: OrderKind;
  id: string;
  status: Status;
  statusBeforeCancel?: string;
  coordinator: boolean;
  buses?: BusLine[];
  /** Appelé avant la transition (ex. enregistrer le brouillon en cours). */
  before?: () => Promise<boolean>;
  onDone?: (to: Status) => void;
  /** « Valider l'envoi » passe par la feuille d'envoi du formulaire (contrôles, destinataires) : masqué ici. */
  hideSend?: boolean;
};

export type OrderTransitions = ReturnType<typeof useOrderTransitions>;

/**
 * Logique des transitions sans rendu des boutons : la barre d'actions mobile des bons (`OrderActionBar`) range les
 * transitions dans une feuille. Le dialogue (`dialog`) doit être rendu HORS de cette feuille : il reste monté quand
 * elle se ferme.
 */
export function useOrderTransitions({
  kind,
  id,
  status,
  statusBeforeCancel,
  coordinator,
  buses,
  before,
  onDone,
  hideSend = false,
}: TransitionOptions) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Transition | null>(null);
  const list = transitionsFor(status, { coordinator, statusBeforeCancel, kind }).filter(
    // Seul « Valider l'envoi » (terminé → envoyé) est masqué : il passe par la feuille d'envoi.
    (t) => !(hideSend && status === "termine" && t.to === "envoye"),
  );

  const run = (t: Transition, extra: Extra) =>
    start(async () => {
      let res: Awaited<ReturnType<typeof transitionOrder>>;
      try {
        if (before && !(await before())) {
          toast.error("La saisie n'a pas pu être enregistrée : transition annulée.");
          return;
        }
        // Valider l'envoi hors formulaire (panneau du suivi) : brouillon Outlook d'abord, comme la feuille d'envoi.
        if (t.to === "envoye") {
          const a = document.createElement("a");
          a.href = `/api/commandes/${kind}/${id}/eml`;
          a.rel = "noopener";
          document.body.append(a);
          a.click();
          a.remove();
        }
        res = await transitionOrder({ kind, id, to: t.to, ...extra });
      } catch {
        toast.error("Serveur injoignable (réseau ou mise à jour en cours) : réessaie.");
        return;
      }
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Commande : ${t.label.toLowerCase()} — fait.`);
      setDialog(null);
      onDone?.(t.to);
      router.refresh();
    });

  const click = (t: Transition) => {
    if (
      t.to === "annule" ||
      (t.to === "termine" && status === "brouillon" && kind === "bus" && buses?.length)
    )
      setDialog(t);
    else run(t, {});
  };

  return {
    list,
    pending,
    click,
    dialogOpen: dialog !== null,
    dialog: dialog ? (
      <TransitionDialog
        transition={dialog}
        buses={buses ?? []}
        pending={pending}
        onCancel={() => setDialog(null)}
        onSubmit={(extra) => run(dialog, extra)}
      />
    ) : null,
  };
}

function TransitionDialog({
  transition,
  buses,
  pending,
  onCancel,
  onSubmit,
}: {
  transition: Transition;
  buses: BusLine[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (extra: Extra) => void;
}) {
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState(() =>
    buses.map((b, index) => ({ index, demob: b.demob, cancelled: b.cancelled })),
  );
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((x) => (x.index === i ? { ...x, ...patch } : x)));
  const active = rows.filter((r) => !r.cancelled);

  const submit = () => {
    if (transition.to === "annule") return onSubmit({ cancelReason: reason });
    return onSubmit({ details: { demob: active.map(({ index, demob }) => ({ index, demob })) } });
  };

  const title = transition.to === "annule" ? "Annuler la commande" : "Terminer la commande";
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        title={title}
        description={
          transition.to === "annule"
            ? "Le motif est conservé dans l'historique. Prévenez le fournisseur si le bus était commandé."
            : "Les bus sont démobilisés : heure de démobilisation par bus (facultative)."
        }
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {transition.to === "annule" ? (
            <Field label="Motif d'annulation" required>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                required
                autoFocus
              />
            </Field>
          ) : (
            active.map((r) => (
              <fieldset key={r.index} className="flex flex-col gap-3 border border-border p-3">
                <legend className="label-mono px-1 text-fg-muted">Bus {r.index + 1}</legend>
                <Field label="Démobilisation">
                  <TimeField value={r.demob} onValueChange={(v) => set(r.index, { demob: v })} />
                </Field>
              </fieldset>
            ))
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel}>
              Retour
            </Button>
            <Button
              type="submit"
              variant={transition.to === "annule" ? "danger" : "primary"}
              loading={pending}
              disabled={transition.to === "annule" && !reason.trim()}
            >
              {transition.label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
