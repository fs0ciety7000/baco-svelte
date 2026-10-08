"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { transitionOrder } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { BusLine } from "@/lib/orders/schemas";
import { transitionsFor, type OrderKind, type Status, type Transition } from "@/lib/orders/status";

type Driver = { id: string; name: string; company: string };
type Extra = Omit<Parameters<typeof transitionOrder>[0], "kind" | "id" | "to">;

/**
 * Boutons de transition d'une commande (panneau du suivi, en-tête du formulaire).
 * Confirmer ouvre un mini-formulaire (heure confirmée, plaque, chauffeur : facultatifs) ; Terminer propose les
 * heures de démobilisation ; Annuler exige un motif. Le serveur revérifie chaque transition.
 */
export function TransitionButtons({
  kind,
  id,
  status,
  statusBeforeCancel,
  coordinator,
  buses,
  drivers,
  companyId,
  before,
  onDone,
  hideSend = false,
  size = "md",
}: {
  kind: OrderKind;
  id: string;
  status: Status;
  statusBeforeCancel?: string;
  coordinator: boolean;
  buses?: BusLine[];
  drivers?: Driver[];
  companyId?: string;
  /** Appelé avant la transition (ex. enregistrer le brouillon en cours). */
  before?: () => Promise<boolean>;
  onDone?: (to: Status) => void;
  /** « Marquer envoyé » passe par la feuille d'envoi (brouillon Outlook) : masqué ici. */
  hideSend?: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Transition | null>(null);
  const list = transitionsFor(status, { coordinator, statusBeforeCancel }).filter(
    // Seul « brouillon → envoyé » est masqué (« Annuler la confirmation » vise aussi « envoyé »).
    (t) => !(hideSend && status === "brouillon" && t.to === "envoye"),
  );

  const run = (t: Transition, extra: Extra) =>
    start(async () => {
      let res: Awaited<ReturnType<typeof transitionOrder>>;
      try {
        if (before && !(await before())) {
          toast.error("La saisie n'a pas pu être enregistrée : transition annulée.");
          return;
        }
        res = await transitionOrder({ kind, id, to: t.to, ...extra });
      } catch {
        toast.error("Serveur injoignable (réseau ou mise à jour en cours) : réessayez.");
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
      t.to === "confirme" ||
      (t.to === "termine" && kind === "bus" && buses?.length)
    )
      setDialog(t);
    else run(t, {});
  };

  if (list.length === 0) return null;
  return (
    <>
      {list.map((t) => (
        <Button
          key={t.to}
          size={size}
          variant={t.primary ? "primary" : t.tone === "danger" ? "danger" : "secondary"}
          loading={pending && dialog === null}
          disabled={pending}
          onClick={() => click(t)}
          data-testid={`transition-${t.to}`}
        >
          {t.label}
        </Button>
      ))}
      {dialog ? (
        <TransitionDialog
          kind={kind}
          transition={dialog}
          buses={buses ?? []}
          drivers={(drivers ?? []).filter((d) => !companyId || d.company === companyId)}
          pending={pending}
          onCancel={() => setDialog(null)}
          onSubmit={(extra) => run(dialog, extra)}
        />
      ) : null}
    </>
  );
}

function TransitionDialog({
  kind,
  transition,
  buses,
  drivers,
  pending,
  onCancel,
  onSubmit,
}: {
  kind: OrderKind;
  transition: Transition;
  buses: BusLine[];
  drivers: Driver[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (extra: Extra) => void;
}) {
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState(() =>
    buses.map((b, index) => ({
      index,
      confirmed: b.confirmed || b.planned,
      plate: b.plate,
      driver: b.driver,
      demob: b.demob,
      cancelled: b.cancelled,
    })),
  );
  const [time, setTime] = useState("");
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((r) => r.map((x) => (x.index === i ? { ...x, ...patch } : x)));
  const active = rows.filter((r) => !r.cancelled);

  const submit = () => {
    if (transition.to === "annule") return onSubmit({ cancelReason: reason });
    if (transition.to === "confirme") {
      return onSubmit(
        kind === "bus"
          ? {
              details: {
                buses: active.map(({ index, confirmed, plate, driver }) => ({
                  index,
                  confirmed,
                  plate,
                  driver,
                })),
              },
            }
          : { details: { confirmed_time: time } },
      );
    }
    return onSubmit({ details: { demob: active.map(({ index, demob }) => ({ index, demob })) } });
  };

  const title =
    transition.to === "annule"
      ? "Annuler la commande"
      : transition.to === "confirme"
        ? "Confirmer la commande"
        : "Terminer la commande";
  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        title={title}
        description={
          transition.to === "annule"
            ? "Le motif est conservé dans l'historique. Si l'e-mail est déjà parti, prévenez le fournisseur."
            : transition.to === "confirme"
              ? "Le fournisseur a répondu. Les informations ci-dessous sont facultatives et modifiables ensuite."
              : "Heure de démobilisation par bus (facultative)."
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
          ) : kind === "taxi" ? (
            <Field label="Heure de prise en charge confirmée" hint="Facultatif">
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          ) : (
            active.map((r) => (
              <fieldset key={r.index} className="flex flex-col gap-3 border border-border p-3">
                <legend className="label-mono px-1 text-fg-muted">Bus {r.index + 1}</legend>
                {transition.to === "confirme" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Heure confirmée">
                      <Input
                        type="time"
                        value={r.confirmed}
                        onChange={(e) => set(r.index, { confirmed: e.target.value })}
                      />
                    </Field>
                    <Field label="Plaque">
                      <Input
                        value={r.plate}
                        onChange={(e) => set(r.index, { plate: e.target.value.toUpperCase() })}
                        maxLength={40}
                      />
                    </Field>
                    <Field label="Chauffeur" className="col-span-2">
                      <Select
                        value={r.driver}
                        onChange={(e) => set(r.index, { driver: e.target.value })}
                      >
                        <option value="">—</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : (
                  <Field label="Démobilisation">
                    <Input
                      type="time"
                      value={r.demob}
                      onChange={(e) => set(r.index, { demob: e.target.value })}
                    />
                  </Field>
                )}
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
