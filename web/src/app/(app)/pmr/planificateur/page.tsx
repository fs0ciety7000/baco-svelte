import type { Metadata } from "next";

import { EmptyState } from "@/components/ui/misc";
import { requireRoute } from "@/server/auth";

export const metadata: Metadata = { title: "Planificateur · CSM" };

// PMR › Planificateur (lot P0, 15 oct. 2026, docs/design/CADRAGE-PLANIFICATEUR-PMR.md) : socle de données en place
// (agents de gare Quinyx, dossiers DICOS en attente, tâches) ; l'écran (vue Jour, attribution) arrive au lot P1.
// Données : `plannerDay` (server/data/planner.ts) ; actions : ./actions.ts.
export default async function Page() {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  await requireRoute("/pmr/planificateur");
  return (
    <section className="flex flex-col gap-4" aria-label="Planificateur de tâches PMR">
      <EmptyState
        variant="first"
        title="Écran en préparation"
        description="Le planificateur de tâches PMR remplacera les classeurs « planificateur de tâches » : agents de gare lus dans Quinyx, prises en charge DICOS (dossiers en attente compris), attribution à un agent, un guichet B-CS, un taxi ou le chef de bord."
      />
    </section>
  );
}
