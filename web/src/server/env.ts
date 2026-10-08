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
});

export const env = schema.parse({
  PB_URL: process.env.PB_URL,
  CSM_COOKIE_SECURE: process.env.CSM_COOKIE_SECURE,
  IRAIL_URL: process.env.IRAIL_URL,
  TILES_URL: process.env.TILES_URL,
  CSM_USER_AGENT: process.env.CSM_USER_AGENT,
});
