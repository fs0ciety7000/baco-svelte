"use server";

import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { isAdmin } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { createPb } from "@/server/pocketbase";
import { writeSessionToken } from "@/server/session";

// Écritures du module Équipe : profil de l'agent, mot de passe, Nouveautés (admin, sysop, moderator).

type Result = { ok: true } | { ok: false; error: string };
const pbId = z.string().regex(/^[a-z0-9]{15}$/);

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return { ok: false, error: "Fiche introuvable ou accès refusé." };
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    if (data?.oldPassword) return { ok: false, error: "Mot de passe actuel incorrect." };
    const field = data ? Object.entries(data)[0] : undefined;
    return {
      ok: false,
      error: field
        ? `${field[0]} : ${field[1]?.message ?? "invalide"}`
        : e.response?.message || "Refusé.",
    };
  }
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: "Erreur inattendue, réessayez." };
}

export async function saveMyProfile(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    const p = z
      .object({
        name: z.string().trim().min(1, "Nom requis").max(200),
        fonction: z.string().trim().max(200).default(""),
      })
      .parse(input);
    const pb = await pbForRequest();
    await pb.collection("users").update(user.id, p);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Changement de mot de passe. PocketBase invalide les jetons existants : on se reconnecte aussitôt avec le nouveau
 * mot de passe pour reposer le cookie de session (sinon l'agent serait déconnecté au clic suivant).
 */
export async function changeMyPassword(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    const p = z
      .object({
        current: z.string().min(1, "Mot de passe actuel requis").max(200),
        next: z.string().min(10, "10 caractères au moins").max(200),
        confirm: z.string(),
      })
      .refine((v) => v.next === v.confirm, "Les deux saisies diffèrent")
      .parse(input);
    const pb = await pbForRequest();
    // Vérification explicite du mot de passe actuel : pour un admin/sysop, PocketBase (manageRule) ne contrôle pas
    // `oldPassword` (revue du 9 oct. 2026).
    const me = await pb.collection("users").getOne(user.id, { fields: "email" });
    const email = String(me.email ?? "");
    try {
      await createPb().collection("users").authWithPassword(email, p.current);
    } catch {
      throw new Error("DROIT:Mot de passe actuel incorrect.");
    }
    await pb
      .collection("users")
      .update(user.id, { oldPassword: p.current, password: p.next, passwordConfirm: p.next });
    const auth = await createPb().collection("users").authWithPassword(email, p.next);
    await writeSessionToken(auth.token);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const changelogSchema = z.object({
  title: z.string().trim().min(1, "Titre requis").max(200),
  type: z.enum(["nouveau", "ameliore", "corrige"]),
  content: z.string().trim().max(20000).default(""),
});

async function editor() {
  const user = await requireUser();
  if (!isAdmin(user) && user.role !== "moderator")
    throw new Error("DROIT:Réservé aux administrateurs et coordinateurs.");
  return user;
}

export async function saveChangelog(id: string | null, input: unknown): Promise<Result> {
  try {
    const user = await editor();
    const c = changelogSchema.parse(input);
    const pb = await pbForRequest();
    if (id) await pb.collection("changelog").update(pbId.parse(id), c);
    else await pb.collection("changelog").create({ ...c, author: user.id });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteChangelog(id: string): Promise<Result> {
  try {
    await editor();
    const pb = await pbForRequest();
    await pb.collection("changelog").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
