"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createPb } from "@/server/pocketbase";
import { allow } from "@/server/rate-limit";

// Mot de passe oublié (décision du 10 oct. 2026 : lien par e-mail). Même réponse que le compte existe ou non ; débit borné
// par adresse IP et par e-mail (pas d'envoi en rafale vers une boîte).

export type ResetState = { sent?: boolean; error?: string };

/** La réinitialisation par e-mail est-elle possible (SMTP réglé sur PocketBase) ? */
export async function passwordResetEnabled(): Promise<boolean> {
  try {
    const pb = createPb();
    const r = await pb.send<{ enabled?: boolean }>("/api/csm/password-reset", { method: "GET" });
    return r.enabled === true;
  } catch {
    return false;
  }
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
}

export async function requestReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = z
    .email()
    .max(200)
    .safeParse(
      String(form.get("email") ?? "")
        .trim()
        .toLowerCase(),
    );
  if (!email.success) return { error: "Adresse e-mail invalide." };
  const ip = await clientIp();
  if (!allow(`reset-ip:${ip}`, 5, 15 * 60_000))
    return { error: "Trop de demandes : réessaie dans un quart d'heure." };
  // Une boîte ne reçoit au plus qu'un e-mail toutes les 5 minutes ; la réponse reste identique.
  if (allow(`reset-mail:${email.data}`, 1, 5 * 60_000)) {
    try {
      await createPb().collection("users").requestPasswordReset(email.data);
    } catch {
      // Compte inconnu, SMTP en panne… : ne rien révéler.
    }
  }
  return { sent: true };
}

export type NewPasswordState = { error?: string };

export async function confirmReset(
  _prev: NewPasswordState,
  form: FormData,
): Promise<NewPasswordState> {
  const p = z
    .object({
      token: z.string().min(20).max(2000),
      password: z.string().min(10, "10 caractères au moins.").max(200),
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, "Les deux saisies diffèrent.")
    .safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Saisie invalide." };
  const ip = await clientIp();
  if (!allow(`reset-confirm:${ip}`, 10, 15 * 60_000))
    return { error: "Trop d'essais : réessaie dans un quart d'heure." };
  try {
    await createPb()
      .collection("users")
      .confirmPasswordReset(p.data.token, p.data.password, p.data.confirm);
  } catch {
    return { error: "Lien expiré ou déjà utilisé : refais une demande." };
  }
  redirect("/connexion?reinitialise=1");
}
