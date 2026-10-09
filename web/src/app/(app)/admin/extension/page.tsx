import type { Metadata } from "next";

import { TokenList } from "@/components/pmr/extension-connect";
import { pl } from "@/lib/utils";
import { requireAdmin } from "@/server/auth";
import { listAllConnectorTokens } from "@/server/extension";

export const metadata: Metadata = { title: "Appareils connectés · Administration · CSM" };

export default async function Page() {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  await requireAdmin();
  const tokens = await listAllConnectorTokens();
  const owners = new Set(tokens.map((t) => t.owner?.id)).size;
  return (
    <section className="flex flex-col gap-4" aria-label="Appareils connectés">
      <p className="max-w-prose text-body text-fg-muted">
        Jetons de l&apos;extension DICOS de tous les agents :{" "}
        <span className="font-mono text-fg tabular">{tokens.length}</span>{" "}
        {pl(tokens.length, "appareil")} pour{" "}
        <span className="font-mono text-fg tabular">{owners}</span> {pl(owners, "agent")}. Révoquer
        un jeton (poste perdu, départ d&apos;un agent) bloque l&apos;extension de cet appareil
        d&apos;ici une minute ; l&apos;agent peut en connecter une nouvelle depuis la page «
        Extension DICOS ».
      </p>
      <TokenList tokens={tokens} admin title="" empty="Aucun appareil connecté pour l'instant." />
    </section>
  );
}
