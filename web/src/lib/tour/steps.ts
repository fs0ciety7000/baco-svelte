// Visite guidée de CSM (4 nov. 2026, avant le passage de toute l'équipe de BACO à CSM) : chapitres, étapes, filtrage
// par droits et lecture de la préférence `users.preferences.tour`. Logique pure (aucun import de React ni du DOM),
// testée dans `steps.test.ts`. Le moteur est dans `components/tour/`.

import { can, isScreen, type PermissionSubject } from "@/lib/permissions";

/** Version de la visite : l'augmenter la remontre une fois à tous les comptes (nouveau chapitre important). */
export const TOUR_VERSION = 1;

export type ChapterId = "prise-en-main" | "bus" | "pmr";

export type TourStep = {
  id: string;
  title: string;
  /** 1 à 3 phrases courtes, tutoiement. */
  body: string;
  /** Texte propre au mobile (< 768 px), sinon `body`. */
  mobileBody?: string;
  /** Page sur laquelle chercher la cible ; la visite y navigue si l'agent est ailleurs. */
  path?: string;
  /** Sélecteurs CSS essayés dans l'ordre : la première cible visible est mise en lumière. */
  targets: string[];
  /** Permissions exigées (toutes). */
  permission?: string[];
  /** Au moins une de ces permissions. */
  anyOf?: string[];
  /** Étape réservée au desktop ou au mobile. */
  only?: "desktop" | "mobile";
  /** Cible introuvable (liste vide, écran étroit) : carte centrée au lieu de sauter l'étape. */
  fallback?: "center" | "skip";
};

export type TourChapter = {
  id: ChapterId;
  title: string;
  /** Une ligne pour la fenêtre d'accueil. */
  summary: string;
  permission?: string[];
  anyOf?: string[];
  steps: TourStep[];
};

