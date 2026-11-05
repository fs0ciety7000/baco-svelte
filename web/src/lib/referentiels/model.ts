import { z } from "zod";

// Domaine Référentiels partagé client / serveur (schémas de saisie). Le contrôle réel est fait par les règles et
// hooks PocketBase ; ces schémas servent à la validation de formulaire et des Server Actions.

const line = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .pipe(z.string().max(max))
    .default("");

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Nom manquant").max(200),
  phone: line(60),
  // E-mail simple validé s'il est présent (évite une injection d'en-têtes mailto via « ? » / « & »).
  email: z
    .string()
    .trim()
    .max(200)
    .default("")
    .refine((v) => v === "" || /^[^\s@?&]+@[^\s@?&]+\.[^\s@?&]+$/.test(v), "E-mail invalide"),
  // Annuaire v2 (5 nov. 2026) : service (clé de `directory_services`, vérifiée par le hook ; vide = à classer), fonction,
  // zone (code en majuscules). Les anciens `category` / `group` ne sont plus saisis (gardés en base tels quels).
  service: line(30).pipe(z.string().regex(/^$|^[a-z][a-z0-9_-]{1,29}$/, "Service inconnu")),
  function: line(60),
  zone: line(60).transform((v) => v.toUpperCase()),
  note: z.string().trim().max(1000).default(""),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const procedureSchema = z.object({
  title: z.string().trim().min(1, "Titre manquant").max(300),
  category: line(60),
  content: z.string().max(20000).default(""),
  attachments: z
    .array(z.string().regex(/^[a-z0-9]{15}$/))
    .max(50)
    .default([]),
});
export type ProcedureInput = z.infer<typeof procedureSchema>;

export const documentMetaSchema = z.object({
  name: z.string().trim().min(1, "Nom manquant").max(300),
  category: line(60),
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;
