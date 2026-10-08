import type { Metadata } from "next";

import { TaxiOrderView } from "@/components/orders/taxi-order-view";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Bon de commande taxi · CSM" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("generate_taxi:read");
  const { id } = await params;
  return <TaxiOrderView id={id} user={user} />;
}
