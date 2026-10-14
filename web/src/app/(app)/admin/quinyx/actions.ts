"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { QUINYX_DISTRICTS } from "@/lib/quinyx/model";
import { requireAdmin } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Administration › Quinyx (14 oct. 2026) : groupes à lire, table « lieu → district », rattachement des agents Quinyx
// aux comptes CSM. Admin et sysop seulement (contrôle ici ET règles PocketBase `1760004200`).

type Result = { ok: true } | { ok: false; error: string };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);
const userId = z.string().regex(/^[a-z0-9-]{15,36}$/);
const district = z.enum(QUINYX_DISTRICTS);

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof ClientResponseError) {
    const data = e.response?.data as Record<string, { code?: string }> | undefined;
    if (data && Object.values(data).some((d) => d?.code === "validation_not_unique"))
      return { ok: false, error: "Existe déjà." };
    if (e.status === 404) return { ok: false, error: "Fiche introuvable ou accès refusé." };
    return { ok: false, error: e.response?.message || "Refusé." };
  }
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

async function run(
  fn: (pb: Awaited<ReturnType<typeof pbForRequest>>) => Promise<unknown>,
): Promise<Result> {
  try {
    await requireAdmin();
    await fn(await pbForRequest());
    revalidatePath("/admin/quinyx");
    revalidatePath("/equipe/planning");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const groupSchema = z.object({
  groupId: z
    .string()
    .trim()
    // On accepte l'adresse complète copiée depuis Quinyx (…/schedule/123456) : on n'en garde que le numéro.
    .transform((v) => v.match(/(\d{1,15})\/?$/)?.[1] ?? v)
    .pipe(z.string().regex(/^\d{1,15}$/, "Numéro de groupe Quinyx (chiffres) attendu.")),
  label: z.string().trim().min(2, "Nom du groupe trop court.").max(80),
  district: district.or(z.literal("")),
});

export async function addQuinyxGroup(input: {
  groupId: string;
  label: string;
  district: string;
}): Promise<Result> {
  return run(async (pb) => {
    const g = groupSchema.parse(input);
    await pb
      .collection("quinyx_groups")
      .create({ group_id: g.groupId, label: g.label, district: g.district, enabled: true });
  });
}

export async function updateQuinyxGroup(
  id: string,
  input: { label?: string; district?: string; enabled?: boolean },
): Promise<Result> {
  return run(async (pb) => {
    const patch = z
      .object({
        label: z.string().trim().min(2).max(80).optional(),
        district: district.or(z.literal("")).optional(),
        enabled: z.boolean().optional(),
      })
      .parse(input);
    await pb.collection("quinyx_groups").update(pbId.parse(id), patch);
  });
}

export async function deleteQuinyxGroup(id: string): Promise<Result> {
  return run((pb) => pb.collection("quinyx_groups").delete(pbId.parse(id)));
}

export async function addQuinyxPlace(input: {
  pattern: string;
  district: string;
}): Promise<Result> {
  return run(async (pb) => {
    const p = z
      .object({
        pattern: z
          .string()
          .trim()
          .min(2, "Lieu trop court.")
          .max(40)
          .transform((v) => v.toUpperCase()),
        district,
      })
      .parse(input);
    await pb.collection("quinyx_places").create(p);
  });
}

export async function updateQuinyxPlace(id: string, districtCode: string): Promise<Result> {
  return run((pb) =>
    pb
      .collection("quinyx_places")
      .update(pbId.parse(id), { district: district.parse(districtCode) }),
  );
}

export async function deleteQuinyxPlace(id: string): Promise<Result> {
  return run((pb) => pb.collection("quinyx_places").delete(pbId.parse(id)));
}

/** Rattache (ou détache, `user` vide) un agent Quinyx à un compte CSM ; le rattachement est alors validé. */
export async function linkQuinyxAgent(id: string, user: string): Promise<Result> {
  return run(async (pb) => {
    const u = user ? userId.parse(user) : "";
    if (u) {
      // Un compte CSM = un agent Quinyx : l'ancien rattachement de ce compte est retiré.
      const others = await pb.collection("quinyx_agents").getFullList({
        filter: pb.filter("user = {:u} && id != {:id}", { u, id: pbId.parse(id) }),
        fields: "id",
      });
      for (const o of others)
        await pb.collection("quinyx_agents").update(o.id, { user: "", confirmed: false });
    }
    await pb.collection("quinyx_agents").update(pbId.parse(id), { user: u, confirmed: !!u });
  });
}

/** Valide d'un coup toutes les propositions par le nom encore libres. */
export async function confirmQuinyxSuggestions(): Promise<Result & { count?: number }> {
  let count = 0;
  const r = await run(async (pb) => {
    const rows = await pb.collection("quinyx_agents").getFullList({
      filter: 'confirmed = false && user = "" && user_suggested != ""',
      fields: "id,user_suggested",
    });
    const taken = new Set(
      (
        await pb.collection("quinyx_agents").getFullList({ filter: 'user != ""', fields: "user" })
      ).map((a) => String(a.user)),
    );
    for (const a of rows.slice(0, 300)) {
      const u = String(a.user_suggested);
      if (taken.has(u)) continue;
      await pb.collection("quinyx_agents").update(a.id, { user: u, confirmed: true });
      taken.add(u);
      count++;
    }
  });
  return r.ok ? { ok: true, count } : r;
}
