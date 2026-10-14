"use server";

import { z } from "zod";

import { can } from "@/lib/permissions";
import {
  dayBit,
  pickVariant,
  trainRoute,
  type RouteTrain,
  type TrainRoute,
} from "@/lib/orders/train-route";
import { requireUser } from "@/server/auth";
import { exactStationKeys, trainsThrough, trainVariants } from "@/server/data/timetable";
import { allow } from "@/server/rate-limit";

// Bons de commande : trajet et n° de train tirés du référentiel des trains (demande du 14 oct. 2026). Lecture seule, avec
// le jeton de l'agent (règles PocketBase : `train_services` lisible par les agents hors invité et compte Écran). Le
// navigateur ne reçoit que le résultat calculé ; null quand rien n'est trouvé (le formulaire se replie alors sur le
// réseau des lignes).

const daySchema = z
  .string()
  .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
  .default("");

async function reader(): Promise<string | null> {
  const user = await requireUser();
  if (!can(user, "otto:read") && !can(user, "generate_taxi:read")) return null;
  // Appelé à la frappe (avec un délai) : borne large, un script ne peut pas vider le référentiel en boucle.
  return allow(`order-train:${user.id}`, 240, 60_000) ? user.id : null;
}

const routeSchema = z.object({
  origin: z.string().trim().min(2).max(80),
  destination: z.string().trim().min(2).max(80),
  day: daySchema,
});

/** Lignes et arrêts entre deux gares d'après les trains qui les relient ; null si aucun train. */
export async function orderTrainRoute(input: unknown): Promise<TrainRoute | null> {
  const parsed = routeSchema.safeParse(input);
  if (!parsed.success || !(await reader())) return null;
  const { origin, destination, day } = parsed.data;
  try {
    const [dep, arr] = await Promise.all([exactStationKeys(origin), exactStationKeys(destination)]);
    if ([...dep].some((k) => arr.has(k))) return null;
    return trainRoute(await trainsThrough(dep, arr), dep, arr, dayBit(day));
  } catch {
    return null;
  }
}

export type OrderTrain = RouteTrain & { variants: number };

const trainSchema = z.object({
  number: z.coerce.number().int().min(1).max(99999),
  day: daySchema,
});

/** Un train par son n° (variante qui circule le jour du bon) ; null s'il est inconnu. */
export async function orderTrain(input: unknown): Promise<OrderTrain | null> {
  const parsed = trainSchema.safeParse(input);
  if (!parsed.success || !(await reader())) return null;
  try {
    const variants = await trainVariants(parsed.data.number);
    const train = pickVariant(variants, dayBit(parsed.data.day));
    return train ? { ...train, variants: variants.length } : null;
  } catch {
    return null;
  }
}
