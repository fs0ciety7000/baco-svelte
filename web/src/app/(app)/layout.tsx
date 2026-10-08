import { Wrench } from "lucide-react";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { parseUiCookie, UI_COOKIE } from "@/design/preferences";
import { maintenanceState, requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const ui = parseUiCookie((await cookies()).get(UI_COOKIE)?.value);
  // Les agents sont redirigés vers /maintenance par requireUser ; ici, seulement le bandeau des administrateurs.
  const locked = (await maintenanceState()).on;
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
