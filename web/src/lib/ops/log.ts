import { z } from "zod";

import { normalizeTrain } from "./irail";

// Main courante d'exploitation (décisions du 8 octobre 2026) : catégorie, heure de l'événement, liens vers les
// objets métier, consignes épinglées, « Lu », retrait avec motif. Les hooks PocketBase font foi
// (pocketbase/pb_hooks/operations.pb.js).

export const LOG_CATEGORIES = [
  "incident",
  "pmr",
  "commande",
  "travaux",
  "consigne",
  "info",
] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export const CATEGORY: Record<
  LogCategory,
  { label: string; tone: "danger" | "info" | "accent" | "warn" | "ok" | "neutral" }
> = {
  incident: { label: "Incident", tone: "danger" },
  pmr: { label: "PMR", tone: "info" },
  commande: { label: "Commande", tone: "accent" },
  travaux: { label: "Travaux", tone: "warn" },
  consigne: { label: "Consigne", tone: "ok" },
  info: { label: "Info", tone: "neutral" },
};

/** Districts qu'un agent peut cocher pour la journée (mêmes valeurs que `ops_log.district`). */
export const DUTY_DISTRICTS = ["Sud-Ouest", "Sud-Est", "Centre"] as const;
export const DUTY_SHORT: Record<string, string> = {
  "Sud-Ouest": "DSO",
  "Sud-Est": "DSE",
  Centre: "DCE",
};

/** L'auteur peut retirer son entrée pendant 15 minutes ; ensuite, les coordinateurs (miroir du hook). */
export const RETIRE_WINDOW_MS = 15 * 60_000;

const id = z
  .string()
  .regex(/^$|^[a-z0-9]{15}$/)
  .default("");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure au format HH:MM");

export const entrySchema = z
  .object({
    body: z
      .string()
      .transform((s) =>
        s
          .replace(/\r\n/g, "\n")
          .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
          .trim(),
      )
      .pipe(z.string().min(1, "Le texte est vide.").max(4000, "4 000 caractères au maximum.")),
    category: z.enum(LOG_CATEGORIES),
    day,
    time,
    urgent: z.boolean().default(false),
    pinUntilDay: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
      .default(""),
    pinUntilTime: z
      .string()
      .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/)
      .default(""),
    train: z
      .string()
      .default("")
      .transform((s, ctx) => {
        if (!s.trim()) return "";
        const t = normalizeTrain(s);
        if (!t) ctx.addIssue({ code: "custom", message: "Numéro de train illisible." });
        return t;
      }),
    busOrder: id,
    taxiOrder: id,
    pmrAssist: id,
    levelCrossing: id,
  })
  .refine((v) => !v.pinUntilTime || !!v.pinUntilDay, {
    message: "Date de fin d'épinglage manquante.",
  });
export type EntryInput = z.input<typeof entrySchema>;

/** Découpe le texte en segments : texte, mention « @nom », lien interne vers une fiche CSM. Jamais de HTML. */
export type Segment = { kind: "text" | "mention" | "url"; value: string };
export function segments(body: string): Segment[] {
  const out: Segment[] = [];
  const re = /(^|[^\w.-])(@[A-Za-z0-9_.-]{2,40})|(https?:\/\/[^\s<>"]{3,300})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const start = m.index + (m[1]?.length ?? 0);
    if (start > last) out.push({ kind: "text", value: body.slice(last, start) });
    if (m[2]) out.push({ kind: "mention", value: m[2].replace(/[.-]+$/, "") });
    else if (m[3]) out.push({ kind: "url", value: m[3].replace(/[.,;:!?)]+$/, "") });
    last =
      start +
      (m[2] ? m[2].replace(/[.-]+$/, "").length : (m[3] ?? "").replace(/[.,;:!?)]+$/, "").length);
    re.lastIndex = last;
  }
  if (last < body.length) out.push({ kind: "text", value: body.slice(last) });
  return out;
}

/** Lien http(s) affichable : seulement http / https, jamais javascript: ou data:. */
export function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
] as const;
export const ATTACHMENT_MAX = 5 * 1024 * 1024;
