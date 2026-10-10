import type { Metadata } from "next";
import Link from "next/link";

import { StudioCredit } from "@/components/shell/studio-credit";
import { Card, CardContent } from "@/components/ui/card";

import { passwordResetEnabled } from "../reset-actions";
import { RequestResetForm } from "../reset-forms";

export const metadata: Metadata = { title: "Mot de passe oublié · CSM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const enabled = await passwordResetEnabled();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-h2 font-semibold text-fg">Mot de passe oublié</h1>
      <Card>
        <CardContent className="p-5">
          {enabled ? (
            <RequestResetForm />
          ) : (
            <div className="flex flex-col gap-3" data-testid="reset-disabled">
              <p className="text-body text-fg">
                La réinitialisation par e-mail n&apos;est pas encore active.
              </p>
              <p className="text-small text-fg-muted">
                Demande à un administrateur un mot de passe provisoire (Administration ›
                Utilisateurs).
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Link href="/connexion" className="link text-body">
        Retour à la connexion
      </Link>
      <StudioCredit />
    </main>
  );
}
