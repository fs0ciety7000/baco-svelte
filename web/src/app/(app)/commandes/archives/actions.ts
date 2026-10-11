"use server";

import { ClientResponseError } from "pocketbase";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { can, isAdmin } from "@/lib/permissions";
import { archiveOrder, archivesEnabled, backupArchives } from "@/server/archives";
import { requireUser } from "@/server/auth";
import { unarchivedOrders } from "@/server/data/archives";
import { pbForRequest } from "@/server/data/orders";

// Archives des bons : rattrapage et sauvegarde à la demande (administrateurs), suppression (`archives:delete`).

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError)
    return { ok: false, error: e.status === 404 ? "Introuvable ou accès refusé." : "Refusé." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
}

async function admin() {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("DROIT:Réservé aux administrateurs.");
  if (!archivesEnabled()) throw new Error("DROIT:Archives non configurées (CSM_INTERNAL_SECRET).");
  return user;
}

/** Archive les bons terminés qui n'ont pas encore de PDF, par paquets de 15 (bouton répété jusqu'à 0). */
export async function archivePending(): Promise<
  Result<{ done: number; failed: number; remaining: number }>
> {
  try {
    const user = await admin();
    const { todo, remaining } = await unarchivedOrders(15);
    let done = 0;
    let failed = 0;
    for (const o of todo) {
      const r = await archiveOrder(o.kind, o.id, user.id);
      if (r.ok) done++;
      else failed++;
    }
    return { ok: true, data: { done, failed, remaining } };
  } catch (e) {
    return fail(e);
  }
}

/** Sauvegarde zip des mois à jour (sans attendre la nuit). */
export async function backupNow(): Promise<Result<{ months: number; r2: boolean }>> {
  try {
    await admin();
    const r = await backupArchives();
    return { ok: true, data: { months: r.months.length, r2: r.r2 } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteArchive(id: string): Promise<Result> {
  try {
    const user = await requireUser();
    if (!can(user, "archives:delete")) throw new Error("DROIT:Droit de suppression manquant.");
    const pb = await pbForRequest();
    await pb.collection("order_pdfs").delete(
      z
        .string()
        .regex(/^[a-z0-9]{15}$/)
        .parse(id),
    );
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
