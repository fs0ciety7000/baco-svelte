"use server";

import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { isAdmin } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { createPb } from "@/server/pocketbase";
import { HOME_CHOICES } from "@/lib/home";
import { brusselsDay } from "@/lib/orders/time";
import { deviceLabel, maskIp } from "@/lib/sessions";
import { env } from "@/server/env";
import { writeSessionToken } from "@/server/session";
import { currentSid } from "@/server/sessions";

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
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

export async function saveMyProfile(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    const p = z
      .object({
        name: z.string().trim().min(1, "Nom requis").max(200),
        fonction: z.string().trim().max(200).default(""),
        workPhone: z
          .string()
          .trim()
          .max(40)
          .regex(/^[0-9+().\/ -]*$/, "Téléphone : chiffres, espaces, + ( ) . / - seulement")
          .default(""),
      })
      .parse(input);
    const pb = await pbForRequest();
    await pb
      .collection("users")
      .update(user.id, { name: p.name, fonction: p.fonction, work_phone: p.workPhone });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photo du profil (visible de tous les agents, 10 oct. 2026). Le navigateur la recadre en carré et la réduit avant
 * l'envoi ; le serveur revérifie le type (signature du fichier, pas seulement l'extension) et la taille (2 Mo).
 */
export async function uploadMyAvatar(form: FormData): Promise<Result> {
  try {
    const user = await requireUser();
    const file = form.get("avatar");
    if (!(file instanceof File) || file.size === 0) throw new Error("DROIT:Aucune image reçue.");
    if (file.size > 2 * 1024 * 1024) throw new Error("DROIT:Image trop lourde (2 Mo au plus).");
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const type =
      head[0] === 0xff && head[1] === 0xd8
        ? "image/jpeg"
        : head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
          ? "image/png"
          : String.fromCharCode(...head.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...head.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : "";
    if (!AVATAR_TYPES.includes(type)) throw new Error("DROIT:Formats acceptés : JPEG, PNG, WebP.");
    const ext = type.split("/")[1];
    const body = new FormData();
    body.set("avatar", new File([await file.arrayBuffer()], `avatar.${ext}`, { type }));
    const pb = await pbForRequest();
    await pb.collection("users").update(user.id, body);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMyAvatar(): Promise<Result> {
  try {
    const user = await requireUser();
    const pb = await pbForRequest();
    await pb.collection("users").update(user.id, { avatar: null });
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
    // Les autres appareils ont perdu leur jeton (PocketBase invalide tout au changement) : leurs sessions sont closes.
    await dropOtherSessions(auth.token, user.id);
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

// ---------------------------------------------------------------------------------------------------
// Statut du jour, page d'accueil, sessions ouvertes (demande du 10 oct. 2026)

/** Statut affiché au Journal pour la journée (« EXTRA », « Pas en service »…) ; vide = aucun. */
export async function setMyStatus(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    const status = z
      .string()
      .trim()
      .max(40)
      .parse(input ?? "");
    const pb = await pbForRequest();
    await pb
      .collection("users")
      .update(user.id, { status, status_day: status ? brusselsDay() : "" });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Page d'accueil après la connexion (liste fermée). */
export async function setMyHome(input: unknown): Promise<Result> {
  try {
    const user = await requireUser();
    const href = z.enum(HOME_CHOICES.map((c) => c.href) as [string, ...string[]]).parse(input);
    const pb = await pbForRequest();
    const me = await pb.collection("users").getOne(user.id, { fields: "preferences" });
    const prefs =
      me.preferences && typeof me.preferences === "object"
        ? (me.preferences as Record<string, unknown>)
        : {};
    await pb.collection("users").update(user.id, { preferences: { ...prefs, home: href } });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type MySession = {
  id: string;
  device: string;
  ip: string;
  method: string;
  created: string;
  lastSeen: string;
  current: boolean;
};

export async function listMySessions(): Promise<
  { ok: true; data: MySession[] } | { ok: false; error: string }
> {
  try {
    const user = await requireUser();
    const pb = await pbForRequest();
    const sid = await currentSid();
    const rows = await pb.collection("user_sessions").getFullList({
      filter: pb.filter("user = {:u}", { u: user.id }),
      sort: "-last_seen",
      fields: "id,sid,user_agent,ip,method,created,last_seen",
    });
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        device: deviceLabel(String(r.user_agent ?? "")),
        ip: maskIp(String(r.ip ?? "")),
        method: String(r.method ?? ""),
        created: String(r.created ?? ""),
        lastSeen: String(r.last_seen ?? r.created ?? ""),
        current: !!sid && r.sid === sid,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/** Déconnecte un appareil (sa session est refusée à sa prochaine requête). */
export async function revokeMySession(id: string): Promise<Result> {
  try {
    await requireUser();
    const pb = await pbForRequest();
    await pb.collection("user_sessions").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

async function dropOtherSessions(token: string, userId: string) {
  const pb = createPb(token);
  const sid = await currentSid();
  const rows = await pb
    .collection("user_sessions")
    .getFullList({ filter: pb.filter("user = {:u}", { u: userId }), fields: "id,sid" })
    .catch(() => []);
  for (const r of rows)
    if (r.sid !== sid)
      await pb
        .collection("user_sessions")
        .delete(r.id)
        .catch(() => null);
}

/**
 * Déconnecte tous les autres appareils : nouvelle clé de jeton côté PocketBase (route interne : tous les jetons de
 * l'agent deviennent invalides, y compris ceux d'avant le suivi des sessions), nouveau jeton pour cet appareil, autres
 * sessions closes.
 */
export async function logoutOtherDevices(): Promise<Result> {
  try {
    const user = await requireUser();
    if (env.CSM_INTERNAL_SECRET.length < 32)
      throw new Error("DROIT:Fonction indisponible sur ce serveur (secret interne absent).");
    const res = await fetch(`${env.PB_URL.replace(/\/$/, "")}/api/csm/session/rotate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-csm-internal": env.CSM_INTERNAL_SECRET },
      body: JSON.stringify({ user: user.id }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { token?: string };
    if (!res.ok || !body.token) throw new Error("DROIT:Déconnexion des autres appareils refusée.");
    await writeSessionToken(body.token);
    await dropOtherSessions(body.token, user.id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
