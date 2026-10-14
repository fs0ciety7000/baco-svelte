"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { FULL_ROLE_KEYS, NON_ASSIGNABLE, ROLE_COLORS } from "@/lib/roles";
import {
  fold,
  isVisible,
  revertPatch,
  roleKeyFromLabel,
  type RoleSnapshot,
} from "@/lib/roles-editor";
import { requireAdmin } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { listRolesAdmin } from "@/server/data/roles";

// Administration › Rôles (rôles v3, lot L4) : admin / sysop seulement. Les garde-fous font foi dans le hook PocketBase
// `roles.pb.js` (verrouillé, système, rôle utilisé, clé figée, catalogue fermé, recalcul des agents) ; ici : validation,
// messages clairs, et rien qu'un admin ne pourrait faire par l'API.

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return { ok: false, error: "Rôle introuvable ou accès refusé." };
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    const field = data ? Object.entries(data)[0] : undefined;
    return {
      ok: false,
      error:
        e.response?.message && !field
          ? e.response.message
          : field
            ? `${field[0]} : ${field[1]?.message ?? "invalide"}`
            : "Refusé.",
    };
  }
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

const pbId = z.string().regex(/^[a-z0-9]{15}$/, "Rôle invalide");
const roleKey = z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/, "Rôle invalide");
const perms = z
  .array(z.string().refine(isVisible, "Droit inconnu"))
  .max(200)
  .transform((l) => [...new Set(l)]);
const fields = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Nom du rôle : 2 caractères au moins")
    .max(60, "Nom trop long (60 au plus)"),
  description: z.string().trim().max(300, "Description trop longue (300 au plus)").default(""),
  color: z.enum(ROLE_COLORS),
});

/** Rôle modifiable depuis l'écran : existe, non verrouillé. */
async function editable(id: string) {
  const roles = await listRolesAdmin();
  const role = roles.find((r) => r.id === id);
  if (!role) throw new Error("DROIT:Rôle introuvable.");
  if (role.locked) throw new Error("DROIT:Ce rôle est fixé par CSM : il ne se modifie pas.");
  return { role, roles };
}

function assertUniqueLabel(roles: { id: string; label: string }[], label: string, except = "") {
  const k = fold(label);
  if (roles.some((r) => r.id !== except && fold(r.label) === k))
    throw new Error("DROIT:Un rôle porte déjà ce nom.");
}

function revalidate(key?: string) {
  revalidatePath("/admin/roles");
  if (key) revalidatePath(`/admin/roles/${key}`);
  revalidatePath("/admin");
}

/**
 * Nouveau rôle « à partir de » un modèle (ou vide) ; `perms` fournies = rôle tiré des ajustements d'un agent. Identifiant
 * tiré du nom, unique et figé ensuite.
 */
