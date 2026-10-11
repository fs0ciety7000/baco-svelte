import { Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable · CSM" };

/**
 * 404 globale (adresse inconnue hors du shell) : rendue dans le gabarit racine (thème de l'agent), sans aucune
 * lecture de données. Même message que la page statique servie quand l'application est arrêtée
 * (dépôt coolify, error-pages/sites/csm/404.html).
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="chamfer flex w-full max-w-md flex-col gap-3 p-6 md:p-8">
        <p className="flex items-center gap-2.5">
          <span aria-hidden className="size-2.5 bg-accent" />
          <span className="display text-h3 tracking-wider">CSM</span>
        </p>
        <p className="label-mono mt-3 text-fg-muted">Erreur 404</p>
        <h1 className="display text-h2">Page introuvable</h1>
        <p className="text-body text-fg-muted">
          Cette adresse ne mène à aucune page de CSM. Le lien est peut-être ancien ou mal copié.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild variant="primary">
            <Link href="/">
              <Home aria-hidden /> Retour à l&apos;accueil
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
