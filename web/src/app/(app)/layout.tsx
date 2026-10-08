import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/auth";

import { logout } from "../connexion/actions";

// Coque provisoire de l'étape 1 (le shell à 6 entrées arrive à l'étape 3).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between gap-4 border-b px-4 py-2">
        <span className="font-mono text-sm tracking-widest uppercase">CSM</span>
        <div className="flex items-center gap-3 text-sm">
          <span data-testid="current-user">
            {user.name || user.email} · {user.role}
          </span>
          <form action={logout}>
            <Button type="submit" variant="secondary" className="h-11 md:h-9">
              Déconnexion
            </Button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