export async function createRole(input: unknown): Promise<Result<{ key: string }>> {
  try {
    await requireAdmin();
    const p = fields
      .extend({ base: z.string().max(40).default(""), perms: perms.optional() })
      .parse(input);
    const roles = await listRolesAdmin();
    assertUniqueLabel(roles, p.label);
    const base = p.base ? roles.find((r) => r.key === p.base) : undefined;
    if (p.base && !base) throw new Error("DROIT:Rôle modèle introuvable.");
    if (base && (base.locked || NON_ASSIGNABLE.includes(base.key)))
      throw new Error("DROIT:Ce rôle ne peut pas servir de modèle.");
    const key = roleKeyFromLabel(
      p.label,
      roles.map((r) => r.key),
    );
    const pb = await pbForRequest();
    await pb.collection("roles").create({
      key,
      label: p.label,
      description: p.description,
      color: p.color,
      perms: p.perms ?? base?.perms.filter(isVisible) ?? [],
      based_on: base?.id ?? "",
      sort: 55,
    });
    revalidate(key);
    return { ok: true, data: { key } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Enregistre un rôle ; renvoie l'état d'avant (toast « Annuler » : rejoué par un nouvel appel). Verrou optimiste : refusé
 * si le rôle a changé depuis l'ouverture de l'éditeur (autre onglet, autre admin).
 */
export async function saveRole(
  id: string,
  input: unknown,
): Promise<Result<{ updated: string; previous: RoleSnapshot }>> {
  try {
    await requireAdmin();
    const rid = pbId.parse(id);
    const p = fields
      .extend({ perms, expectedUpdated: z.string().max(40).default("") })
      .parse(input);
    const { role, roles } = await editable(rid);
    assertUniqueLabel(roles, p.label, rid);
    if (p.expectedUpdated && role.updated !== p.expectedUpdated)
      throw new Error(
        "DROIT:Ce rôle vient d'être modifié ailleurs. Recharge la page pour repartir de la dernière version.",
      );
    // Clés cachées (lectures BACO) déjà portées par le rôle : gardées telles quelles.
    const hidden = role.perms.filter((k) => !isVisible(k));
    const pb = await pbForRequest();
    const r = await pb.collection("roles").update(rid, {
      label: p.label,
      description: p.description,
      color: p.color,
      perms: [...hidden, ...p.perms],
    });
    revalidate(role.key);
    return {
      ok: true,
      data: {
        updated: String(r.updated ?? ""),
        previous: {
          label: role.label,
          description: role.description,
          color: role.color,
          perms: role.perms.filter(isVisible),
        },
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** « Annuler ce changement » (historique) : rétablit l'ancienne valeur des champs modifiés par une ligne d'audit. */
export async function revertRoleChange(id: string, auditId: string): Promise<Result> {
  try {
    await requireAdmin();
    const rid = pbId.parse(id);
    const aid = pbId.parse(auditId);
    const { role } = await editable(rid);
    const pb = await pbForRequest();
    const row = await pb
      .collection("audit_log")
      .getOne(aid, { fields: "collection,record,action,changes" });
    if (row.collection !== "roles" || row.record !== rid)
      throw new Error("DROIT:Ce changement ne concerne pas ce rôle.");
    const patch = revertPatch(String(row.action), row.changes);
    if (!patch) throw new Error("DROIT:Rien à annuler pour ce changement.");
    if (patch.label) {
      const roles = await listRolesAdmin();
      assertUniqueLabel(roles, patch.label, rid);
    }
    if (patch.perms)
      patch.perms = patch.perms.filter((k) => isVisible(k) || role.perms.includes(k));
    await pb.collection("roles").update(rid, patch);
    revalidate(role.key);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Supprime un rôle créé par l'équipe (le hook refuse un rôle système ou encore attribué). */
export async function deleteRole(id: string): Promise<Result> {
  try {
    await requireAdmin();
    const rid = pbId.parse(id);
    const roles = await listRolesAdmin();
    const role = roles.find((r) => r.id === rid);
    if (!role) throw new Error("DROIT:Rôle introuvable.");
    if (role.system) throw new Error("DROIT:Rôle fourni par CSM : il ne se supprime pas.");
    const pb = await pbForRequest();
    await pb.collection("roles").delete(rid);
    revalidate();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Réaffectation en masse avant suppression : les agents du rôle `from` (et les comptes désactivés qui le retrouveraient)
 * passent au rôle `to`. Administrateur / Sysop : par un administrateur seulement (le hook le revérifie).
 */
export async function reassignRole(from: string, to: string): Promise<Result<{ count: number }>> {
  try {
    const me = await requireAdmin();
    const src = roleKey.parse(from);
    const dst = roleKey.parse(to);
    if (src === dst) throw new Error("DROIT:Choisis un autre rôle.");
    const roles = await listRolesAdmin();
    const target = roles.find((r) => r.key === dst);
    if (!target || NON_ASSIGNABLE.includes(dst))
      throw new Error("DROIT:Rôle de destination invalide.");
    if (FULL_ROLE_KEYS.includes(dst) && me.role !== "admin")
      throw new Error(
        "DROIT:Seul un administrateur peut attribuer le rôle Administrateur ou Sysop.",
      );
    const source = roles.find((r) => r.key === src);
    if (!source || source.system)
      throw new Error("DROIT:Seuls les agents d'un rôle créé par l'équipe se réaffectent ici.");
    const pb = await pbForRequest();
    const rows = await pb.collection("users").getFullList({
      filter: pb.filter("role = {:k} || (role = 'disabled' && disabled_role = {:k})", { k: src }),
      fields: "id,role",
    });
    if (rows.length > 500) throw new Error("DROIT:Trop d'agents à la fois.");
    for (const u of rows) {
      if (u.id === me.id)
        throw new Error("DROIT:Ton propre compte a ce rôle : change-le d'abord depuis ta fiche.");
    }
    for (const u of rows) {
      await pb
        .collection("users")
        .update(u.id, u.role === "disabled" ? { disabled_role: dst } : { role: dst });
    }
    revalidate(src);
    return { ok: true, data: { count: rows.length } };
  } catch (e) {
    return fail(e);
  }
}
