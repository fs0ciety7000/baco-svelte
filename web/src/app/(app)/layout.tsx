import { Wrench } from "lucide-react";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { parseUiCookie, UI_COOKIE } from "@/design/preferences";
import { isAdmin } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { getSetting } from "@/server/data/admin";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const ui = parseUiCookie((await cookies()).get(UI_COOKIE)?.value);
  // Mode maintenance (Admin › Santé) : écran d'attente pour les agents, accès gardé par les administrateurs.
  const maintenance = await getSetting<{ on?: boolean; message?: string }>("maintenance");
  const locked = !!maintenance?.value?.on;
  if (locked && !isAdmin(user)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-bg px-4">
        <div className="flex max-w-md flex-col items-center gap-3 border border-border bg-surface p-6 text-center">
          <Wrench aria-hidden className="size-8 text-warn" />
          <h1 className="display text-h2">Maintenance en cours</h1>
          <p className="text-body text-fg-muted whitespace-pre-line">
            {maintenance?.value?.message ||
              "CSM est momentanément indisponible. Réessayez dans quelques minutes."}
          </p>
        </div>
      </main>
    );
  }
  return (
    <AppShell
      ui={ui}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        grants: user.grants ?? [],
        denies: user.denies ?? [],
      }}
    >
      {locked ? (
        <p
          role="status"
          className="mb-3 flex items-center gap-2 border border-warn/60 bg-[color-mix(in_oklab,var(--warn)_10%,var(--surface))] px-3 py-2 text-small"
        >
          <Wrench aria-hidden className="size-4 text-warn" /> Mode maintenance actif : seuls les
          administrateurs ont accès à CSM.
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
