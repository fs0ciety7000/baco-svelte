import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RoleEditor } from "@/components/admin/roles/role-editor";
import { NON_ASSIGNABLE } from "@/lib/roles";
import { requireAdmin } from "@/server/auth";
import { listRolesAdmin, roleAgents, roleHistory } from "@/server/data/roles";

export const metadata: Metadata = { title: "Rôle · Administration · CSM" };

/** Éditeur d'un rôle (rôles v3, lot L4) : droits par tâche, aperçu, comparaison, historique, suppression. */
export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const me = await requireAdmin();
  const { key } = await params;
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(key)) notFound();
  const roles = await listRolesAdmin();
  const role = roles.find((r) => r.key === key);
  if (!role || role.key === "connector") notFound();
  const [agents, history] = await Promise.all([roleAgents(role.key), roleHistory(role.id)]);
  const others = roles.filter((r) => r.key !== role.key && !NON_ASSIGNABLE.includes(r.key));
  return (
    <RoleEditor
      key={`${role.id}-${role.updated}`}
      role={role}
      others={others}
      agents={agents}
      history={history}
      canAssignFull={me.role === "admin"}
      selfHasRole={me.role === role.key}
    />
  );
}
