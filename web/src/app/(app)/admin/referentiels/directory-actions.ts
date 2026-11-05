"use server";

import { ClientResponseError } from "pocketbase";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Administration › Référentiels › Services de l'annuaire (annuaire v2, 5 nov. 2026, migration 1760005200) : libellé,
// ordre et fonctions proposées des services ; création d'un service ; suppression refusée par le hook tant qu'un contact
// l'utilise. Droit `referentiels:manage`, revérifié par les règles PocketBase avec le jeton de l'agent.

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);

const serviceSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_-]{1,29}$/, "Clé : 2 à 30 lettres minuscules, chiffres, « - » ou « _ »."),
  label: z.string().trim().min(1, "Le libellé est obligatoire.").max(60),
  sort: z.coerce.number().int().min(0).max(9999).default(100),
  functions: z
    .array(z.string().trim().max(60, "Fonction : 60 caractères au plus."))
    .max(40, "40 fonctions au plus.")
    .transform((l) => [...new Set(l.filter(Boolean))]),
});

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof ClientResponseError) {
    const data = (e.response as { data?: Record<string, { message?: string }> })?.data ?? {};
    if (data.key) return { ok: false, error: "Cette clé de service existe déjà." };
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
  revalidatePath("/admin/referentiels/annuaire");
  revalidatePath("/ressources");
}

/** Crée (`id` absent) ou modifie un service ; la clé d'un service existant ne change pas. */
export async function saveDirectoryService(input: {
  id?: string;
  data: unknown;
}): Promise<Result<{ id: string }>> {
  try {
    await manager();
    const data = serviceSchema.parse(input.data);
    const pb = await pbForRequest();
    const col = pb.collection("directory_services");
    if (input.id) {
      const { key: _key, ...rest } = data;
      void _key;
      await col.update(pbId.parse(input.id), rest);
      refresh();
      return { ok: true, data: { id: input.id } };
    }
    const r = await col.create(data);
    refresh();
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDirectoryService(id: string): Promise<Result> {
  try {
    await manager();
    const pb = await pbForRequest();
    await pb.collection("directory_services").delete(pbId.parse(id));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
