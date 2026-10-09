import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth";

import { LoginForm } from "./login-form";
import { LoginIntro } from "./login-intro";

export const metadata: Metadata = { title: "Connexion · CSM" };

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { suite } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <LoginIntro />
      <Card>
        <CardContent className="p-5">
          <LoginForm next={suite} />
        </CardContent>
      </Card>
      <p className="text-small text-fg-muted">
        Même identifiant et même mot de passe que BACO. Problème de connexion : contacte un
        administrateur.
      </p>
    </main>
  );
}
