import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

// Paquets du Connecteur DICOS construits par `extension/build-zips.sh` dans `web/downloads/dicos-connector/`
// (copiés dans l'image standalone par `outputFileTracingIncludes`, voir next.config.ts).

const DIR = path.join(process.cwd(), "downloads", "dicos-connector");

const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  builtAt: z.string(),
  files: z
    .array(
      z.object({
        name: z.string().regex(/^csm-dicos-connector-(chrome|firefox)-v[\d.]+\.zip$/),
        browser: z.enum(["chrome", "firefox"]),
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
