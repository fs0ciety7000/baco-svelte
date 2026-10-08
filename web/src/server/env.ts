import "server-only";

import { z } from "zod";

// Variables lues uniquement côté serveur : PocketBase n'est jamais exposé au navigateur.
const schema = z.object({
  PB_URL: z.url().default("http://127.0.0.1:8090"),
  CSM_COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export const env = schema.parse({
  PB_URL: process.env.PB_URL,
  CSM_COOKIE_SECURE: process.env.CSM_COOKIE_SECURE,
});
