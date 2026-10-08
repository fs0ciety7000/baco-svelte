import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { parseUiCookie, UI_COOKIE } from "@/design/preferences";
import { requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const ui = parseUiCookie((await cookies()).get(UI_COOKIE)?.value);
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
      {children}
    </AppShell>
  );
}
