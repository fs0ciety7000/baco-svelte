"use server";

import { ClientResponseError } from "pocketbase";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { invalidateSpiShapes } from "@/server/data/network";
import { pbForRequest } from "@/server/data/orders";
import { runNetworkImport, type NetworkSummary } from "@/server/network/import";

// Administration › Référentiels › Zones SPI (1760004800) : zone des gares (une par une ou en masse, « automatique » =
// retour au calcul), fiche d'une zone (nom, couleur, gare de référence, remarques), recalcul des zones et import des PN
// Infrabel. Droit `referentiels:manage`, revérifié par les règles PocketBase avec le jeton de l'agent.

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof ClientResponseError) {
    const msg = (e.response as { message?: string })?.message;
    return { ok: false, error: msg && e.status === 400 ? msg : "Refusé." };
  }
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: "Erreur inattendue." };
}

async function manager() {
  const user = await requireUser();
  if (!can(user, "referentiels:manage"))
    throw new Error("DROIT:Réservé aux gestionnaires des référentiels.");
  return user;
}

function refresh() {
  invalidateSpiShapes();
  revalidatePath("/admin/referentiels/zones-spi");
  revalidatePath("/reseau/pn");
}

/**
 * Zone de plusieurs gares (400 au plus) : un code = zone choisie à la main ; « auto » = retour au calcul (la zone est
 * recalculée aussitôt). Les zones des PN qui en dépendent sont recalculées ensuite.
 */
export async function assignStationZones(raw: {
  ids: string[];
  zone: string;
}): Promise<Result<{ done: number; failed: number }>> {
  try {
    const user = await manager();
    const input = z
      .object({
        ids: z.array(pbId).min(1).max(400),
        zone: z.string().regex(/^[A-Z]{2,6}$|^auto$/, "Zone inconnue."),
      })
      .parse(raw);
    const pb = await pbForRequest();
    const body =
      input.zone === "auto"
        ? { spi_zone_auto: true, updated_by: user.id }
        : { spi_zone: input.zone, updated_by: user.id };
    let done = 0;
    let failed = 0;
    for (let i = 0; i < input.ids.length; i += 8) {
      const res = await Promise.allSettled(
        input.ids.slice(i, i + 8).map((id) => pb.collection("stations").update(id, body)),
      );
      for (const r of res) {
        if (r.status === "fulfilled") done++;
        else failed++;
      }
    }
    if (!done) return { ok: false, error: "Aucune gare modifiée (accès refusé ?)." };
    await runNetworkImport({ crossings: false });
    refresh();
    return { ok: true, data: { done, failed } };
  } catch (e) {
    return fail(e);
  }
}

const zoneSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire.").max(80),
  color: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, "Couleur au format #a1b2c3."),
  ref_station: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
});

export async function saveSpiZone(raw: {
  id: string;
  expectedUpdated: string;
  data: z.input<typeof zoneSchema>;
}): Promise<Result> {
  try {
    const user = await manager();
    const id = pbId.parse(raw.id);
    const d = zoneSchema.parse(raw.data);
    const pb = await pbForRequest();
    const current = await pb.collection("spi_zones").getOne(id, { fields: "updated" });
    if (current.updated !== raw.expectedUpdated)
      return { ok: false, error: "La zone a été modifiée entre-temps : recharge la page." };
    await pb.collection("spi_zones").update(id, { ...d, updated_by: user.id });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Recalcul des zones (gares, puis PN) ; `crossings` : import des PN Infrabel en plus (≈ 5 s). */
export async function recomputeNetwork(raw: {
  crossings: boolean;
}): Promise<Result<NetworkSummary>> {
  try {
    await manager();
    const summary = await runNetworkImport({ crossings: raw.crossings === true });
    refresh();
    if (summary.error) return { ok: false, error: summary.error };
    return { ok: true, data: summary };
  } catch (e) {
    return fail(e);
  }
}