export const CHAPTERS: TourChapter[] = [
  {
    id: "prise-en-main",
    title: "Prise en main",
    summary: "Les modules, la recherche, tes districts du jour, la cloche et le thème.",
    steps: [
      {
        id: "modules",
        title: "Les modules de CSM",
        body: "À gauche, les modules : Temps réel, Journal, Bus et taxis, PMR & Groupes, Réseau, Ressources. Tu ne vois que ceux auxquels tu as accès.",
        mobileBody:
          "En bas, les modules principaux : Temps réel, Journal, Bons, PMR. « Plus » ouvre les autres (Réseau, Ressources…).",
        targets: ['[data-tour="nav"]'],
      },
      {
        id: "temps-reel",
        title: "Temps réel : ce qui t'attend",
        body: "L'accueil rassemble ce qui demande ton attention : bons à envoyer, trains en retard sur tes missions, consignes. Clique « Vu » quand c'est traité.",
        path: "/",
        targets: ['[data-testid="todo-queue"]', '[data-testid="kpi-strip"]'],
        fallback: "center",
      },
      {
        id: "recherche",
        title: "Tout chercher avec Ctrl K",
        body: "Un train, une gare, un bon, un collègue ou une page : tape Ctrl K (⌘K sur Mac) ou clique ici, puis Entrée.",
        mobileBody:
          "La loupe ouvre la recherche : un train, une gare, un bon, un collègue ou une page.",
        targets: ['[data-tour="search"]'],
      },
      {
        id: "districts",
        title: "Tes districts du jour",
        body: "Les districts où tu travailles aujourd'hui : alertes et filtres les suivent. Avec un horaire Quinyx publié, ils sont posés d'office ; tu peux les changer ici.",
        permission: ["journal:read"],
        targets: ['[data-testid="duty-chip"]'],
      },
      {
        id: "cloche",
        title: "La cloche",
        body: "Urgences, mentions et retards des trains de tes missions arrivent ici, triés selon tes districts du jour.",
        targets: ['[data-testid="bell"]'],
      },
      {
        id: "compte",
        title: "Ton compte et le thème",
        body: "Ton profil, l'extension et « Affichage » pour passer en thème Jour ou Nuit. Tu retrouves aussi la visite guidée ici.",
        targets: ['[data-tour="account"]'],
      },
    ],
  },
  {
    id: "bus",
    title: "Bus et taxis",
    summary: "Créer un bon, le terminer, puis « Valider l'envoi » au fournisseur.",
    anyOf: ["otto:read", "generate_taxi:read"],
    steps: [
      {
        id: "suivi",
        title: "Suivi : ce qui reste à envoyer",
        body: "Le module s'ouvre sur le Suivi. La vue « À envoyer » liste les bons terminés qui ne sont pas encore partis chez le fournisseur.",
        path: "/commandes/suivi",
        targets: ['[data-testid="view-a-envoyer"]', '[data-testid="tracking-toolbar"]'],
      },
      {
        id: "nouveau",
        title: "Créer un bon",
        body: "« Nouveau bon » ouvre un bon bus (raccourci N). Pour un taxi, passe par l'onglet Taxi.",
        path: "/commandes",
        permission: ["otto:write"],
        targets: ['[data-shortcut="new"]'],
      },
      {
        id: "brouillon",
        title: "Un brouillon enregistré tout seul",
        body: "Remplis les sections dans l'ordre : chacune passe au vert quand elle est complète. Le bon est enregistré en brouillon dès ta première saisie.",
        path: "/commandes/nouveau",
        permission: ["otto:write"],
        targets: ['[data-testid="order-steps"]', '[data-slot="order-ticket"]'],
        fallback: "center",
      },
      {
        id: "envoi",
        title: "Terminer, puis « Valider l'envoi »",
        body: "Brouillon → Terminé → Envoyé. « Valider l'envoi » ouvre le brouillon Outlook avec le PDF joint : tu n'as plus qu'à l'envoyer.",
        path: "/commandes/nouveau",
        permission: ["otto:write"],
        targets: ['[data-testid="order-action-bar"]'],
        fallback: "center",
      },
    ],
  },
  {
    id: "pmr",
    title: "PMR et Groupes",
    summary: "Les missions DICOS, IN / OUT, le repère « maintenant » et l'export ALEA.",
    permission: ["deplacements:read"],
    steps: [
      {
        id: "dicos",
        title: "Les missions arrivent seules",
        body: "Les missions sont reprises de DICOS automatiquement, plusieurs fois par heure : tu n'as rien à lancer. Ici, l'heure de la dernière synchro.",
        path: "/pmr",
        targets: ['[data-testid="dicos-sync"]', '[data-testid="pmr-toolbar"]'],
        fallback: "center",
      },
      {
        id: "in-out",
        title: "Une ligne par trajet",
        body: "IN = embarquement à la gare de départ, OUT = débarquement à la gare d'arrivée. La gare à assister est surlignée ; « Copier » prépare le texte.",
        path: "/pmr",
        targets: ['[data-testid="assists-scroll"]', '[data-testid="assists-cards"]'],
        fallback: "center",
      },
      {
        id: "maintenant",
        title: "Le repère « maintenant »",
        body: "La ligne « maintenant » sépare ce qui est passé de la suite. « Prochaine » marque la prochaine prise en charge, au départ comme à l'arrivée.",
        path: "/pmr",
        targets: ['[data-testid="now-line"]'],
        fallback: "center",
      },
      {
        id: "alea",
        title: "Export ALEA",
        body: "Prépare les blocs à encoder dans ALEA (train, gare, sens), marqués « Obligatoire » ou « À vérifier ». Coche chaque bloc encodé : l'équipe le voit.",
        path: "/pmr",
        targets: ['[data-tour="alea"]'],
      },
      {
        id: "groupes",
        title: "Les groupes",
        body: "Les groupes (écoles…) ont leur onglet, avec les mêmes filtres et leur propre export ALEA.",
        path: "/pmr",
        permission: ["pmr:read"],
        targets: ['a[href="/groupes"]'],
      },
    ],
  },
];

