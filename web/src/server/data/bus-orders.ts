import "server-only";

import { z } from "zod";

import { createPb } from "../pocketbase";
import { readSessionToken } from "../session";

// Accès aux commandes bus : uniquement côté serveur, avec le jeton de l'agent (règles PocketBase).

export const ORDER_STATUSES = [
  "brouillon",
  "envoye",
  "confirme",
  "en_cours",
  "termine",
  "facture",
  "annule",
] as const;

const busOrderSchema = z.object({
  id: z.string(),
  legacy_id: z.number().nullable().default(null),
  status: z.enum(ORDER_STATUSES),
  c3_type: z.number().nullable().default(null),
  reason: z.string().default(""),
  order_date: z.string().default(""),
  call_time: z.string().default(""),
  relation: z.string().default(""),
  origin: z.string().default(""),
  destination: z.string().default(""),
  bus_count: z.number().default(0),
  created: z.string(),
  updated: z.string(),
});

export type BusOrder = z.infer<typeof busOrderSchema>;

export const listParamsSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  status: z.enum(ORDER_STATUSES).optional(),
});

export type ListParams = z.input<typeof listParamsSchema>;

export async function listBusOrders(params: ListParams = {}) {
  const { page, status } = listParamsSchema.parse(params);
  const pb = createPb(await readSessionToken());
  const result = await pb.collection("bus_orders").getList(page, 50, {
    sort: "-order_date,-created",
    // Paramètre lié : la valeur n'est jamais concaténée dans le filtre.
    filter: status ? pb.filter("status = {:status}", { status }) : "",
    fields: Object.keys(busOrderSchema.shape).join(","),
  });
  return {
    items: z.array(busOrderSchema).parse(result.items),
    page: result.page,
    totalPages: result.totalPages,
    totalItems: result.totalItems,
  };
}
