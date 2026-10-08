import type { Metadata } from "next";

import { ChangelogBoard } from "@/components/team/changelog-board";
import { isAdmin } from "@/lib/permissions";
import { requireRoute } from "@/server/auth";
import { listChangelog } from "@/server/data/team";

export const metadata: Metadata = { title: "Nouveautés · CSM" };

export default async function Page() {
  const user = await requireRoute("/equipe/nouveautes");
  const { items } = await listChangelog(1);
  return <ChangelogBoard items={items} canEdit={isAdmin(user) || user.role === "moderator"} />;
}
