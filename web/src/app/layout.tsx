import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Condensed,
  Inter_Tight,
  JetBrains_Mono,
  Saira_Condensed,
} from "next/font/google";
import { cookies } from "next/headers";
import { PwaRegister } from "@/components/pwa-register";
import { ActingBanner } from "@/components/shell/acting-banner";
import type { ReactNode } from "react";

import { parseUiCookie, UI_COOKIE } from "@/design/preferences";
import { choiceScheme } from "@/design/tokens";
import { roleLabel } from "@/lib/roles";
import { env } from "@/server/env";
import { resolveActing } from "@/server/session";

import { Providers } from "./providers";
import "./globals.css";

// Polices auto-hébergées par next/font (téléchargées au build, servies par le domaine CSM).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
const saira = Saira_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-saira",
  display: "swap",
});

// IBM Plex : thèmes Rail et Forêt seulement → pas de préchargement (téléchargée à la demande).
const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
  display: "swap",
  preload: false,
});
const plexCondensed = IBM_Plex_Sans_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-plex-condensed",
  display: "swap",
  preload: false,
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
});

// Inter Tight + JetBrains Mono : direction « Cabine » seulement (v4, 15 oct. 2026) → pas de préchargement non plus.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter-tight",
  display: "swap",
  preload: false,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
});

// Base des URL absolues (image de partage) : l'URL publique de l'instance, jamais déduite des en-têtes.
function siteUrl(): URL {
  try {
    return new URL(env.CSM_PUBLIC_URL || "https://csm.fs0ciety.org");
  } catch {
    return new URL("https://csm.fs0ciety.org");
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "CSM",
  applicationName: "CSM",
  // Outil interne : jamais indexé (même consigne en en-tête X-Robots-Tag et dans robots.txt).
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "CSM", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0D0B09",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const ui = parseUiCookie((await cookies()).get(UI_COOKIE)?.value);
  const scheme = choiceScheme(ui.theme);
  // « Voir en tant que » : bandeau fixe sur toutes les pages (shell, /tv, maintenance…), y compris mode expiré.
  const acting = await resolveActing();
  const showActing = !!acting.actor || acting.stale;
  return (
    <html
      lang="fr"
      data-theme={ui.theme}
      data-scheme={scheme}
      data-density={ui.density}
      data-acting={showActing ? "" : undefined}
      className={[geist, geistMono, saira, plex, plexCondensed, plexMono, interTight, jetbrainsMono]
        .map((f) => f.variable)
        .join(" ")}
    >
      <body>
        {showActing ? (
          <ActingBanner
            name={acting.target?.name ?? ""}
            role={acting.target ? roleLabel(acting.target.role) : ""}
            stale={!acting.actor}
            expiresAt={acting.exp ? acting.exp * 1000 : null}
          />
        ) : null}
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
