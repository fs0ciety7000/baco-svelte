import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserEditor } from "@/components/admin/user-editor";
import { UserPasskeys } from "@/components/admin/user-passkeys";
import { requireAdmin } from "@/server/auth";
import { TokenList } from "@/components/pmr/extension-connect";
import { getUser } from "@/server/data/admin";
import { pbForRequest } from "@/server/data/orders";
import { listMyConnectorTokens } from "@/server/extension";

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
      <UserEditor key={`${user.id}-${user.role}`} user={user} isSelf={user.id === me.id} />
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
