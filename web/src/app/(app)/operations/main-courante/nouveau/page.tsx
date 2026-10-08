import type { Metadata } from "next";

import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listMentionable, type LinkedObject } from "@/server/data/ops";

import { NewEntryForm } from "./done";

export const metadata: Metadata = { title: "Nouvelle entrée de main courante · CSM" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ train?: string; categorie?: string }>;
}) {
  const user = await requirePermission("journal:write");
  const sp = await searchParams;
  const agents = await listMentionable();
  const linkKinds = (
    [
      ["bus", "bus:read"],
      ["taxi", "taxi:read"],
      ["pmr", "deplacements:read"],
      ["pn", "carte_pn:read"],
    ] as const
  )
    .filter(([, p]) => can(user, p))
    .map(([k]) => k as LinkedObject["kind"]);
  const train = typeof sp.train === "string" ? sp.train.slice(0, 20) : "";
  return (
    <section className="flex max-w-3xl flex-col gap-4" aria-label="Nouvelle entrée">
      <h2 className="text-h3 font-semibold">Nouvelle entrée</h2>
      <NewEntryForm
        agents={agents}
        linkKinds={linkKinds}
        preset={{ train, category: train ? "incident" : undefined }}
      />
    </section>
  );
}
