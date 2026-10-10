import "server-only";

import { z } from "zod";

// Variables lues uniquement côté serveur : PocketBase n'est jamais exposé au navigateur.
const schema = z.object({
  PB_URL: z.url().default("http://127.0.0.1:8090"),
  CSM_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Opérations : iRail et fonds de carte, appelés par le serveur seulement (option B du 8 octobre 2026).
  IRAIL_URL: z.url().default("https://api.irail.be/v1"),
  TILES_URL: z.string().default("https://tile.openstreetmap.org/{z}/{x}/{y}.png"),
  // Identification exigée par iRail et OpenStreetMap (User-Agent), sans donnée personnelle.
  CSM_USER_AGENT: z
    .string()
    .default("CSM/1.0 (Client Solutions Management Tool; test-csm.fs0ciety.org)"),
  // Ingestion DICOS (Missions PMR) : secret partagé présenté par l'extension + compte de service PocketBase (droit
  // dicos:write). Vides = endpoint désactivé (503). Jamais de jeton SNCB ici.
  CSM_DICOS_TOKEN: z.string().default(""),
  CSM_DICOS_PB_EMAIL: z.string().default(""),
  CSM_DICOS_PB_PASSWORD: z.string().default(""),
  // Passkeys (10 oct. 2026) : secret partagé avec csm-pocketbase pour ses routes internes (clé publique, jeton de
  // session). Moins de 32 caractères = passkeys désactivées. CSM_PUBLIC_URL (https://test-csm.fs0ciety.org) : identifiant
  // WebAuthn, obligatoire pour les passkeys (jamais déduit des en-têtes).
  CSM_INTERNAL_SECRET: z.string().default(""),
  CSM_PUBLIC_URL: z.string().default(""),
});

export const env = schema.parse({
  PB_URL: process.env.PB_URL,
  CSM_COOKIE_SECURE: process.env.CSM_COOKIE_SECURE,
  IRAIL_URL: process.env.IRAIL_URL,
  TILES_URL: process.env.TILES_URL,
  CSM_USER_AGENT: process.env.CSM_USER_AGENT,
  CSM_DICOS_TOKEN: process.env.CSM_DICOS_TOKEN,
  CSM_DICOS_PB_EMAIL: process.env.CSM_DICOS_PB_EMAIL,
  CSM_DICOS_PB_PASSWORD: process.env.CSM_DICOS_PB_PASSWORD,
  CSM_INTERNAL_SECRET: process.env.CSM_INTERNAL_SECRET,
  CSM_PUBLIC_URL: process.env.CSM_PUBLIC_URL,
});
