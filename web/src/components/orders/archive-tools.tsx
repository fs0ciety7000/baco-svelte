"use client";

import { Archive, DatabaseBackup, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { archivePending, backupNow, deleteArchive } from "@/app/(app)/commandes/archives/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { pl } from "@/lib/utils";

/** Administrateurs : archivage des bons terminés sans PDF (par paquets) et sauvegarde immédiate. */
export function ArchiveAdminBar({ pending, enabled }: { pending: number; enabled: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  if (!enabled)
    return (
      <p className="text-small text-warn">
        Archives inactives : secret interne (CSM_INTERNAL_SECRET) absent sur ce serveur.
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-2 border border-border bg-surface-2 px-3 py-2">
      <span className="min-w-0 flex-1 text-small text-fg-muted">
        {pending
          ? `${pending} ${pl(pending, "bon terminé", "bons terminés")} sans PDF archivé.`
          : "Tous les bons terminés sont archivés."}
      </span>
      {pending ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          onClick={() =>
            start(async () => {
              const r = await safeCall(archivePending());
              if (!r.ok) return void toast.error(r.error);
              toast.success(
                `${r.data.done} ${pl(r.data.done, "bon archivé", "bons archivés")}` +
                  (r.data.failed ? `, ${r.data.failed} en échec` : "") +
                  (r.data.remaining ? ` — encore ${r.data.remaining}.` : "."),
              );
              router.refresh();
            })
          }
        >
          <Archive aria-hidden /> Archiver les bons terminés
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="border border-border"
        loading={busy}
        onClick={() =>
          start(async () => {
            const r = await safeCall(backupNow());
            if (!r.ok) return void toast.error(r.error);
            toast.success(
              r.data.months
                ? `${r.data.months} ${pl(r.data.months, "mois sauvegardé", "mois sauvegardés")} sur le serveur${r.data.r2 ? " (copie R2 dans les 5 min)" : ""}${r.data.remaining ? ` — encore ${r.data.remaining}, recliquer.` : "."}`
                : "Sauvegardes déjà à jour.",
            );
            router.refresh();
          })
        }
      >
        <DatabaseBackup aria-hidden /> Sauvegarder maintenant
      </Button>
    </div>
  );
}

export function ArchiveDelete({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="border border-border text-danger"
      loading={busy}
      aria-label={`Supprimer l'archive ${label}`}
      onClick={() =>
        window.confirm(`Supprimer le PDF archivé « ${label} » ?`) &&
        start(async () => {
          const r = await safeCall(deleteArchive(id));
          if (!r.ok) return void toast.error(r.error);
          toast.success("Archive supprimée.");
          router.refresh();
        })
      }
    >
      <Trash2 aria-hidden className="size-4" />
    </Button>
  );
}
