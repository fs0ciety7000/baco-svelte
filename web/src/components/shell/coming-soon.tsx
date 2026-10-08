import { Hammer } from "lucide-react";

import { EmptyState } from "@/components/ui/misc";

/** Onglet dont l'écran arrive à l'étape 5 (modules, dans l'ordre Commandes → PMR → Opérations → …). */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <EmptyState
      icon={<Hammer className="size-6" />}
      title={`${title} · bientôt`}
      description={
        description ??
        "Cet écran sera construit avec son module (étape 5). La navigation est déjà en place."
      }
    />
  );
}
