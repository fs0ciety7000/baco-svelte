"use client";

import { KeyRound, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { revokeAgentPasskey } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { formatShortDay, pbDate, sinceLabel } from "@/lib/orders/time";

export type AdminPasskey = { id: string; name: string; created: string; lastUsed: string };

/** Passkeys d'un agent (fiche admin) : lecture et suppression. */
export function UserPasskeys({ items }: { items: AdminPasskey[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-body font-semibold text-fg">Passkeys</h2>
      {items.length === 0 ? (
        <p className="text-small text-fg-muted">Aucune passkey sur ce compte.</p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="admin-passkeys">
          {items.map((p) => {
            const used = pbDate(p.lastUsed);
            return (
              <li key={p.id} className="flex items-center gap-3 border border-border px-3 py-2">
                <KeyRound aria-hidden className="size-4 shrink-0 text-fg-muted" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body text-fg">{p.name}</span>
                  <span className="text-small text-fg-muted">
                    Ajoutée le {formatShortDay(p.created.slice(0, 10))}
                    {used ? ` · utilisée ${sinceLabel(used)}` : " · jamais utilisée"}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await revokeAgentPasskey(p.id);
                      if (!r.ok) return void toast.error(r.error);
                      toast.success("Passkey supprimée.");
                      router.refresh();
                    })
                  }
                >
                  <Trash2 aria-hidden /> Supprimer
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
