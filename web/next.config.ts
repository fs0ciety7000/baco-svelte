import path from "node:path";
import type { NextConfig } from "next";

// En-têtes de sécurité communs (la CSP avec nonce arrive avec le shell, étape 3).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Outil interne derrière connexion : jamais indexé (fichiers statiques compris).
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Le middleware tronque à 10 Mo par défaut le corps des requêtes : documents jusqu'à 30 Mo (route d'envoi).
  experimental: { middlewareClientMaxBodySize: "31mb" },
  // Racine de traçage = ce dossier (évite que Next remonte au package-lock.json du dépôt parent).
  outputFileTracingRoot: path.join(__dirname),
  // Paquets du Connecteur DICOS lus à l'exécution (page PMR › Extension DICOS et route de téléchargement).
  outputFileTracingIncludes: {
    "/api/pmr/extension/[file]": ["./downloads/dicos-connector/**"],
    "/pmr/extension": ["./downloads/dicos-connector/**"],
  },
  async headers() {
    return [
      // Fichiers de la bibliothèque : affichables dans la visionneuse de CSM (cadre même origine) ; la route pose
      // elle-même `X-Frame-Options: SAMEORIGIN` et `frame-ancestors 'self'`.
      {
        source: "/:path((?!api/referentiels/documents/[a-z0-9]{15}$).*)",
        headers: securityHeaders,
      },
      {
        source: "/api/referentiels/documents/:id([a-z0-9]{15})",
        headers: securityHeaders.filter((h) => h.key !== "X-Frame-Options"),
      },
    ];
  },
};

export default nextConfig;
