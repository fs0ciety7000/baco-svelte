"use server";

import { ClientResponseError } from "pocketbase";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";

// Administration › Référentiels (navigation v3, 14 oct. 2026) : création, modification, suppression des PtCar, EBP,
// points SPI, passages à niveau et lignes créées à la main. Droit `referentiels:manage` (admin, sysop ou rôle qui la
// reçoit), revérifié ici puis par les règles PocketBase (1760004700) avec le jeton de l'agent. Les passages à niveau
// gardent les droits de la Carte PN (`carte_pn:write` / `update` / `delete`) en plus de l'accès à l'écran.

export type RefKind = "ptcar" | "ebp" | "spi" | "pn";
type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const COLLECTION: Record<RefKind, string> = {
  ptcar: "ptcar",
  ebp: "ebp_views",
  spi: "spi_points",
  pn: "level_crossings",
};

const pbId = z.string().regex(/^[a-z0-9]{15}$/);
const zone = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^$|^[A-Z0-9]{2,10}$/, "Zone : 2 à 10 lettres ou chiffres (ex. MS).");

const SCHEMAS = {
  ptcar: z.object({
    abbr: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,20}$/, "Abréviation : lettres et chiffres, 20 au plus (ex. FMS)."),
    name_fr: z.string().trim().max(200),
    name_nl: z.string().trim().max(200),
  }),
  ebp: z.object({
    line: z.string().trim().max(60),
    ptcar: z.string().trim().min(1, "Le PtCar est obligatoire.").max(200),
    abbr: z.string().trim().toUpperCase().max(20),
    ebp_view: z.string().trim().max(120),
  }),
  spi: z.object({
    line: z.string().trim().min(1, "La ligne est obligatoire.").max(20),
    place: z.string().trim().max(200),
    zone,
    address: z.string().trim().max(500),
    notes: z.string().trim().max(1000),
  }),
  pn: z.object({
    line: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (/^L\./.test(v) ? v : `L.${v.replace(/^L\s*/, "")}`))
      .pipe(z.string().regex(/^L\.[0-9]{1,3}[A-Z]?$/, "Ligne : L.96, L.118, L.161A…")),
    number: z
      .string()
      .trim()
      .regex(/^[0-9]{1,4}( bis| ter)?$/, "Numéro : 1 à 4 chiffres, « bis » ou « ter » permis."),
    bk: z.coerce.number().min(0).max(1000).default(0),
    address: z.string().trim().max(500),
    lat: z.coerce.number().min(49).max(52).or(z.literal(0)).default(0),
    lon: z.coerce.number().min(2).max(7).or(z.literal(0)).default(0),
    zone,
    notes: z.string().trim().max(1000),
  }),
} as const;

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return { ok: false, error: "Fiche introuvable ou action non permise." };
    const data = (e.response as { data?: Record<string, { message?: string }> })?.data ?? {};
    if (
      Object.values(data).some((d) => /unique/i.test(d?.message ?? "")) ||
      /unique/i.test(e.message)
    )
      return {
        ok: false,
        error: "Cette valeur existe déjà (abréviation, ou ligne + numéro de PN).",
      };
    const msg = (e.response as { message?: string })?.message;
    return { ok: false, error: msg && e.status === 400 ? msg : "Refusé." };
  }
  if (e instanceof Error && e.message.startsWith("DROIT:"))
    return { ok: false, error: e.message.slice(6) };
  return { ok: false, error: "Erreur inattendue." };
}

/** Accès à l'écran (`referentiels:manage`) et, pour les PN, droit de la Carte PN de l'action. */
async function manager(kind: RefKind | "line", action: "write" | "update" | "delete") {
  const user = await requireUser();
  if (!can(user, "referentiels:manage"))
    throw new Error("DROIT:Réservé aux gestionnaires des référentiels.");
  if (kind === "pn" && !can(user, `carte_pn:${action}`))
    throw new Error("DROIT:Droit de la Carte PN manquant pour cette action.");
  return user;
}

