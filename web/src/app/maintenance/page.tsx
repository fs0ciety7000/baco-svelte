import { Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser, maintenanceState } from "@/server/auth";

export const metadata: Metadata = { title: "Maintenance · CSM" };
export const dynamic = "force-dynamic";

/** Écran d'attente du mode maintenance (hors du shell : aucune donnée métier chargée). */
export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  const m = await maintenanceState();
  if (!m.on) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="flex max-w-md flex-col items-center gap-3 border border-border bg-surface p-6 text-center">
        <Wrench aria-hidden className="size-8 text-warn" />
        <h1 className="display text-h2">Maintenance en cours</h1>
        <p className="text-body whitespace-pre-line text-fg-muted">
          {m.message || "CSM est momentanément indisponible. Réessaie dans quelques minutes."}
        </p>
        <Link href="/" className="inline-flex min-h-11 items-center text-small link">
          Réessayer
        </Link>
      </div>
    </main>
  );
}
