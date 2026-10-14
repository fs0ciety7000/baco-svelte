import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { passwordResetEnabled } from "@/app/connexion/reset-actions";
import { ImpersonateCard } from "@/components/admin/impersonate-card";
import { UserEditor } from "@/components/admin/user-editor";
import { impersonationRefusal } from "@/lib/impersonation";
import { UserPasskeys } from "@/components/admin/user-passkeys";
import { requireAdmin } from "@/server/auth";
import { TokenList } from "@/components/pmr/extension-connect";
import { assignableRoles } from "@/lib/roles";
import { getUser } from "@/server/data/admin";
import { pbForRequest } from "@/server/data/orders";
import { listRoles } from "@/server/data/roles";
import { listMyConnectorTokens } from "@/server/extension";
import { impersonationEnabled } from "@/server/impersonation";

export const metadata: Metadata = { title: "Compte · Administration · CSM" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await getUser(id).catch(() => null);
  if (!user || user.role === "connector") notFound();
  const pb = await pbForRequest();
  const [tokens, passkeys] = await Promise.all([
    listMyConnectorTokens(user.id),
    pb
      .collection("passkeys")
      .getFullList({
        filter: pb.filter("user = {:u}", { u: user.id }),
        sort: "-created",
        fields: "id,name,created,last_used",
      })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          name: String(r.name ?? "") || "Passkey",
          created: String(r.created ?? ""),
          lastUsed: String(r.last_used ?? ""),
        })),
      )
      .catch(() => []),
  ]);
  return (
    <section className="flex flex-col gap-4" aria-label="Fiche du compte">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 text-small link">
        <ArrowLeft aria-hidden className="size-4" /> Retour aux utilisateurs
      </Link>
      {impersonationEnabled() && !impersonationRefusal(me, user) ? (
        <ImpersonateCard id={user.id} name={user.name || user.username} />
      ) : null}
      <UserEditor
        key={`${user.id}-${user.role}`}
        user={user}
        isSelf={user.id === me.id}
        resetMail={await passwordResetEnabled()}
        roles={assignableRoles(await listRoles())}
        canAssignFull={me.role === "admin"}
      />
      <section
        className="flex flex-col gap-2 rounded-box border border-border bg-surface p-4"
        aria-label="Appareils connectés"
      >
        <TokenList
          tokens={tokens}
          admin
          title="Appareils connectés (extension DICOS)"
          empty="Aucun appareil connecté à ce compte."
        />
      </section>
      <section
        className="flex flex-col gap-2 rounded-box border border-border bg-surface p-4"
        aria-label="Passkeys"
      >
        <UserPasskeys items={passkeys} />
      </section>
    </section>
  );
}
