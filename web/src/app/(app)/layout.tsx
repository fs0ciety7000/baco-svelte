import { Wrench } from "lucide-react";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { parseUiCookie, UI_COOKIE } from "@/design/preferences";
import { pendingRelease, releaseSummary, seenVersion } from "@/lib/changelog";
import { brusselsDay } from "@/lib/orders/time";
import { can, isScreen } from "@/lib/permissions";
import { DUTY_NAME, shiftLabel } from "@/lib/quinyx/model";
import { userDistricts } from "@/lib/team";
import { maintenanceState, requireUser } from "@/server/auth";
import { releases } from "@/server/changelog";
import { todayShiftOf } from "@/server/data/quinyx";
import { listRoles } from "@/server/data/roles";

async function dutySuggestion(userId: string) {
  const shift = await todayShiftOf(userId).catch(() => null);
  const name = shift ? DUTY_NAME[shift.district] : undefined;
  return shift && name ? { districts: [name], label: shiftLabel(shift) } : null;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const ui = parseUiCookie((await cookies()).get(UI_COOKIE)?.value);
  // Les agents sont redirigés vers /maintenance par requireUser ; ici, seulement le bandeau des administrateurs.
  const locked = (await maintenanceState()).on;
  // Districts du jour : demandés chaque matin aux agents qui lisent le Journal (notifications par district).
  const today = brusselsDay();
  // Depuis le 11 oct. 2026 : une puce dans la barre du haut (ambre tant que le jour n'est pas coché) au lieu du bandeau.
  const duty = can(user, "journal:read")
    ? {
        districts: userDistricts(user, today),
        today: user.duty_day === today,
        // Pas encore coché aujourd'hui : proposition d'après la prestation Quinyx du jour (14 oct. 2026).
        suggested: user.duty_day === today ? null : await dutySuggestion(user.id),
      }
    : null;
  // Fenêtre « CSM a été mis à jour » : dernière version du changelog pas encore vue par ce compte (jamais pour l'écran).
  const all = releases();
  const pending = isScreen(user) ? null : pendingRelease(all, seenVersion(user.preferences));
  return (
    <AppShell
      ui={ui}
      roles={await listRoles()}
      version={all[0]?.version ?? null}
      update={pending ? releaseSummary(pending) : null}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        grants: user.grants ?? [],
        denies: user.denies ?? [],
        perms: user.perms ?? null,
        duty,
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
