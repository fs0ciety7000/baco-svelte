import type { Metadata } from "next";

import { LineBoard } from "@/components/admin/line-board";
import { requireAdmin } from "@/server/auth";
import { listLines } from "@/server/data/admin";

export const metadata: Metadata = { title: "Lignes et arrêts · CSM" };

export default async function Page() {
  await requireAdmin();
  return <LineBoard lines={await listLines()} />;
}
