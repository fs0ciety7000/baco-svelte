import type { Metadata } from "next";

import { StationsScreen } from "@/components/referentiels/stations-screen";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Gares et districts · Référentiels · CSM" };

/**
 * Administration › Référentiels › Gares et districts : le même écran que Réseau › Gares (district, lignes, type ;
 * sélection multiple, « Attribuer à la sélection », « Valider les propositions », export), ouvert depuis le tableau de bord
 * avec ses filtres de contrôle (`?district=aucun`, `?proposition=oui`).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("referentiels:manage");
  return <StationsScreen raw={await searchParams} action="/admin/referentiels/gares" canEdit />;
}
