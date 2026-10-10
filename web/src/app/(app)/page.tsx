import { plainText } from "@/lib/ops/chat-markdown";
import type { Metadata } from "next";

import { normalizeLayout } from "@/design/dashboard-layout";
import { requireUser } from "@/server/auth";
import { dashboardStats } from "@/server/data/dashboard";
import { impactedMissions, todayPmr } from "@/server/data/impacts";
import { favoritesOf, latestLog, listNotifications, listPinned } from "@/server/data/ops";
import { brusselsTime, pbDate } from "@/lib/orders/time";
import { can } from "@/lib/permissions";

import { Dashboard } from "./dashboard";

export const metadata: Metadata = { title: "Accueil · CSM" };

export default async function AccueilPage() {
  const user = await requireUser();
  const prefs = (user.preferences ?? {}) as { dashboard?: unknown };
  const [stats, pinned, latest, impacts, today, notifs] = await Promise.all([
    can(user, "otto:read") ? dashboardStats() : null,
    can(user, "journal:read") ? listPinned().catch(() => []) : null,
    can(user, "journal:read") ? latestLog(5).catch(() => []) : null,
    impactedMissions(user).catch(() => []),
    todayPmr(user).catch(() => null),
    listNotifications(20).catch(() => null),
  ]);
  // Widget main courante : épinglées puis dernières entrées (5 au total).
  const log =
    pinned && latest
      ? [...pinned, ...latest.filter((e) => !pinned.some((p) => p.id === e.id))]
          .slice(0, 5)
          .map((e) => ({
            id: e.id,
            time: (() => {
              const d = pbDate(e.occurredAt);
              return d ? brusselsTime(d) : "--:--";
            })(),
            category: e.category,
            urgent: e.urgent,
            pinned: pinned.some((p) => p.id === e.id),
            body: plainText(e.body).slice(0, 160),
            author: e.authorName,
          }))
      : null;
  const firstName = (user.name || user.email).split(/[\s@]/)[0] ?? "";
  return (
    <Dashboard
      firstName={firstName}
      stats={stats}
      ops={{
        log,
        favorites: can(user, "live:read") ? favoritesOf(user.preferences) : null,
        impacts,
        today,
        mentions: notifs ? notifs.items : null,
      }}
      initialLayout={normalizeLayout(prefs.dashboard)}
    />
  );
}
