import type { Metadata } from "next";

import { BusOrderView } from "@/components/orders/bus-order-view";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "Bon de commande bus · CSM" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("otto:read");
  const { id } = await params;
  return <BusOrderView id={id} user={user} />;
}
