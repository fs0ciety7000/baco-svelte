import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserEditor } from "@/components/admin/user-editor";
import { requireAdmin } from "@/server/auth";
import { TokenList } from "@/components/pmr/extension-connect";
import { getUser } from "@/server/data/admin";
import { listMyConnectorTokens } from "@/server/extension";

export const metadata: Metadata = { title: "Compte · Administration · CSM" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await getUser(id).catch(() => null);
  if (!user || user.role === "connector") notFound();
  const tokens = await listMyConnectorTokens(user.id);
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
    </section>
  );
}
