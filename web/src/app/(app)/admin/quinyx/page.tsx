import type { Metadata } from "next";

import { QuinyxAgents, QuinyxGroups, QuinyxPlaces } from "@/components/admin/quinyx-admin";
import { requireAdmin } from "@/server/auth";
import { adminQuinyx } from "@/server/data/quinyx";

export const metadata: Metadata = { title: "Quinyx · Administration · CSM" };

export default async function Page() {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  await requireAdmin();
  const data = await adminQuinyx();
  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <p className="text-body text-fg-muted">
        Horaires publiés dans Quinyx (prestations PACO, RCCA et EXTRA), lus par l&apos;extension CSM
        dans un onglet Quinyx connecté. Rien n&apos;est lu sans un agent connecté à Quinyx ; aucun
        mot de passe ni cookie n&apos;est conservé.
      </p>
      <QuinyxGroups groups={data.groups} />
      <QuinyxPlaces places={data.places} />
      <QuinyxAgents agents={data.agents} users={data.users} />
    </div>
  );
}
