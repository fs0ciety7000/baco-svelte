"use server";

import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { can, isAdmin } from "@/lib/permissions";
import { contactSchema, documentMetaSchema, procedureSchema } from "@/lib/referentiels/model";
import { requireUser, type SessionUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import {
  getContact,
  getProcedure,
  similarContacts,
  type Contact,
  type Procedure,
  type ProcedureVersion,
} from "@/server/data/referentiels";

// Écritures du module Référentiels : Server Actions validées par zod, jeton de l'agent ; règles et hooks PocketBase
// revérifient (droits, auteur non forgeable, versioning des procédures, refus de suppression d'un document référencé).

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const pbId = z.string().regex(/^[a-z0-9]{15}$/);

function fail(e: unknown): { ok: false; error: string } {
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
  return { ok: false, error: "Erreur inattendue, réessayez." };
}

async function need(perm: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user, perm)) throw new Error("DROIT:Droit manquant pour cette action.");
  return user;
}
function coordinator(user: SessionUser) {
  return isAdmin(user) || user.role === "moderator";
}

// --- Annuaire -------------------------------------------------------------------------------------

export async function saveContact(
  id: string | null,
  input: unknown,
): Promise<Result<{ id: string }>> {
  try {
    const user = await need("repertoire:write");
    const c = contactSchema.parse(input);
    const pb = await pbForRequest();
    const body = { ...c, updated_by: user.id };
    if (id) {
      await pb.collection("directory_contacts").update(pbId.parse(id), body);
      return { ok: true, data: { id } };
    }
    const r = await pb.collection("directory_contacts").create(body);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContact(id: string): Promise<Result> {
  try {
    const user = await need("repertoire:write");
    if (!coordinator(user)) throw new Error("DROIT:Suppression réservée aux coordinateurs.");
    const pb = await pbForRequest();
    await pb.collection("directory_contacts").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function findContactDuplicates(
  name: string,
  phone: string,
): Promise<Result<Contact[]>> {
  try {
    await need("repertoire:read");
    return { ok: true, data: await similarContacts(String(name), String(phone)) };
  } catch (e) {
    return fail(e);
  }
}

export async function loadContact(id: string): Promise<Result<Contact>> {
  try {
    await need("repertoire:read");
    return { ok: true, data: await getContact(id) };
  } catch (e) {
    return fail(e);
  }
}

// --- Procédures et documents ----------------------------------------------------------------------

export async function saveProcedure(
  id: string | null,
  input: unknown,
): Promise<Result<{ id: string }>> {
  try {
    const user = await need("documents:write");
    const p = procedureSchema.parse(input);
    const pb = await pbForRequest();
    const body = { ...p, updated_by: user.id };
    if (id) {
      await pb.collection("procedures").update(pbId.parse(id), body);
      return { ok: true, data: { id } };
    }
    const r = await pb.collection("procedures").create(body);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProcedure(id: string): Promise<Result> {
  try {
    const user = await need("documents:write");
    if (!coordinator(user)) throw new Error("DROIT:Suppression réservée aux coordinateurs.");
    const pb = await pbForRequest();
    await pb.collection("procedures").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Restaurer une version = enregistrer son contenu comme une nouvelle modification (historisée par le hook). */
export async function restoreProcedureVersion(
  procedureId: string,
  versionId: string,
): Promise<Result> {
  try {
    const user = await need("documents:write");
    if (!coordinator(user)) throw new Error("DROIT:Restauration réservée aux coordinateurs.");
    const pb = await pbForRequest();
    const v = await pb.collection("procedure_versions").getOne(pbId.parse(versionId));
    if (v.procedure !== pbId.parse(procedureId))
      throw new Error("DROIT:Version d'une autre procédure.");
    await pb.collection("procedures").update(pbId.parse(procedureId), {
      title: v.title,
      category: v.category,
      content: v.content,
      updated_by: user.id,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function loadProcedure(
  id: string,
): Promise<Result<{ procedure: Procedure; versions: ProcedureVersion[] }>> {
  try {
    await need("documents:read");
    return { ok: true, data: await getProcedure(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function uploadDocument(form: FormData): Promise<Result<{ id: string }>> {
  try {
    const user = await need("documents:write");
    const meta = documentMetaSchema.parse({
      name: form.get("name"),
      category: form.get("category"),
    });
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("DROIT:Aucun fichier sélectionné.");
    if (file.size > 30 * 1024 * 1024) throw new Error("DROIT:Fichier trop volumineux (max 30 Mo).");
    const pb = await pbForRequest();
    const fd = new FormData();
    fd.set("name", meta.name);
    fd.set("category", meta.category);
    fd.set("file", file);
    fd.set("uploaded_by", user.id);
    const r = await pb.collection("documents").create(fd);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDocument(id: string): Promise<Result> {
  try {
    const user = await need("documents:write");
    if (!coordinator(user)) throw new Error("DROIT:Suppression réservée aux coordinateurs.");
    const pb = await pbForRequest();
    await pb.collection("documents").delete(pbId.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
