"use server";

import { ClientResponseError } from "pocketbase";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { lineLabel } from "@/lib/lines";
import { diffCompanyLines } from "@/lib/orders/company-lines";
import { parseEmails } from "@/lib/orders/schemas";
import { lineId } from "@/lib/orders/stops";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { pbForRequest } from "@/server/data/orders";
import {
  getBusSupplier,
  getTaxiSupplier,
  railLineOptions,
  type BusSupplier,
  type TaxiSupplier,
} from "@/server/data/suppliers";

// Fournisseurs (Commandes › Fournisseurs, 11 oct. 2026) : écritures avec le jeton de l'agent. Droits : création
// `otto:write` / `generate_taxi:write`, modification `:update`, suppression `:delete` (les règles PocketBase revérifient ;
// une société citée par un bon ne se supprime pas : hook `orders.pb.js`).

type Result<T = undefined> =
  ({ ok: true } & (T extends undefined ? object : { data: T })) | { ok: false; error: string };

const idSchema = z.string().regex(/^[a-z0-9-]{15,36}$/);
type Action = "read" | "write" | "update" | "delete";

class Denied extends Error {}

async function allowed(kind: "bus" | "taxi", action: Action) {
  const user = await requireUser();
  if (!can(user, `${kind === "bus" ? "otto" : "generate_taxi"}:${action}`)) throw new Denied();
  return user;
}

function fail(e: unknown): { ok: false; error: string } {
  unstable_rethrow(e);
  if (e instanceof Denied) return { ok: false, error: "Droit manquant pour cette action." };
  if (e instanceof z.ZodError)
    return { ok: false, error: e.issues[0]?.message ?? "Saisie invalide." };
  if (e instanceof ClientResponseError) {
    if (e.status === 404) return { ok: false, error: "Fournisseur introuvable ou accès refusé." };
    const data = e.response?.data as Record<string, { message?: string }> | undefined;
    const field = data ? Object.entries(data)[0] : undefined;
    return {
      ok: false,
      error:
        (field ? `${field[0]} : ${field[1]?.message ?? "invalide"}` : e.response?.message) ||
        "Enregistrement refusé.",
    };
  }
  return { ok: false, error: "Erreur inattendue, réessaie." };
}

const text = (max: number) => z.string().trim().max(max).default("");
/** Liste saisie une valeur par ligne (ou séparée par « ; ») : vides et doublons retirés. */
const lines = (max: number, each = 300) =>
  z
    .string()
    .max(max)
    .default("")
    .transform((s) => [
      ...new Set(
        s
          .split(/\r?\n|;/)
          .map((x) => x.trim().slice(0, each))
          .filter(Boolean),
      ),
    ]);

const emailText = z
  .string()
  .max(500)
  .default("")
  .refine(
    (s) =>
      s
        .split(/[;,\s]+/)
        .filter(Boolean)
        .every((a) => parseEmails(a).length === 1),
    "Adresse e-mail invalide.",
  )
  .transform((s) => parseEmails(s).join("; "));

// ---------------------------------------------------------------------------------------------------
// Bus

const busSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court.").max(200),
  email: emailText,
  phone: text(100),
  address: text(500),
  notes: text(2000),
});
export type BusCompanyInput = z.input<typeof busSchema>;

