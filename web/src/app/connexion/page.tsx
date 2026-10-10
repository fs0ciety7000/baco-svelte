import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StudioCredit } from "@/components/shell/studio-credit";
import { Card, CardContent } from "@/components/ui/card";
import { PasskeyLoginButton } from "@/components/team/passkeys";
import { getCurrentUser } from "@/server/auth";
import { passkeysEnabled } from "@/server/passkeys";

import { LoginForm } from "./login-form";
import { LoginIntro } from "./login-intro";

// Carte de partage (Teams, WhatsApp…) : sobre, sans détail interne ni URL de service.
const TITLE = "CSM · Connexion";
const DESCRIPTION = "Outil interne. Accès réservé aux agents autorisés.";
const OG_IMAGE = {
  url: "/brand/og-csm.png",
  width: 1200,
  height: 630,
  alt: "CSM, Client Solutions",
  type: "image/png",
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "CSM",
    locale: "fr_BE",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; reinitialise?: string }>;
}) {
  if (await getCurrentUser()) redirect("/");
  const { suite, reinitialise } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <LoginIntro />
      {reinitialise ? (
        <p role="status" className="border border-ok bg-surface px-3 py-2 text-body text-fg">
          Mot de passe modifié : connecte-toi avec le nouveau.
        </p>
      ) : null}
      <Card>
        <CardContent className="p-5">
          <LoginForm next={suite} />
          {passkeysEnabled() ? (
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex items-center gap-3 text-small text-fg-muted" aria-hidden>
                <span className="h-px flex-1 bg-border" /> ou{" "}
                <span className="h-px flex-1 bg-border" />
              </div>
              <PasskeyLoginButton next={suite} />
            </div>
          ) : null}
        </CardContent>
      </Card>
      <p className="text-small text-fg-muted">
        Même identifiant et même mot de passe que BACO.{" "}
        <Link href="/connexion/mot-de-passe-oublie" className="link">
          Mot de passe oublié ?
        </Link>
      </p>
      <StudioCredit />
    </main>
  );
}
