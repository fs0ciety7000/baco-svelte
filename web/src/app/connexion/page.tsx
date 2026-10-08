import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/server/auth";

import { LoginForm } from "./login-form";

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
      <header className="flex flex-col gap-2">
        <p className="label-mono flex items-center gap-2 text-fg-muted">
          <span aria-hidden className="size-2 bg-accent" /> SNCB · Client Solutions
        </p>
        <h1 className="display text-h1">CSM</h1>
        <p className="text-body text-fg-muted">Client Solutions Management Tool</p>
      </header>
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
