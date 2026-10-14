import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LineBoard } from "@/components/admin/line-board";
import { requireAdmin } from "@/server/auth";
import { listLines } from "@/server/data/admin";

export const metadata: Metadata = { title: "Lignes et arrêts · CSM" };

export default async function Page() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-4">
      {/* Depuis le 14 oct. 2026, Ressources › Lignes lit le référentiel des trains ; cette table (reprise de BACO) reste
          la source des itinéraires des bons bus. */}
      <p
        className="flex items-start gap-2 rounded-box border border-border bg-surface p-3 text-small"
        data-testid="admin-lines-note"
      >
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        <span>
          Ces lignes (reprises de BACO) servent aux <strong>itinéraires des bons bus</strong>{" "}
          (arrêts proposés entre deux gares). L&apos;onglet{" "}
          <Link href="/referentiels/lignes" className="link">
            Ressources › Lignes
          </Link>{" "}
          est désormais construit chaque matin depuis le référentiel des trains (toutes les lignes,
          ordre Infrabel) : une correction faite ici ne s&apos;y reflète pas. Le district d&apos;une
          gare se corrige dans{" "}
          <Link href="/referentiels/gares" className="link">
            Ressources › Gares
          </Link>
          .
        </span>
      </p>
      <LineBoard lines={await listLines()} />
    </div>
  );
}
