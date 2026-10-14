"use server";

import { ClientResponseError } from "pocketbase";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { env } from "@/server/env";
import { invalidateStationDistricts } from "@/server/station-districts";

// Ressources › Gares : district, lignes et type d'une gare (droit `ptcar:update` : administrateurs, coordinateurs
// PACO/RCCA, modérateurs ; revérifié par la règle PocketBase et le hook qui n'accepte que ces champs). « auto » rend la
// valeur de l'import. Après un changement de district, les propositions des gares voisines sont recalculées.

type Result = { ok: true; done?: number; failed?: number } | { ok: false; error: string };

const id = z.string().regex(/^[a-z0-9]{15}$/);
const district = z.enum(["DSO", "DSE", "DCE", "DNO", "DNE", "", "auto"]);

async function editor() {
  const user = await requireUser();
  if (!can(user, "ptcar:update"))
    throw new Error("DROIT:Modification réservée (droit PtCar : modification).");
  return user;
}

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError)
    return { ok: false, error: e.status === 404 ? "Gare introuvable." : "Refusé." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
}

/** Propositions recalculées par PocketBase (route interne) ; sans secret : au prochain import. */
async function refreshSuggestions() {
  if (env.CSM_INTERNAL_SECRET.length < 32) return;
  await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/stations/suggest`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);
}

function districtBody(d: z.infer<typeof district>, userId: string) {
  return d === "auto"
    ? { district_manual: false, updated_by: userId }
    : { district: d, updated_by: userId };
}

export async function setStationDistrict(raw: { id: string; district: string }): Promise<Result> {
  return applyDistricts([raw]);
}

/** Attribution en masse (sélection, propositions validées) : 400 gares au plus par appel. */
export async function applyDistricts(raw: { id: string; district: string }[]): Promise<Result> {
  try {
    const user = await editor();
    const items = z.array(z.object({ id, district })).min(1).max(400).parse(raw);
    const pb = await pbForRequest();
    let done = 0;
    let failed = 0;
    // Par paquets de 8 (chaque modification passe par les règles et le hook de PocketBase).
    for (let i = 0; i < items.length; i += 8) {
      const res = await Promise.allSettled(
        items
          .slice(i, i + 8)
          .map((it) => pb.collection("stations").update(it.id, districtBody(it.district, user.id))),
      );
      for (const r of res) {
        if (r.status === "fulfilled") done++;
        else failed++;
      }
    }
    invalidateStationDistricts();
    await refreshSuggestions();
    revalidatePath("/referentiels/gares");
    return done
      ? { ok: true, done, failed }
      : { ok: false, error: "Aucune gare modifiée (accès refusé ?)." };
  } catch (e) {
    return fail(e);
  }
}

/** Lignes d'une gare (« 96, 97 ») ou « auto » (lignes relevées par l'import). */
export async function setStationLines(raw: {
  id: string;
  lines: string[] | "auto";
}): Promise<Result> {
  try {
    const user = await editor();
    const input = z
      .object({
        id,
        lines: z.union([
          z.literal("auto"),
          z
            .array(
              z
                .string()
                .trim()
                .toUpperCase()
                .regex(/^[0-9]{1,3}[A-Z]{0,2}$/),
            )
            .max(40),
        ]),
      })
      .parse(raw);
    const pb = await pbForRequest();
    await pb
      .collection("stations")
      .update(
        input.id,
        input.lines === "auto"
          ? { lines_manual: false, updated_by: user.id }
          : { lines: [...new Set(input.lines)], updated_by: user.id },
      );
    await refreshSuggestions();
    revalidatePath("/referentiels/gares");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Type d'une gare : gare, PANG (point d'arrêt non gardé) ou gare étrangère. */
export async function setStationKind(raw: { id: string; kind: string }): Promise<Result> {
  try {
    const user = await editor();
    const input = z.object({ id, kind: z.enum(["gare", "pang", "etranger"]) }).parse(raw);
    const pb = await pbForRequest();
    await pb.collection("stations").update(input.id, { kind: input.kind, updated_by: user.id });
    revalidatePath("/referentiels/gares");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
