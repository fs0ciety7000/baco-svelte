// Page d'accueil choisie (demande du 10 oct. 2026) : où l'agent arrive après la connexion. Le tableau de bord reste
// joignable par « Accueil ». Liste fermée (aucune redirection libre).

export const HOME_CHOICES = [
  { href: "/", label: "Tableau de bord" },
  { href: "/pmr", label: "Missions PMR" },
  { href: "/groupes", label: "Groupes" },
  { href: "/operations/journal", label: "Journal" },
  { href: "/operations/journee", label: "Ma journée" },
  { href: "/operations", label: "Trains en direct" },
  { href: "/commandes", label: "Commandes" },
  { href: "/referentiels", label: "Annuaire" },
] as const;

export type HomeHref = (typeof HOME_CHOICES)[number]["href"];

export function homeOf(preferences: unknown): HomeHref {
  const v =
    preferences && typeof preferences === "object" && "home" in preferences
      ? (preferences as { home?: unknown }).home
      : undefined;
  return HOME_CHOICES.find((c) => c.href === v)?.href ?? "/";
}
