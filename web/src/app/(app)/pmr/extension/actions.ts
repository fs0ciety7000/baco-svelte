"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { ClientResponseError } from "pocketbase";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import { hashToken } from "@/server/dicos-service";

// Jetons de connecteur personnels (extension DICOS) : créés et révoqués avec le jeton de l'agent ; les règles
// PocketBase revérifient (pour soi seulement, droit `deplacements:write`, 10 au plus). Le jeton en clair n'est
// renvoyé qu'une fois, à la création ; seule son empreinte SHA-256 est stockée.

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function fail(
  e: unknown,
  notFound = "Jeton introuvable ou déjà révoqué.",
): {
  ok: false;
  error: string;
} {
  unstable_rethrow(e);
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return { ok: false, error: notFound };
    return { ok: false, error: e.response?.message || "Refusé." };
  }
  if (e instanceof z.ZodError) return { ok: false, error: "Saisie invalide." };
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

export async function createConnectorToken(
  rawLabel: string,
): Promise<Result<{ token: string; id: string }>> {
  try {
    const user = await requireUser();
    if (!can(user, "deplacements:write"))
      return {
        ok: false,
        error: "Il faut le droit d'écrire les missions PMR pour connecter l'extension.",
      };
    const label = z.string().trim().max(80).parse(rawLabel) || "Extension DICOS";
    const token = `csmc_${randomBytes(32).toString("base64url")}`;
    const pb = await pbForRequest();
    const rec = await pb.collection("connector_tokens").create({
      user: user.id,
      label,
      token_hash: hashToken(token),
      prefix: token.slice(0, 10),
    });
    revalidatePath("/pmr/extension");
    return { ok: true, token, id: rec.id };
  } catch (e) {
    // 404 à la création = collection absente : base pas encore à jour (migration non appliquée au déploiement).
    return fail(
      e,
      "Les jetons ne sont pas encore disponibles sur le serveur (base en cours de mise à jour) : réessaie dans quelques minutes ou préviens un administrateur.",
    );
  }
}

export async function revokeConnectorToken(id: string): Promise<Result<object>> {
  try {
    await requireUser();
    const pb = await pbForRequest();
    await pb.collection("connector_tokens").delete(
      z
        .string()
        .regex(/^[a-z0-9]{15}$/)
        .parse(id),
    );
    revalidatePath("/pmr/extension");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
