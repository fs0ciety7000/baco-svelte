"use client";

import { Eye } from "lucide-react";
import { useState, useTransition } from "react";

import { impersonate } from "@/app/(app)/admin/impersonation-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";

/**
 * « Voir en tant que » (fiche d'un compte, admin / sysop) : CSM tel que ce compte le voit, en lecture seule, 30 minutes au
 * plus. Sert aussi à vérifier un rôle et des droits. Absent pour un admin / sysop, le compte de service, soi-même.
 */
export function ImpersonateCard({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      const res = await impersonate(id).catch(() => ({
        ok: false as const,
        error: "Erreur réseau : réessaie.",
      }));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Rechargement complet : shell, droits et bandeau recalculés pour ce compte.
      window.location.assign("/");
    });
  return (
    <section
      className="flex flex-col gap-3 rounded-box border border-(--card-frame) bg-surface p-4 sm:flex-row sm:items-center shadow-rest"
      aria-label="Voir en tant que"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-h3 font-semibold">Voir en tant que</h2>
        <p className="text-small text-fg-muted">
          Affiche CSM exactement comme ce compte le voit (menus, droits, données), sans rien pouvoir
          modifier. Début et fin sont notés dans le journal d&apos;audit.
        </p>
      </div>
      <Button
        variant="secondary"
        className="shrink-0"
        onClick={() => setOpen(true)}
        data-testid="impersonate-open"
      >
        <Eye aria-hidden /> Voir en tant que
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={`Voir CSM en tant que ${name} ?`}
          description={`Tu verras CSM exactement comme ${name}, en lecture seule, 30 minutes au plus.`}
        >
          <p className="text-small text-fg-muted">
            Aucune modification ni aucun export ne sera possible. « Revenir à mon compte », dans le
            bandeau en haut de l&apos;écran, te ramène sur cette fiche.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button onClick={go} disabled={pending} data-testid="impersonate-confirm">
              <Eye aria-hidden /> {pending ? "Ouverture…" : "Voir en tant que"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
