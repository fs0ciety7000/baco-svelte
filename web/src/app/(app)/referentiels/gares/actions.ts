"use server";

import { ClientResponseError } from "pocketbase";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { invalidateStationDistricts } from "@/server/station-districts";

// Ressources › Gares : district d'une gare (droit `ptcar:update`, revérifié par la règle PocketBase et le hook qui
// n'accepte que le district). « auto » rend le district proposé par l'import (appliqué au prochain import quotidien).

const input = z.object({
  id: z.string().regex(/^[a-z0-9]{15}$/),
  district: z.enum(["DSO", "DSE", "DCE", "", "auto"]),
});

export async function setStationDistrict(
  raw: z.input<typeof input>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "ptcar:update"))
      return { ok: false, error: "Modification réservée (droit PtCar : modification)." };
    const { id, district } = input.parse(raw);
    const pb = await pbForRequest();
    await pb
      .collection("stations")
      .update(
        id,
        district === "auto"
          ? { district_manual: false, updated_by: user.id }
          : { district, updated_by: user.id },
      );
    invalidateStationDistricts();
    revalidatePath("/referentiels/gares");
    return { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof ClientResponseError)
      return { ok: false, error: e.status === 404 ? "Gare introuvable." : "Refusé." };
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
  }
}
