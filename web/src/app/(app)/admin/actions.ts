"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { ruleCategory, rulesSchema } from "@/lib/ops/journal-rules";
import type { LogCategory } from "@/lib/ops/log";
import { PERMISSION_CATALOG } from "@/lib/permissions";
import { requireAdmin } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Écritures de l'administration : admin et sysop seulement (contrôle ici ET règles PocketBase `1760001400`).

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const userId = z.string().regex(/^[a-z0-9-]{15,36}$/);
const pbId = z.string().regex(/^[a-z0-9]{15}$/);
const ROLES = ["admin", "sysop", "moderator", "otto_agent", "user", "reader"] as const;
const DISTRICTS = ["", "Sud-Ouest", "Sud-Est", "Centre"] as const;
const KNOWN = new Set(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.key)));

function fail(e: unknown): { ok: false; error: string } {
  // Session expirée : laisser passer redirect() / notFound() de requireAdmin.
  unstable_rethrow(e);
  if (e instanceof ClientResponseError) {
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    const field = data ? Object.entries(data)[0] : undefined;
    if (e.status === 404) return { ok: false, error: "Fiche introuvable ou accès refusé." };
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

/** Le compte de service DICOS (`connector`) ne se gère pas ici : sinon l'ingestion pourrait tourner en admin. */
async function managed(pb: Awaited<ReturnType<typeof pbForRequest>>, uid: string) {
  const cur = await pb
    .collection("users")
    .getOne(uid, { fields: "id,role,disabled_role,grants,denies" });
  if (cur.role === "connector") throw new Error("DROIT:Compte de service : non modifiable ici.");
  return cur;
}

/** Mot de passe provisoire lisible (sans caractères ambigus), 14 caractères, tirage cryptographique. */
function tempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 12; i++) s += alphabet[randomInt(alphabet.length)];
  return `${s.slice(0, 6)}-${s.slice(6)}`;
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(200),
  username: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-zA-Z0-9._-]*$/, "Identifiant : lettres, chiffres, . _ - seulement"),
  fonction: z.string().trim().max(200).default(""),
  district: z.enum(DISTRICTS).default(""),
  role: z.enum(ROLES),
});

