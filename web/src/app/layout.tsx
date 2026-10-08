import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Saira_Condensed } from "next/font/google";
import { cookies } from "next/headers";
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

export const metadata: Metadata = {
  title: "CSM",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
      className={`${geist.variable} ${geistMono.variable} ${saira.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
