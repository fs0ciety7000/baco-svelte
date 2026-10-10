import type { Metadata, Viewport } from "next";
import {
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Condensed,
  Saira_Condensed,
} from "next/font/google";
import { cookies } from "next/headers";
import { PwaRegister } from "@/components/pwa-register";
import type { ReactNode } from "react";

import { parseUiCookie, UI_COOKIE } from "@/design/preferences";
import { themeById } from "@/design/tokens";

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

export const metadata: Metadata = {
  title: "CSM",
  applicationName: "CSM",
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
  const scheme = ui.theme === "auto" ? undefined : themeById(ui.theme).scheme;
  return (
    <html
      lang="fr"
      data-theme={ui.theme}
      data-scheme={scheme}
      data-density={ui.density}
      className={[geist, geistMono, saira, plex, plexCondensed, plexMono]
        .map((f) => f.variable)
        .join(" ")}
    >
      <body>
        <Providers>{children}</Providers>
        <PwaRegister />
      </body>
    </html>
  );
}
