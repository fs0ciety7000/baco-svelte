"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { useAutoRetry } from "@/lib/use-auto-retry";

/**
 * Erreur d'une page de l'application (serveur injoignable, redéploiement, bug) : message en français dans le shell,
 * au lieu de la page générique « Application error » (audit UX du 9 oct. 2026). La navigation reste utilisable.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  const retry = useCallback(
    () =>
      startTransition(() => {
        router.refresh();
        reset();
      }),
    [router, reset],
  );
  const left = useAutoRetry(retry);
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10 md:px-6" role="alert">
      <EmptyState
        variant="first"
        className="border-solid border-(--card-frame) bg-surface shadow-rest"
        icon={<AlertTriangle className="size-6 text-warn" />}
        title="La page n'a pas pu s'afficher"
        description={
          left !== null
            ? `CSM est peut-être en cours de mise à jour (une trentaine de secondes). Nouvel essai automatique dans ${left} s.`
            : "Le serveur ne répond toujours pas. Réessaie ; si le problème continue, préviens un administrateur."
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={retry}>
              <RotateCcw aria-hidden /> Réessayer
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        }
      />
      {error.digest ? (
        <p className="text-center text-small text-fg-muted">
          Référence : <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
