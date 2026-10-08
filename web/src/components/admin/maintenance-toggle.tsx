"use client";

import { Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setMaintenance } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";

/** Mode maintenance : les agents voient un écran d'attente ; les administrateurs gardent l'accès. */
export function MaintenanceToggle({ on, message }: { on: boolean; message: string }) {
  const router = useRouter();
  const [text, setText] = useState(message);
  const [pending, start] = useTransition();
  const apply = (next: boolean) =>
    start(async () => {
      const r = await setMaintenance(next, text);
      if (!r.ok) return void toast.error(r.error);
      toast.success(next ? "Mode maintenance activé." : "Mode maintenance désactivé.");
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-body">
        État :{" "}
        {on ? <Badge tone="warn">Maintenance en cours</Badge> : <Badge tone="ok">Ouvert</Badge>}
      </p>
      <Field
        label="Message affiché aux agents"
        hint="Ex. « Bascule vers CSM en cours, retour vers 14 h. »"
      >
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {on ? (
          <Button onClick={() => apply(false)} loading={pending}>
            Rouvrir CSM aux agents
          </Button>
        ) : (
          <Button
            variant="danger"
            loading={pending}
            onClick={() =>
              window.confirm(
                "Activer le mode maintenance ? Les agents ne pourront plus travailler dans CSM.",
              ) && apply(true)
            }
          >
            <Wrench aria-hidden /> Activer le mode maintenance
          </Button>
        )}
        {on ? (
          <Button variant="secondary" onClick={() => apply(true)} loading={pending}>
            Mettre à jour le message
          </Button>
        ) : null}
      </div>
    </div>
  );
}
