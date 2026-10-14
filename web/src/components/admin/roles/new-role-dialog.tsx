"use client";

import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createRole } from "@/app/(app)/admin/roles/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { RoleColor } from "@/lib/roles";
import { pl } from "@/lib/utils";
import { cn } from "@/lib/utils";

import { ColorPicker, RoleDot } from "./role-bits";

export type BaseChoice = {
  key: string;
  label: string;
  description: string;
  color: RoleColor;
  count: number;
};

/**
 * « Nouveau rôle » en deux temps : « À partir de quel rôle ? » (droits pré-cochés d'après le modèle, ou aucun), puis nom,
 * description et couleur. `prefill` = rôle tiré des ajustements d'un agent (fiche d'un agent) : on passe directement au
 * nom.
 */
export function NewRoleDialog({
  bases,
  prefill,
}: {
  bases: BaseChoice[];
  prefill?: { base: string; perms: string[]; who: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!!prefill);
  const [step, setStep] = useState<1 | 2>(prefill ? 2 : 1);
  const [base, setBase] = useState(prefill?.base ?? bases.find((b) => b.key === "paco")?.key ?? "");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<RoleColor>("info");
  const [pending, start] = useTransition();
  const chosen = bases.find((b) => b.key === base);

  const reset = (o: boolean) => {
    setOpen(o);
    if (!o && !prefill) {
      setStep(1);
      setLabel("");
      setDescription("");
    }
  };

  const submit = () =>
    start(async () => {
      const r = await createRole({
        base,
        label,
        description,
        color,
        ...(prefill ? { perms: prefill.perms } : {}),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Rôle « ${label.trim()} » créé.`);
      setOpen(false);
      router.push(`/admin/roles/${r.data.key}`);
    });

  return (
    <Dialog open={open} onOpenChange={reset}>
      <Button variant="primary" onClick={() => setOpen(true)} data-testid="new-role">
        <Plus aria-hidden /> Nouveau rôle
      </Button>
      <DialogContent
        eyebrow={
          step === 1 ? "Étape 1 sur 2" : prefill ? "Rôle tiré des ajustements" : "Étape 2 sur 2"
        }
        title={step === 1 ? "À partir de quel rôle ?" : "Nom du nouveau rôle"}
        description={
          step === 1
            ? "Le nouveau rôle reprend ses droits ; tu pourras ensuite en ajouter ou en retirer."
            : prefill
              ? `Droits de ${prefill.who} : son rôle et ses ajustements.`
              : `Droits repris de : ${chosen?.label ?? "aucun rôle (partir de zéro)"}.`
        }
      >
        {step === 1 ? (
          <div role="radiogroup" aria-label="Rôle modèle" className="flex flex-col gap-2">
            {[
              ...bases,
              {
                key: "",
                label: "Aucun droit",
                description: "Partir de zéro et tout choisir.",
                color: "neutral" as RoleColor,
                count: -1,
              },
            ].map((b) => (
              <button
                key={b.key || "vide"}
                type="button"
                role="radio"
                aria-checked={base === b.key}
                onClick={() => setBase(b.key)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-box border px-3 py-2 text-left transition-colors",
                  base === b.key
                    ? "border-accent bg-accent-soft"
                    : "border-border hover:border-border-strong",
                )}
              >
                <RoleDot color={b.color} className="mt-1.5" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-medium text-fg">{b.label}</span>
                  <span className="text-small text-fg-muted">
                    {b.description}
                    {b.count >= 0 ? ` · ${b.count} ${pl(b.count, "agent")}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Nom du rôle" required>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                placeholder="Ex. Coordinateur de nuit"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="Une phrase pour savoir à qui le donner.">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                rows={2}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-fg">Couleur</span>
              <ColorPicker value={color} onChange={setColor} />
              <span className="text-hint text-fg-muted">
                Pastille dans les listes et bordure de l&apos;avatar.
              </span>
            </div>
          </div>
        )}
        <DialogFooter>
          {step === 1 ? (
            <Button variant="primary" onClick={() => setStep(2)} data-testid="new-role-next">
              Continuer
            </Button>
          ) : (
            <>
              {prefill ? null : (
                <Button variant="ghost" onClick={() => setStep(1)}>
                  <ArrowLeft aria-hidden /> Modèle
                </Button>
              )}
              <Button
                variant="primary"
                onClick={submit}
                loading={pending}
                disabled={label.trim().length < 2}
                data-testid="new-role-create"
              >
                Créer le rôle
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
