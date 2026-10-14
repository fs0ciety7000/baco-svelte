"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { impersonationRefusal } from "@/lib/impersonation";
import { requireAdmin } from "@/server/auth";
import { getUser } from "@/server/data/admin";
import { startImpersonation } from "@/server/impersonation";

// « Voir en tant que » (14 oct. 2026) : admin et sysop seulement (ici ET dans la route interne de PocketBase).

const userId = z.string().regex(/^[a-z0-9-]{15,36}$/);

export async function impersonate(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const me = await requireAdmin();
    const parsed = userId.safeParse(id);
    if (!parsed.success) return { ok: false, error: "Compte invalide." };
    const target = await getUser(parsed.data).catch(() => null);
    if (!target) return { ok: false, error: "Compte introuvable." };
    const refused = impersonationRefusal(me, target);
    if (refused) return { ok: false, error: refused };
    const error = await startImpersonation(target.id);
    return error ? { ok: false, error } : { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: "Impossible de voir CSM en tant que ce compte." };
  }
}
