import type { MetadataRoute } from "next";

// PWA installable (demande du 10 oct. 2026) : CSM s'ouvre dans sa propre fenêtre, depuis le bureau ou l'écran d'accueil.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CSM · Client Solutions",
    short_name: "CSM",
    description: "Outil métier Client Solutions : commandes, PMR, opérations, annuaire.",
    lang: "fr-BE",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0D0B09",
    theme_color: "#0D0B09",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Missions PMR", url: "/pmr" },
      { name: "Journal", url: "/operations/journal" },
      { name: "Ma journée", url: "/operations/journee" },
      { name: "Nouveau bon de bus", url: "/commandes/nouveau" },
    ],
  };
}
