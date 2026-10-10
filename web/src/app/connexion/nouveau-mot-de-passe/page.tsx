import type { Metadata } from "next";
import Link from "next/link";

import { StudioCredit } from "@/components/shell/studio-credit";
import { Card, CardContent } from "@/components/ui/card";

import { NewPasswordForm } from "../reset-forms";

export const metadata: Metadata = { title: "Nouveau mot de passe · CSM", referrer: "no-referrer" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length >= 20 && token.length <= 2000;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-h2 font-semibold text-fg">Nouveau mot de passe</h1>
      <Card>
        <CardContent className="p-5">
          {valid ? (
            <NewPasswordForm token={token} />
          ) : (
            <p className="text-body text-fg">
              Lien incomplet.{" "}
              <Link href="/connexion/mot-de-passe-oublie" className="link">
                Refais une demande
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
      <StudioCredit />
    </main>
  );
}
