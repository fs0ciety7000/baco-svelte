import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { pbForRequest } from "@/server/data/orders";

// Paquets du Connecteur DICOS construits par `extension/build-zips.sh` dans `web/downloads/dicos-connector/`
// (copiés dans l'image standalone par `outputFileTracingIncludes`, voir next.config.ts).

const DIR = path.join(process.cwd(), "downloads", "dicos-connector");

const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  builtAt: z.string(),
  files: z
    .array(
      z.object({
        name: z.string().regex(/^csm-dicos-connector-(chrome|firefox)-v[\d.]+\.(zip|xpi)$/),
        browser: z.enum(["chrome", "firefox", "firefox-signed"]),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1),
});

export type ExtensionRelease = z.infer<typeof releaseSchema>;

export async function readExtensionRelease(): Promise<ExtensionRelease | null> {
  try {
    return releaseSchema.parse(JSON.parse(await readFile(path.join(DIR, "release.json"), "utf8")));
  } catch {
    return null;
  }
}

/** Contenu d'un paquet, seulement s'il figure dans release.json (aucun chemin libre). */
export async function readExtensionFile(name: string): Promise<Buffer | null> {
  const release = await readExtensionRelease();
  const file = release?.files.find((f) => f.name === name);
  if (!file) return null;
  try {
    return await readFile(path.join(DIR, file.name));
  } catch {
    return null;
  }
}

export type ConnectorToken = {
  id: string;
  label: string;
  prefix: string;
  created: string;
  lastUsed: string | null;
  lastVersion: string | null;
  /** Propriétaire (vue administration seulement). */
  owner?: { id: string; name: string };
};

async function listConnectorTokens(userId: string | null): Promise<ConnectorToken[]> {
  const pb = await pbForRequest();
  // Vue administration (tous les agents) : une erreur remonte (page d'erreur) plutôt que « aucun appareil » à tort.
  try {
    const rows = await pb.collection("connector_tokens").getFullList({
      ...(userId ? { filter: pb.filter("user = {:u}", { u: userId }) } : {}),
      sort: "-last_used,-created",
      ...(userId ? {} : { expand: "user" }),
      fields: userId
        ? "id,label,prefix,created,last_used,last_version"
        : "id,label,prefix,created,last_used,last_version,user,expand.user.id,expand.user.name,expand.user.username",
    });
    return rows.map((r) => {
      const u = (
        r.expand as { user?: { id: string; name?: string; username?: string } } | undefined
      )?.user;
      return {
        id: r.id,
        label: String(r.label || ""),
        prefix: String(r.prefix || ""),
        created: String(r.created),
        lastUsed: r.last_used ? String(r.last_used) : null,
        lastVersion: r.last_version ? String(r.last_version) : null,
        ...(userId
          ? {}
          : {
              owner: {
                id: String(r.user || ""),
                name: String(u?.name || u?.username || "Compte supprimé"),
              },
            }),
      };
    });
  } catch (e) {
    if (!userId) throw e;
    return [];
  }
}

/** Jetons de connecteur d'un agent (règle PocketBase : les siens, ou tous pour un admin / sysop). */
export function listMyConnectorTokens(userId: string): Promise<ConnectorToken[]> {
  return listConnectorTokens(userId);
}

/** Tous les jetons de connecteur, avec leur propriétaire (administration ; la règle PocketBase revérifie). */
export function listAllConnectorTokens(): Promise<ConnectorToken[]> {
  return listConnectorTokens(null);
}
