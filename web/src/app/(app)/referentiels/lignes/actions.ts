"use server";

import { ClientResponseError } from "pocketbase";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Ressources › Lignes : gares d'une ligne corrigées à la main (14 oct. 2026, remplace Admin › Lignes et arrêts et la
// table BACO line_stations). Droit `ptcar:update` (administrateurs, coordinateurs PACO/RCCA, modérateurs), revérifié par
// la règle PocketBase ; le hook n'accepte que gares, embranchements et nom, marque la ligne « manuelle » et recalcule
// les embranchements. Les bons bus (itinéraire de repli) lisent ces lignes.

type Result = { ok: true } | { ok: false; error: string };

const id = z.string().regex(/^[a-z0-9]{15}$/);
const station = z.object({
  n: z.string().trim().min(1).max(120),
  a: z.string().max(12).optional(),
  km: z.number().finite().optional(),
  b: z.number().int().min(1).max(99).optional(),
  g: z.number().int().min(0).max(1).optional(),
});
const branch = z.object({
  b: z.number().int().min(1).max(99),
  from: z.string().max(120),
  to: z.string().max(120).default(""),
});

async function editor() {
  const user = await requireUser();
  if (!can(user, "ptcar:update"))
    throw new Error("DROIT:Modification réservée (droit PtCar : modification).");
  return user;
}

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError) {
    const msg = (e.response as { message?: string })?.message;
    return { ok: false, error: e.status === 404 ? "Ligne introuvable." : msg || "Refusé." };
  }
  if (e instanceof z.ZodError) return { ok: false, error: "Gares invalides." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." };
}

export async function saveLineStations(raw: {
  id: string;
  name: string;
  stations: z.input<typeof station>[];
  branches: z.input<typeof branch>[];
}): Promise<Result> {
  try {
    const user = await editor();
    const input = z
      .object({
        id,
        name: z.string().trim().max(300),
        stations: z.array(station).min(2).max(200),
        branches: z.array(branch).max(99),
      })
      .parse(raw);
    if (input.stations.filter((s) => !s.b).length < 2)
      return { ok: false, error: "Le tronc garde au moins deux gares." };
    const pb = await pbForRequest();
    await pb.collection("rail_lines").update(input.id, {
      name: input.name,
      stations: input.stations,
      branches: input.branches,
      updated_by: user.id,
    });
    revalidatePath("/referentiels/lignes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Rétablit les gares de l'import (la ligne suit de nouveau le référentiel des trains). */
export async function resetLine(raw: string): Promise<Result> {
  try {
    const user = await editor();
    const pb = await pbForRequest();
    await pb.collection("rail_lines").update(id.parse(raw), { manual: false, updated_by: user.id });
    revalidatePath("/referentiels/lignes");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
