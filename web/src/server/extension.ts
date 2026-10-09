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
};

/** Jetons de connecteur de l'agent connecté (règle PocketBase : les siens seulement). */
export async function listMyConnectorTokens(userId: string): Promise<ConnectorToken[]> {
  const pb = await pbForRequest();
  try {
    const rows = await pb.collection("connector_tokens").getFullList({
      filter: pb.filter("user = {:u}", { u: userId }),
      sort: "-created",
      fields: "id,label,prefix,created,last_used,last_version",
    });
    return rows.map((r) => ({
      id: r.id,
      label: String(r.label || ""),
      prefix: String(r.prefix || ""),
      created: String(r.created),
      lastUsed: r.last_used ? String(r.last_used) : null,
      lastVersion: r.last_version ? String(r.last_version) : null,
    }));
  } catch {
    return [];
  }
}