/** Étape « Plus » ajoutée à la prise en main en mobile (la barre du bas n'a que 4 modules). */
export const MORE_STEP: TourStep = {
  id: "plus",
  title: "« Plus »",
  body: "« Plus » ouvre les autres modules, l'administration si tu y as accès et les Nouveautés.",
  only: "mobile",
  targets: ['[data-tour="more"]'],
};

function allowed(
  user: PermissionSubject,
  rule: { permission?: string[]; anyOf?: string[] },
): boolean {
  if (rule.permission && !rule.permission.every((p) => can(user, p))) return false;
  return !rule.anyOf?.length || rule.anyOf.some((p) => can(user, p));
}

export type PlannedStep = TourStep & { chapter: ChapterId; chapterTitle: string };

/**
 * Étapes de la visite pour cet agent : chapitres demandés (tous si vide), dans l'ordre de `CHAPTERS`, sans les
 * chapitres ni les étapes qu'il n'a pas le droit de voir, ni celles d'un autre format d'écran. Jamais rien pour l'Écran.
 */
export function plannedSteps(
  user: PermissionSubject,
  chapters: readonly ChapterId[] = [],
  { mobile = false }: { mobile?: boolean } = {},
): PlannedStep[] {
  if (isScreen(user) || user.role === "disabled") return [];
  const out: PlannedStep[] = [];
  for (const c of CHAPTERS) {
    if (chapters.length && !chapters.includes(c.id)) continue;
    if (!allowed(user, c)) continue;
    const steps = c.id === "prise-en-main" ? withMoreStep(c.steps) : c.steps;
    for (const s of steps) {
      if (s.only === "mobile" && !mobile) continue;
      if (s.only === "desktop" && mobile) continue;
      if (!allowed(user, s)) continue;
      out.push({
        ...s,
        body: mobile && s.mobileBody ? s.mobileBody : s.body,
        chapter: c.id,
        chapterTitle: c.title,
      });
    }
  }
  return out;
}

function withMoreStep(steps: TourStep[]): TourStep[] {
  const i = steps.findIndex((s) => s.id === "modules");
  return [...steps.slice(0, i + 1), MORE_STEP, ...steps.slice(i + 1)];
}

/** Chapitres proposés dans la fenêtre d'accueil (au moins une étape visible pour cet agent). */
export function availableChapters(
  user: PermissionSubject,
  { mobile = false }: { mobile?: boolean } = {},
): TourChapter[] {
  return CHAPTERS.filter((c) => plannedSteps(user, [c.id], { mobile }).length > 0);
}

export type TourPref = { seen: string; version: number };

/** Lit `preferences.tour` ; null si absent ou mal formé. */
export function readTourPref(preferences: unknown): TourPref | null {
  if (!preferences || typeof preferences !== "object") return null;
  const raw = (preferences as Record<string, unknown>).tour;
  if (!raw || typeof raw !== "object") return null;
  const { seen, version } = raw as Record<string, unknown>;
  if (typeof seen !== "string" || !seen || Number.isNaN(Date.parse(seen))) return null;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return null;
  return { seen, version };
}

/** La visite n'a pas encore été vue dans sa version actuelle. */
export function tourPending(preferences: unknown): boolean {
  const pref = readTourPref(preferences);
  return !pref || pref.version < TOUR_VERSION;
}

/**
 * Lancement automatique à la connexion : compte qui n'a pas vu la visite, jamais pour l'Écran ni pendant « Voir en tant
 * que » (la fermeture écrirait dans les préférences de la cible).
 */
export function shouldAutoStartTour(
  user: PermissionSubject & { preferences?: unknown; impersonatedBy?: unknown },
): boolean {
  if (isScreen(user) || user.role === "disabled" || user.impersonatedBy) return false;
  return tourPending(user.preferences);
}

/** Valeur écrite dans `preferences.tour`. */
export function tourPrefValue(now: Date = new Date()): TourPref {
  return { seen: now.toISOString(), version: TOUR_VERSION };
}
