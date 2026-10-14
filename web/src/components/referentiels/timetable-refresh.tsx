"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { startTimetableImport } from "@/app/(app)/referentiels/trains/actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

/** Bouton admin « Mettre à jour » ; pendant un import, l'écran se relit toutes les 15 s. */
export function TimetableRefresh({ running }: { running: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(id);
  }, [running, router]);
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      disabled={pending || running}
      data-testid="timetable-refresh"
      aria-label={running ? "Mise à jour en cours" : "Mettre à jour le référentiel"}
      onClick={() =>
        start(async () => {
          const res = await startTimetableImport().catch(() => null);
          if (!res) return void toast.error("Serveur injoignable : réessaie.");
          if (!res.ok) return void toast.error(res.error);
          toast.success(
            res.running ? "Mise à jour déjà en cours." : "Mise à jour lancée (environ une minute).",
          );
          router.refresh();
        })
      }
    >
      <RefreshCw aria-hidden className="size-4" />
      <span className="hidden sm:inline">
        {running ? "Mise à jour en cours…" : "Mettre à jour"}
      </span>
    </Button>
  );
}
