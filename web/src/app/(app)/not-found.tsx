import { SearchX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

/**
 * Page introuvable dans le shell : fiche supprimée, lien périmé ou page réservée (les gardes `requirePermission`,
 * `requireAdmin`… appellent `notFound()` pour ne pas révéler qu'une page existe). La navigation reste utilisable.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10 md:px-6">
      <h1 className="sr-only">Page introuvable</h1>
      <EmptyState
        icon={<SearchX className="size-6" />}
        title="Page introuvable"
        description="Cette page n'existe pas, a été supprimée ou n'est pas accessible avec ton compte. Si tu suivais un lien, il est peut-être périmé."
        action={
          <Button asChild variant="primary">
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        }
      />
    </div>
  );
}
