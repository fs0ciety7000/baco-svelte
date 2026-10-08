import type { Metadata } from "next";

import { normalizeLayout } from "@/design/dashboard-layout";
import { requireUser } from "@/server/auth";
import { dashboardStats } from "@/server/data/dashboard";
import { can } from "@/lib/permissions";

import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Accueil · CSM" };

export default async function AccueilPage() {
  const user = await requireUser();
  const prefs = (user.preferences ?? {}) as { dashboard?: unknown };
  const stats = can(user, "otto:read") ? await dashboardStats() : null;
  const firstName = (user.name || user.email).split(/[\s@]/)[0] ?? "";
  return (
    <Dashboard
      firstName={firstName}
      stats={stats}
      initialLayout={normalizeLayout(prefs.dashboard)}
    />
  );
}
