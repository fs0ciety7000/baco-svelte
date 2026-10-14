"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { homeOf } from "@/lib/home";
import { createPb as pbFor } from "@/server/pocketbase";
import { stopImpersonation } from "@/server/impersonation";
import { clearSessionToken, readOwnSessionToken, writeSessionToken } from "@/server/session";
import { endSession, startSession } from "@/server/sessions";

const loginSchema = z.object({
  identity: z.string().trim().min(1, "Identifiant requis").max(200),
  password: z.string().min(1, "Mot de passe requis").max(200),
  next: z.string().optional(),
});

export type LoginState = { error?: string; identity?: string };

// Redirection interne uniquement (pas de //domaine ni d'URL absolue).
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Saisie invalide" };
  }
  const { identity, password, next } = parsed.data;
  const pb = pbFor();
  let home = "/";
  let redirectTo: string | null = null;
  try {
    const auth = await pb.collection("users").authWithPassword(identity, password);
    if (auth.record.role === "disabled") return { error: "Compte désactivé.", identity };
    await writeSessionToken(auth.token);
    await startSession(auth.token, "password");
    // Compte « Écran » (poste partagé) : toujours l'écran commun, quel que soit le lien demandé.
    if (auth.record.role === "screen") redirectTo = "/tv";
    else home = homeOf(auth.record.preferences);
  } catch {
    // Message identique que l'identifiant existe ou non.
    return { error: "Identifiant ou mot de passe incorrect.", identity };
  }
  // Lien demandé (suite) d'abord, sinon la page d'accueil choisie par l'agent.
  redirect(redirectTo ?? (next ? safeNext(next) : home));
}

export async function logout(): Promise<void> {
  // « Voir en tant que » en cours : fin tracée, puis la session de l'admin (jamais celle de la cible) est fermée.
  await stopImpersonation();
  await endSession(await readOwnSessionToken());
  await clearSessionToken();
  redirect("/connexion");
}