function refresh(kind: RefKind | "line") {
  revalidatePath("/admin/referentiels", "layout");
  const consult: Record<RefKind | "line", string> = {
    ptcar: "/reseau/ptcar",
    ebp: "/reseau/ebp",
    spi: "/reseau/lignes",
    pn: "/reseau/pn",
    line: "/reseau/lignes",
  };
  revalidatePath(consult[kind]);
}

/** Crée (`id` absent) ou modifie une fiche ; verrou optimiste par `expectedUpdated`. */
export async function saveReference(input: {
  kind: RefKind;
  id?: string;
  expectedUpdated?: string;
  data: Record<string, unknown>;
}): Promise<Result<{ id: string }>> {
  try {
    const kind = z.enum(["ptcar", "ebp", "spi", "pn"]).parse(input.kind);
    const user = await manager(kind, input.id ? "update" : "write");
    const data = SCHEMAS[kind].parse(input.data);
    const pb = await pbForRequest();
    const col = pb.collection(COLLECTION[kind]);
    if (input.id) {
      const id = pbId.parse(input.id);
      const current = await col.getOne(id, { fields: "updated" });
      if (input.expectedUpdated && current.updated !== input.expectedUpdated)
        return { ok: false, error: "La fiche a été modifiée entre-temps : rouvre-la." };
      await col.update(id, { ...data, updated_by: user.id });
      refresh(kind);
      return { ok: true, data: { id } };
    }
    const extra = kind === "pn" ? { active: true, source: "csm" } : {};
    const r = await col.create({ ...data, ...extra, updated_by: user.id });
    refresh(kind);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteReference(input: { kind: RefKind; id: string }): Promise<Result> {
  try {
    const kind = z.enum(["ptcar", "ebp", "spi", "pn"]).parse(input.kind);
    await manager(kind, "delete");
    const pb = await pbForRequest();
    await pb.collection(COLLECTION[kind]).delete(pbId.parse(input.id));
    refresh(kind);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Passage à niveau désactivé : retiré de la carte et de ⌘K, gardé (liens du Journal intacts). */
export async function setCrossingActive(input: { id: string; active: boolean }): Promise<Result> {
  try {
    const user = await manager("pn", "update");
    const pb = await pbForRequest();
    await pb
      .collection("level_crossings")
      .update(pbId.parse(input.id), { active: input.active === true, updated_by: user.id });
    refresh("pn");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const lineSchema = z.object({
  line: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => v.replace(/^L\.?\s*/, ""))
    .pipe(z.string().regex(/^[0-9A-Z]{1,12}$/, "Numéro de ligne : 26, 161A…")),
  name: z.string().trim().max(300),
  stations: z
    .array(z.string().trim().min(1).max(120))
    .min(2, "Au moins deux gares, dans l'ordre.")
    .max(200),
});

/** Ligne absente de l'horaire (ex. L.26), créée « manuelle » : l'import ne l'écrase ni ne la supprime. */
export async function createRailLine(
  input: z.input<typeof lineSchema>,
): Promise<Result<{ line: string }>> {
  try {
    const user = await manager("line", "write");
    const d = lineSchema.parse(input);
    const pb = await pbForRequest();
    const name = d.name || `${d.stations[0]} – ${d.stations[d.stations.length - 1]}`;
    await pb.collection("rail_lines").create({
      line: d.line,
      name,
      stations: d.stations.map((n) => ({ n })),
      branches: [],
      updated_by: user.id,
    });
    refresh("line");
    return { ok: true, data: { line: d.line } };
  } catch (e) {
    return fail(e);
  }
}

/** Seule une ligne manuelle se supprime (règle PocketBase) : une ligne de l'import reviendrait le lendemain. */
export async function deleteRailLine(input: { id: string }): Promise<Result> {
  try {
    await manager("line", "delete");
    const pb = await pbForRequest();
    await pb.collection("rail_lines").delete(pbId.parse(input.id));
    refresh("line");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
