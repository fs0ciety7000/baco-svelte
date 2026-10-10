import type { MetadataRoute } from "next";

// Outil interne derrière connexion : rien à explorer, pas de sitemap. `/robots.txt` est public (middleware.ts).
// Les robots d'aperçu de lien qui respectent robots.txt (X, LinkedIn…) peuvent lire la seule page de connexion et son
// image de partage : la carte s'affiche dans les messageries, la page reste en `noindex` (balise et en-tête).
const PREVIEW_BOTS = [
  "Twitterbot",
  "LinkedInBot",
  "facebookexternalhit",
  "Slackbot-LinkExpanding",
  "Discordbot",
  "TelegramBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: PREVIEW_BOTS,
        allow: ["/$", "/connexion", "/brand/og-csm.png"],
        disallow: "/",
      },
      { userAgent: "*", disallow: "/" },
    ],
  };
}
