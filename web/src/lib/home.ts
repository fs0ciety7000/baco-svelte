// Page d'accueil choisie (demande du 10 oct. 2026) : où l'agent arrive après la connexion. Le tableau de bord reste
// joignable par « Accueil ». Liste fermée (aucune redirection libre).

export const HOME_CHOICES = [
  { href: "/", label: "Tableau de bord" },
  { href: "/pmr", label: "Missions PMR" },
  { href: "/groupes", label: "Groupes" },
  { href: "/operations/journal", label: "Journal" },
  { href: "/operations/journee", label: "Ma journée" },
  { href: "/reseau", label: "Trains en direct" },
  { href: "/commandes/suivi", label: "Commandes" },
  { href: "/ressources", label: "Contacts" },
] as const;

export type HomeHref = (typeof HOME_CHOICES)[number]["href"];

/**
 * Valeurs enregistrées avant la navigation v3 (14 oct. 2026) : `users.preferences.home` garde l'ancien chemin jusqu'au
 * prochain choix de l'agent.
 */
const LEGACY_HOME: Record<string, HomeHref> = {
  "/operations": "/reseau",
  "/referentiels": "/ressources",
  "/commandes": "/commandes/suivi",
};

export function homeOf(preferences: unknown): HomeHref {
  const raw =
    preferences && typeof preferences === "object" && "home" in preferences
      ? (preferences as { home?: unknown }).home
      : undefined;
  const v = typeof raw === "string" ? (LEGACY_HOME[raw] ?? raw) : raw;
  return HOME_CHOICES.find((c) => c.href === v)?.href ?? "/";
}
