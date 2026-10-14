"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteRole, reassignRole } from "@/app/(app)/admin/roles/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { pl } from "@/lib/utils";
import type { AdminRole, RoleAgent } from "@/server/data/roles";

/**
 * Supprimer un rôle créé par l'équipe. Encore attribué : la suppression est refusée (hook) → on propose de réaffecter
 * d'abord tous ses agents à un autre rôle, puis de supprimer.
 */
export function DeleteRole({
  role,
  agents,
  targets,
  selfHasRole,
}: {
  role: AdminRole;
  agents: RoleAgent[];
  targets: AdminRole[];
  selfHasRole: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(
    (targets.find((t) => t.id === role.basedOn) ?? targets.find((t) => t.key === "paco"))?.key ??
      "",
  );
  const [pending, start] = useTransition();
  const used = agents.length > 0;

  const run = () =>
    start(async () => {
      if (used) {
        const r = await reassignRole(role.key, to);
        if (!r.ok) return void toast.error(r.error);
      }
      const d = await deleteRole(role.id);
      if (!d.ok) return void toast.error(d.error);
      toast.success(`Rôle « ${role.label} » supprimé.`);
      setOpen(false);
      router.push("/admin/roles");
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="danger" onClick={() => setOpen(true)} data-testid="role-delete">
        <Trash2 aria-hidden /> Supprimer
      </Button>
      <DialogContent
        eyebrow="Suppression"
        title={`Supprimer « ${role.label} » ?`}
        description={
          used
            ? `Ce rôle est encore attribué à ${agents.length} ${pl(agents.length, "agent")} : choisis le rôle qui le remplace pour ${pl(agents.length, "lui", "eux")}.`
            : "Aucun agent n'a ce rôle. La suppression est définitive (elle reste visible dans le journal d'audit)."
        }
      >
        {used ? (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-wrap gap-1.5" aria-label="Agents concernés">
              {agents.slice(0, 30).map((a) => (
                <li
                  key={a.id}
                  className="rounded-control border border-border px-2 py-0.5 text-small"
                >
                  {a.name}
                  {a.disabled ? " (désactivé)" : ""}
                </li>
              ))}
              {agents.length > 30 ? (
                <li className="text-small text-fg-muted">et {agents.length - 30} autres</li>
              ) : null}
            </ul>
            {selfHasRole ? (
              <p className="text-small text-danger">
                Ton propre compte a ce rôle : change-le d&apos;abord depuis ta fiche.
              </p>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="text-small font-medium text-fg">Nouveau rôle pour ces agents</span>
              <Select
                value={to}
                onValueChange={(v) => setTo(v)}
                options={targets.map((t) => ({
                  value: t.key,
                  label: t.label,
                  hint: t.description,
                }))}
              />
            </label>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Garder le rôle
          </Button>
          <Button
            variant="danger"
            onClick={run}
            loading={pending}
            disabled={(used && !to) || selfHasRole}
            data-testid="role-delete-confirm"
          >
            {used ? "Réaffecter et supprimer" : "Supprimer le rôle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
