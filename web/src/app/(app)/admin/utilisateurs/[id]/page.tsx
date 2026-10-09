import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { UserEditor } from "@/components/admin/user-editor";
import { requireAdmin } from "@/server/auth";
import { getUser } from "@/server/data/admin";

export const metadata: Metadata = { title: "Compte · Administration · CSM" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  const user = await getUser(id).catch(() => null);
  if (!user || user.role === "connector") notFound();
  return (
    <section className="flex flex-col gap-4" aria-label="Fiche du compte">
      <Link href="/admin" className="inline-flex min-h-11 items-center gap-1 text-small link">
        <ArrowLeft aria-hidden className="size-4" /> Retour aux utilisateurs
      </Link>
      <UserEditor key={`${user.id}-${user.role}`} user={user} isSelf={user.id === me.id} />
    </section>
  );
}
