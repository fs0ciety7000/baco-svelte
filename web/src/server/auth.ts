import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { brusselsDay } from "@/lib/orders/time";
import { can, isScreen } from "@/lib/permissions";
import { DUTY_NAME, shiftLabel } from "@/lib/quinyx/model";
import { accountLinks, visibleModules } from "@/navigation";

import { dutyShiftOf } from "./data/quinyx";
import { createPb } from "./pocketbase";
import { readSessionToken, resolveActing } from "./session";
import { sessionAlive } from "./sessions";
import { isExpired, tokenPayload } from "./token";

// Rôles (lot L3) : identifiant d'une fiche `roles` (rôles système : admin, sysop, moderator, paco, guest, screen,
// disabled ; ou rôle créé par un admin). Les droits viennent de `perms`.
const ROLE_KEY = /^[a-z][a-z0-9_-]{1,39}$/;

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().default(""),
  username: z.string().default(""),
  // Identifiant mal formé (ne devrait pas arriver : validé par le hook PocketBase) : invité, plutôt qu'une déconnexion.
  role: z.string().regex(ROLE_KEY).catch("guest"),
  grants: z.array(z.string()).nullable().default([]),
  denies: z.array(z.string()).nullable().default([]),
  // Permissions effectives (rôles v3, lot L1) : écrites par le hook PocketBase seul ; absentes (ancienne instance) =
  // `can()` refait l'ancien calcul depuis role / grants / denies.
  perms: z.array(z.string()).nullish(),
  district: z.string().default(""),
  // Districts permanents (un, deux ou les trois), réglés par l'admin : filtres et alertes par défaut.
  districts: z.array(z.string()).nullable().default([]),
  // Districts du jour cochés par l'agent (valables le jour `duty_day`, Europe/Brussels).
  duty_day: z.string().default(""),
  duty_districts: z.array(z.string()).nullable().default([]),
  avatar: z.string().default(""),
  // Statut du jour affiché au Journal (« EXTRA »…), valable le jour `status_day`.
  status: z.string().default(""),
  status_day: z.string().default(""),
  preferences: z.unknown().optional(),
});

export type SessionUser = z.infer<typeof userSchema> & {
  /** « Voir en tant que » : l'administrateur qui regarde CSM avec ce compte (lecture seule). */
  impersonatedBy?: { id: string; name: string };
  /**
   * Districts du jour posés d'office d'après la prestation Quinyx (15 oct. 2026) : libellé de la prestation (« PACO_N ·
   * OCC MONS »). Absent si l'agent a choisi lui-même aujourd'hui ou s'il n'a pas de prestation. Rien n'est écrit en base.
   */
  dutyFromQuinyx?: string;
};

/**
 * Agent connecté, relu dans PocketBase une fois par requête (rôle toujours à jour, compte désactivé
 * ou supprimé = déconnecté). Le rafraîchissement du jeton est fait par le middleware.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Pendant « Voir en tant que », `token` est celui de la cible ; la session (csm_sid) reste celle de l'admin (`own`).
  const { token, own, actor } = await resolveActing();
  const payload = token ? tokenPayload(token) : null;
  if (!token || !own || !payload || isExpired(token)) return null;
  const pb = createPb(token);
  try {
    const [record, alive] = await Promise.all([
      pb.collection("users").getOne(payload.id),
      sessionAlive(own),
    ]);
    const user: SessionUser = userSchema.parse(record);
    if (actor) user.impersonatedBy = actor;
    if (user.role === "disabled" || !alive) return null;
    await applyQuinyxDuty(user, pb);
    return user;
  } catch {
    return null;
  }
});

/**
 * Districts du jour pas encore choisis aujourd'hui : ceux de la prestation Quinyx en cours, sinon de la prochaine du jour
 * (« PACO_N · OCC MONS » → Sud-Ouest dès la prise de service de 22:00, nuit comprise jusqu'à 06:00). Appliqués à la
 * requête seulement : tout ce qui lit les districts du jour (filtres, cloche, relève, ma journée) les suit, et un choix
 * fait par l'agent reste prioritaire. Une erreur de lecture (pas de droit `quinyx:read`, collection absente) = rien.
 */
async function applyQuinyxDuty(user: SessionUser, pb: ReturnType<typeof createPb>) {
  const today = brusselsDay();
  if (user.duty_day === today || isScreen(user)) return;
  const shift = await dutyShiftOf(user.id, pb).catch(() => null);
  const name = shift ? DUTY_NAME[shift.district] : undefined;
  if (!shift || !name) return;
  user.duty_day = today;
  user.duty_districts = [name];
  user.dutyFromQuinyx = shiftLabel(shift);
}

/**
 * Mode maintenance (Admin › Santé), lu une fois par requête. Écran d'attente pour les agents sur TOUTES les pages et
 * Server Actions qui passent par `requireUser` (un contrôle dans le seul layout se contourne par la navigation côté
 * client : revue du 9 oct. 2026). Ce n'est pas une barrière de sécurité, seulement un gel pendant la bascule.
 */
export const maintenanceState = cache(async (): Promise<{ on: boolean; message: string }> => {
  const token = await readSessionToken();
  if (!token) return { on: false, message: "" };
  try {
    const pb = createPb(token);
    const r = await pb
      .collection("app_settings")
      .getFirstListItem('key = "maintenance"', { fields: "value" });
    const v = (r.value ?? {}) as { on?: unknown; message?: unknown };
    return { on: v.on === true, message: typeof v.message === "string" ? v.message : "" };
  } catch {
    return { on: false, message: "" };
  }
});

/**
 * Agent connecté, sinon connexion. Un compte « Écran » (poste partagé) est renvoyé vers `/tv` depuis toute page ou
 * Server Action qui ne le déclare pas (`{ screen: true }`, seul `/tv` le fait) : il ne voit rien d'autre.
 */
export async function requireUser(opts?: { screen?: boolean }): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  if (user.role === "screen" && !opts?.screen) redirect("/tv");
  if (!isAdmin(user) && (await maintenanceState()).on) redirect("/maintenance");
  return user;
}

export function isAdmin(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "sysop";
}

/** Garde de page : 404 si l'agent n'a pas la permission (on ne révèle pas l'existence de l'écran). */
export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, permission)) notFound();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) notFound();
  return user;
}

/**
 * Garde d'un onglet de navigation ou d'un lien du menu du compte (Mon profil, Extension CSM) : mêmes règles que les menus
 * (permission + rôles masqués).
 */
export async function requireRoute(href: string): Promise<SessionUser> {
  const user = await requireUser();
  const allowed =
    visibleModules(user).some((m) => m.tabs.some((t) => t.href === href)) ||
    accountLinks(user).some((l) => l.href === href);
  if (!allowed) notFound();
  return user;
}