export async function loadBusSupplier(id: string): Promise<Result<BusSupplier>> {
  try {
    await allowed("bus", "read");
    return { ok: true, data: await getBusSupplier(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveBusCompany(
  id: string | null,
  input: BusCompanyInput,
): Promise<Result<{ id: string }>> {
  try {
    const data = busSchema.parse(input);
    await allowed("bus", id ? "update" : "write");
    const pb = await pbForRequest();
    const r = id
      ? await pb.collection("bus_companies").update(idSchema.parse(id), data)
      : await pb.collection("bus_companies").create(data);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

const CHILD = {
  driver: "bus_drivers",
  contact: "bus_contacts",
  line: "bus_company_lines",
} as const;
export type BusChildKind = keyof typeof CHILD;

const childSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("driver"),
    name: z.string().trim().min(2, "Nom trop court.").max(200),
    phone: text(100),
  }),
  z.object({
    kind: z.literal("contact"),
    name: z.string().trim().min(2, "Nom trop court.").max(200),
    phone: text(100),
  }),
  z.object({
    kind: z.literal("line"),
    line: z.string().trim().min(1, "Ligne manquante.").max(50),
  }),
]);
export type BusChildInput = z.input<typeof childSchema>;

/** Ajoute (sans `id`) ou modifie un chauffeur, un contact ou une ligne desservie. */
export async function saveBusChild(
  company: string,
  id: string | null,
  input: BusChildInput,
): Promise<Result<{ id: string }>> {
  try {
    const { kind, ...data } = childSchema.parse(input);
    await allowed("bus", id ? "update" : "write");
    // Lignes : référentiel seulement (15 oct. 2026), écriture canonique « L.96 ».
    if ("line" in data) {
      const ref = (await railLineOptions()).find((o) => lineId(o.value) === lineId(data.line));
      if (!ref) return { ok: false, error: `Ligne absente du référentiel : ${data.line}.` };
      data.line = ref.value;
    }
    const pb = await pbForRequest();
    const col = pb.collection(CHILD[kind]);
    const r = id
      ? await col.update(idSchema.parse(id), data)
      : await col.create({ ...data, company: idSchema.parse(company) });
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Lignes desservies d'une société de bus, en masse (15 oct. 2026) : `lines` = choix complet (libellés « L.96 » du
 * référentiel `rail_lines`, ou valeurs déjà enregistrées hors référentiel). Ajouts = `otto:write`, retraits =
 * `otto:delete` ; une ligne nouvelle doit exister dans le référentiel (plus de saisie libre).
 */
export async function setBusCompanyLines(
  company: string,
  lines: string[],
): Promise<Result<{ added: number; removed: number }>> {
  try {
    const id = idSchema.parse(company);
    const wanted = z.array(z.string().trim().min(1).max(50)).max(200).parse(lines);
    const user = await allowed("bus", "read");
    const pb = await pbForRequest();
    const stored = (
      await pb
        .collection("bus_company_lines")
        .getFullList({ filter: pb.filter("company = {:id}", { id }), fields: "id,line" })
    ).map((l) => ({ id: l.id, line: String(l.line ?? "") }));
    const { add, remove } = diffCompanyLines(stored, wanted);
    if (add.length && !can(user, "otto:write"))
      return { ok: false, error: "Droit manquant pour ajouter une ligne." };
    if (remove.length && !can(user, "otto:delete"))
      return { ok: false, error: "Droit manquant pour retirer une ligne." };
    if (add.length) {
      const known = new Set((await railLineOptions()).map((o) => lineId(o.value)));
      const unknown = add.filter((l) => !known.has(lineId(l)));
      if (unknown.length)
        return { ok: false, error: `Ligne absente du référentiel : ${unknown.join(", ")}.` };
    }
    for (const line of add)
      await pb.collection("bus_company_lines").create({ company: id, line: lineLabel(line) });
    for (const rid of remove) await pb.collection("bus_company_lines").delete(rid);
    return { ok: true, data: { added: add.length, removed: remove.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteBusChild(kind: BusChildKind, id: string): Promise<Result> {
  try {
    const k = z.enum(["driver", "contact", "line"]).parse(kind);
    await allowed("bus", "delete");
    const pb = await pbForRequest();
    await pb.collection(CHILD[k]).delete(idSchema.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Taxi

const taxiSchema = z.object({
  name: z.string().trim().min(2, "Nom trop court.").max(200),
  emails: z
    .string()
    .max(2000)
    .default("")
    .refine(
      (s) =>
        s
          .split(/[;,\s]+/)
          .filter(Boolean)
          .every((a) => parseEmails(a).length === 1),
      "Adresse e-mail invalide.",
    )
    .transform((s) => parseEmails(s)),
  phones: lines(2000, 100),
  addresses: lines(4000),
  places: lines(4000, 200),
  notes: lines(4000, 1000),
});
export type TaxiCompanyInput = z.input<typeof taxiSchema>;

export async function loadTaxiSupplier(id: string): Promise<Result<TaxiSupplier>> {
  try {
    await allowed("taxi", "read");
    return { ok: true, data: await getTaxiSupplier(id) };
  } catch (e) {
    return fail(e);
  }
}

export async function saveTaxiCompany(
  id: string | null,
  input: TaxiCompanyInput,
): Promise<Result<{ id: string }>> {
  try {
    const data = taxiSchema.parse(input);
    await allowed("taxi", id ? "update" : "write");
    const pb = await pbForRequest();
    const r = id
      ? await pb.collection("taxi_companies").update(idSchema.parse(id), data)
      : await pb.collection("taxi_companies").create(data);
    return { ok: true, data: { id: r.id } };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------------------------------------------
// Suppression d'une société (refusée par le hook si un bon la cite)

export async function deleteSupplier(kind: "bus" | "taxi", id: string): Promise<Result> {
  try {
    const k = z.enum(["bus", "taxi"]).parse(kind);
    await allowed(k, "delete");
    const pb = await pbForRequest();
    await pb
      .collection(k === "bus" ? "bus_companies" : "taxi_companies")
      .delete(idSchema.parse(id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