export async function createUser(
  input: unknown,
): Promise<Result<{ id: string; password: string }>> {
  try {
    await requireAdmin();
    const p = profileSchema
      .extend({ email: z.string().trim().toLowerCase().email("E-mail invalide").max(200) })
      .parse(input);
    const password = tempPassword();
    const pb = await pbForRequest();
    const r = await pb.collection("users").create({
      ...p,
      district: p.district || null,
      password,
      passwordConfirm: password,
      verified: true,
      emailVisibility: false,
      grants: [],
      denies: [],
    });
    return { ok: true, data: { id: r.id, password } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateUser(id: string, input: unknown): Promise<Result> {
  try {
    const me = await requireAdmin();
    const uid = userId.parse(id);
    const p = profileSchema.parse(input);
    if (uid === me.id && p.role !== me.role)
      throw new Error("DROIT:Tu ne peux pas changer ton propre rôle.");
    const pb = await pbForRequest();
    await managed(pb, uid);
    await pb.collection("users").update(uid, { ...p, district: p.district || null });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Matrice à 3 états : défaut du rôle (absent des deux listes), accordé (grants), retiré (denies). */
export async function setPermissions(
  id: string,
  input: { grants: string[]; denies: string[] },
): Promise<Result> {
  try {
    await requireAdmin();
    const uid = userId.parse(id);
    const list = z.array(z.string().refine((k) => KNOWN.has(k), "Droit inconnu")).max(100);
    const g = [...new Set(list.parse(input.grants))];
    const d = [...new Set(list.parse(input.denies))].filter((k) => !g.includes(k));
    const pb = await pbForRequest();
    const cur = await managed(pb, uid);
    // Droits hors catalogue repris de BACO (ex. planning:read) : gardés tels quels, jamais effacés par la matrice.
    const legacy = (v: unknown) =>
      Array.isArray(v) ? v.filter((k) => typeof k === "string" && !KNOWN.has(k)) : [];
    await pb.collection("users").update(uid, {
      grants: [...legacy(cur.grants), ...g],
      denies: [...legacy(cur.denies), ...d],
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setActive(id: string, active: boolean, role?: string): Promise<Result> {
  try {
    const me = await requireAdmin();
    const uid = userId.parse(id);
    if (uid === me.id) throw new Error("DROIT:Tu ne peux pas désactiver ton propre compte.");
    const pb = await pbForRequest();
    const cur = await managed(pb, uid);
    if (active) {
      // Déjà réactivé (autre onglet) : ne pas réécrire le rôle.
      if (cur.role !== "disabled") return { ok: true };
      const back = z
        .enum(ROLES)
        .catch("user")
        .parse(role ?? cur.disabled_role);
      await pb.collection("users").update(uid, { role: back, disabled_role: null });
    } else if (cur.role !== "disabled") {
      await pb.collection("users").update(uid, {
        role: "disabled",
        disabled_role: z.enum(ROLES).catch("user").parse(cur.role),
      });
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetPassword(id: string): Promise<Result<{ password: string }>> {
  try {
    const me = await requireAdmin();
    const uid = userId.parse(id);
    if (uid === me.id) throw new Error("DROIT:Change ton mot de passe depuis « Mon profil ».");
    const password = tempPassword();
    const pb = await pbForRequest();
    await managed(pb, uid);
    await pb.collection("users").update(uid, { password, passwordConfirm: password });
    return { ok: true, data: { password } };
  } catch (e) {
    return fail(e);
  }
}

// --- Lignes et arrêts -----------------------------------------------------------------------------

const stationSchema = z.object({
  line: z.string().trim().min(1, "Ligne requise").max(50),
  station: z.string().trim().min(1, "Gare requise").max(200),
  district: z.enum(DISTRICTS).default(""),
});

export async function addStation(input: unknown): Promise<Result> {
  try {
    await requireAdmin();
    const s = stationSchema.parse(input);
    const pb = await pbForRequest();
    const last = await pb.collection("line_stations").getList(1, 1, {
      filter: pb.filter("line = {:l}", { l: s.line }),
      sort: "-position",
      fields: "position",
    });
    const position = ((last.items[0]?.position as number | undefined) ?? 0) + 1;
    await pb.collection("line_stations").create({ ...s, district: s.district || null, position });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateStation(id: string, input: unknown): Promise<Result> {
  try {
    await requireAdmin();
    const s = stationSchema.parse(input);
    const pb = await pbForRequest();
    await pb
      .collection("line_stations")
      .update(pbId.parse(id), { ...s, district: s.district || null });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteStation(id: string): Promise<Result> {
  try {
    await requireAdmin();
    const pb = await pbForRequest();
    await pb.collection("line_stations").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Nouvel ordre des arrêts d'une ligne (liste complète des identifiants, dans l'ordre). */
export async function reorderLine(line: string, ids: string[]): Promise<Result> {
  try {
    await requireAdmin();
    const l = z.string().trim().min(1).max(50).parse(line);
    const list = z.array(pbId).max(300).parse(ids);
    const pb = await pbForRequest();
    const rows = await pb
      .collection("line_stations")
      .getFullList({ filter: pb.filter("line = {:l}", { l }), fields: "id,position" });
    const known = new Set(rows.map((r) => r.id));
    if (list.length !== rows.length || list.some((id) => !known.has(id)))
      throw new Error("DROIT:La liste a changé entre-temps : recharge la page.");
    const pos = new Map(rows.map((r) => [r.id, r.position as number]));
    for (const [i, id] of list.entries())
      if (pos.get(id) !== i + 1)
        await pb.collection("line_stations").update(id, { position: i + 1 });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// --- Mode maintenance -----------------------------------------------------------------------------

export async function setMaintenance(on: boolean, message: string): Promise<Result> {
  try {
    const me = await requireAdmin();
    const value = { on: !!on, message: z.string().trim().max(500).parse(message) };
    const pb = await pbForRequest();
    try {
      const r = await pb
        .collection("app_settings")
        .getFirstListItem(pb.filter('key = "maintenance"'));
      await pb.collection("app_settings").update(r.id, { value, updated_by: me.id });
    } catch (e) {
      if (!(e instanceof ClientResponseError && e.status === 404)) throw e;
      await pb.collection("app_settings").create({ key: "maintenance", value, updated_by: me.id });
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Révoque le jeton de connecteur (extension DICOS) d'un agent : l'extension est refusée d'ici une minute (cache). */
export async function revokeAgentConnectorToken(id: string): Promise<Result> {
  try {
    await requireAdmin();
    const pb = await pbForRequest();
    await pb.collection("connector_tokens").delete(pbId.parse(id));
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Règles de tri automatique du Journal (`app_settings.journal_rules`), lues par le hook PocketBase à chaque message. */
export async function saveJournalRules(input: unknown): Promise<Result> {
  try {
    const me = await requireAdmin();
    const value = rulesSchema.parse(input);
    const pb = await pbForRequest();
    try {
      const r = await pb
        .collection("app_settings")
        .getFirstListItem(pb.filter('key = "journal_rules"'));
      await pb.collection("app_settings").update(r.id, { value, updated_by: me.id });
    } catch (e) {
      if (!(e instanceof ClientResponseError && e.status === 404)) throw e;
      await pb
        .collection("app_settings")
        .create({ key: "journal_rules", value, updated_by: me.id });
    }
    revalidatePath("/admin/journal");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Reclasse les messages repris de BACO (`legacy_id > 0`) selon les règles « BACO » : seules les catégories qui changent
 * sont modifiées (historique « Catégorie », sans mention « modifié »). À rejouer après l'import de la bascule.
 */
export async function reclassBacoMessages(): Promise<Result<{ changed: number; total: number }>> {
  try {
    await requireAdmin();
    const pb = await pbForRequest();
    const setting = await pb
      .collection("app_settings")
      .getFirstListItem(pb.filter('key = "journal_rules"'))
      .catch(() => null);
    const rules = rulesSchema.safeParse(setting?.value).data?.rules ?? [];
    if (!rules.some((r) => r.source === "baco"))
      return { ok: false, error: "Aucune règle « BACO » : ajoute-en une avant de reclasser." };
    const rows = await pb
      .collection("ops_log")
      .getFullList({ filter: "legacy_id > 0", fields: "id,body,category", batch: 500 });
    let changed = 0;
    for (const r of rows) {
      const current = String(r.category) as LogCategory;
      const next = ruleCategory(rules, "baco", String(r.body), current);
      if (next !== current) {
        await pb.collection("ops_log").update(r.id, { category: next });
        changed++;
      }
    }
    return { ok: true, data: { changed, total: rows.length } };
  } catch (e) {
    return fail(e);
  }
}
