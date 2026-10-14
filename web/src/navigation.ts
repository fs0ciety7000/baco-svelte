import {
  Accessibility,
  Bus,
  CalendarClock,
  CalendarDays,
  Database,
  Car,
  HeartPulse,
  KeyRound,
  Home,
  Library,
  ListFilter,
  Mail,
  MonitorSmartphone,
  Plus,
  Puzzle,
  Radio,
  ScrollText,
  ShieldCheck,
  Train,
  UserCog,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { can, isAdmin, type PermissionSubject, type Role } from "@/lib/permissions";

// Navigation : SOURCE UNIQUE pour la barre latérale, la barre d'onglets mobile, « Plus », ⌘K, le menu du compte et les
// onglets des modules. Navigation v3 (14 oct. 2026, docs/design/AUDIT-NAVIGATION.md) : Accueil, Opérations, Commandes,
// PMR, Réseau, Ressources ; l'administration a sa propre section dans la barre latérale (pages groupées par `group`),
// dans « Plus » en mobile et dans ⌘K. Les anciennes routes sont redirigées par `lib/redirects.ts` (next.config.ts).

export type NavTab = {
  href: string;
  label: string;
  /** Permission(s) du catalogue exigée(s) (toutes, si plusieurs). */
  permission?: string | string[];
  /** Au moins une de ces permissions (ex. Suivi : bus OU taxi). */
  anyOf?: string[];
  /**
   * Rôles système pour lesquels l'onglet est masqué (rôles v3, lot L2 : seulement l'Écran sur « Mon profil » ; toute autre
   * exclusion passe par une permission du catalogue).
   */
  hideFor?: Role[];
  keywords?: string[];
  /** Groupe d'affichage (Administration : Comptes, Référentiels, Supervision, Réglages). */
  group?: string;
  icon?: LucideIcon;
};
export type NavModule = {
  id: string;
  href: string;
  label: string;
  /** Libellé court (barre d'onglets mobile). */
  shortLabel?: string;
  icon: LucideIcon;
  /** Présent dans la barre d'onglets mobile (4 au maximum + « Plus », le reste va dans « Plus »). */
  mobile?: boolean;
  tabs: NavTab[];
};

export const MODULES: NavModule[] = [
  {
    id: "accueil",
    href: "/",
    label: "Accueil",
    icon: Home,
    mobile: true,
    tabs: [
      { href: "/", label: "À traiter", keywords: ["tableau de bord", "widgets", "accueil"] },
      // Statistiques : bons bus, taxis et PMR (navigation v3 : sorties d'Opérations, ce n'est pas du temps réel).
      {
        href: "/statistiques",
        label: "Statistiques",
        permission: "stats:read",
        keywords: ["chiffres", "volumes", "graphiques"],
      },
    ],
  },
  {
    id: "operations",
    href: "/operations/journal",
    label: "Opérations",
    icon: Radio,
    mobile: true,
    tabs: [
      // Le Journal ouvre le module et porte la pastille des non-lus (navigation v3).
      {
        href: "/operations/journal",
        label: "Journal",
        permission: "journal:read",
        keywords: ["main courante", "messages", "consignes"],
      },
      {
        href: "/operations/journee",
        label: "Ma journée",
        permission: "journal:read",
        keywords: ["frise", "ligne de temps", "planning du jour", "agenda"],
      },
      {
        href: "/operations/releve",
        label: "Relève",
        permission: "journal:read",
        keywords: ["relève", "passation", "fin de service", "synthèse"],
      },
    ],
  },
  {
    id: "commandes",
    shortLabel: "Bons",
    href: "/commandes/suivi",
    label: "Commandes",
    icon: Bus,
    mobile: true,
    tabs: [
      // Suivi (vue « À envoyer » par défaut) ouvre le module et porte la pastille des bons à envoyer ; ouvert à qui lit
      // les bus OU les taxis (un agent « taxi seul » le voit, navigation v3).
      {
        href: "/commandes/suivi",
        label: "Suivi",
        anyOf: ["otto:read", "generate_taxi:read"],
        keywords: ["kanban", "statut", "à envoyer"],
      },
      {
        href: "/commandes",
        label: "Bus",
        permission: "otto:read",
        keywords: ["C3", "otto", "bon"],
      },
      { href: "/commandes/taxi", label: "Taxi", permission: "generate_taxi:read" },
      {
        href: "/commandes/archives",
        label: "Archives",
        permission: "archives:read",
        keywords: ["PDF", "bons terminés", "sauvegarde", "TC_"],
      },
      {
        // Sociétés de bus et de taxi gérées dans CSM (11 oct. 2026 ; la page montre le taxi selon `generate_taxi:read`).
        href: "/commandes/fournisseurs",
        label: "Fournisseurs",
        // L'invité ne voit que les bons (rôles v2) ; il lit les sociétés à travers eux (`suppliers:read`, lot L2).
        permission: ["otto:read", "suppliers:read"],
        keywords: ["sociétés", "transporteurs", "chauffeurs", "taxis", "bus"],
      },
    ],
  },
  {
    id: "pmr",
    href: "/pmr",
    label: "PMR",
    icon: Accessibility,
    mobile: true,
    tabs: [
      {
        href: "/pmr",
        label: "Missions",
        permission: "deplacements:read",
        keywords: ["missions PMR", "déplacements", "DICOS", "assistance"],
      },
      {
        href: "/groupes",
        label: "Groupes",
        permission: "pmr:read",
        keywords: ["école", "groupe", "DICOS"],
      },
      { href: "/pmr/clients", label: "Clients", permission: "pmr:read" },
      {
        href: "/pmr/materiel",
        label: "Matériel",
        permission: "pmr:read",
        keywords: ["rampes", "matériel PMR", "zones"],
      },
      {
        // Historique BACO archivé de la saisie de la journée (abandonnée le 3 mai 2026), pas l'historique DICOS.
        href: "/pmr/historique",
        label: "Historique",
        permission: "deplacements:read",
        keywords: ["BACO", "archives", "saisie de la journée"],
      },
    ],
  },
  {
    // Réseau (navigation v3) : le temps réel et les référentiels du réseau, en consultation ; la gestion est dans
    // Administration › Référentiels (`referentiels:manage`).
    id: "reseau",
    href: "/reseau",
    label: "Réseau",
    icon: Train,
    tabs: [
      {
        href: "/reseau",
        label: "Trains en direct",
        permission: "live:read",
        keywords: ["iRail", "départs", "arrivées", "retards"],
      },
      {
        href: "/reseau/horaires",
        label: "Horaires",
        permission: "timetable:read",
        keywords: ["trains", "relations", "IC", "séries", "arrêts", "passages"],
      },
      { href: "/reseau/lignes", label: "Lignes", permission: "timetable:read" },
      {
        href: "/reseau/gares",
        label: "Gares",
        permission: "timetable:read",
        keywords: ["districts", "gares frontière", "UIC", "arrêts", "PANG"],
      },
      {
        href: "/reseau/ptcar",
        label: "PtCar",
        permission: "ptcar:read",
        keywords: ["gares", "abréviations"],
      },
      { href: "/reseau/ebp", label: "EBP", permission: "ebp:read" },
      {
        href: "/reseau/pn",
        label: "Carte PN",
        permission: "carte_pn:read",
        keywords: ["passages à niveau", "PN"],
      },
    ],
  },
  {
    // Ressources (navigation v3) : les gens et les documents ; le module Équipe a disparu (14 oct. 2026).
    id: "ressources",
    href: "/ressources",
    label: "Ressources",
    icon: Library,
    tabs: [
      {
        href: "/ressources",
        label: "Contacts",
        permission: "repertoire:read",
        keywords: ["annuaire", "répertoire", "sociétés", "taxis", "téléphone"],
      },
      {
        href: "/ressources/equipe",
        label: "Collègues",
        permission: "team:read",
        keywords: ["équipe", "annuaire de l'équipe", "agents"],
      },
      {
        // Horaires publiés dans Quinyx (14 oct. 2026). Congés : pas pour l'instant (décision du 9 oct. 2026).
        href: "/ressources/planning",
        label: "Planning",
        permission: "quinyx:read",
        keywords: ["Quinyx", "horaires", "service", "AM", "PM", "nuit", "qui travaille"],
      },
      {
        href: "/ressources/documents",
        label: "Procédures et documents",
        permission: "documents:read",
        keywords: ["procédures", "documents", "PDF"],
      },
      {
        href: "/ressources/b201",
        label: "B201",
        permission: "b201:read",
        keywords: ["remise", "remise B201", "service"],
      },
    ],
  },
];

/**
 * Liens du menu du compte (navigation v3) : hors module, aussi proposés dans ⌘K et gardés comme les onglets
 * (`requireRoute`). « Mon planning » mène à l'onglet Ressources › Planning.
 */
export const ACCOUNT_LINKS: (NavTab & { icon: LucideIcon })[] = [
  {
    href: "/profil",
    label: "Mon profil",
    icon: UserRound,
    hideFor: ["screen"],
    keywords: ["mot de passe", "compte", "passkeys", "sessions", "avatar"],
  },
  {
    href: "/ressources/planning",
    label: "Mon planning",
    icon: CalendarDays,
    permission: "quinyx:read",
    keywords: ["Quinyx", "horaires"],
  },
  {
    // Extension de navigateur (DICOS, ATMS, Quinyx) : installation, connexion, dépannage.
    href: "/extension",
    label: "Extension CSM",
    icon: Puzzle,
    anyOf: ["deplacements:read", "quinyx:read"],
    keywords: ["extension DICOS", "connecteur", "zip", "installer", "ATMS", "télécharger"],
  },
];

/**
 * Nouveautés de CSM (CHANGELOG.md + annonces de l'équipe), hors module depuis le 14 oct. 2026 : lien en pied de la
 * barre latérale, dans « Plus » (mobile) et dans ⌘K. Ouverte à tout agent connecté (le rôle « Écran » ne voit que /tv).
 */
export const CHANGELOG_LINK = {
  href: "/changelog",
  label: "Nouveautés",
  keywords: ["changelog", "mise à jour", "version", "annonces"],
} as const;

/**
 * Administration. Les pages sans `permission` sont réservées à admin / sysop ; celles qui portent une permission
 * (Référentiels : `referentiels:manage`) s'ouvrent aussi à un rôle qui l'a reçue.
 */
export const ADMIN: NavModule = {
  id: "admin",
  href: "/admin",
  label: "Administration",
  icon: ShieldCheck,
  tabs: [
    { href: "/admin", label: "Utilisateurs", group: "Comptes", icon: UserCog },
    { href: "/admin/roles", label: "Rôles", group: "Comptes", icon: KeyRound },
    {
      href: "/admin/extension",
      label: "Appareils connectés",
      group: "Comptes",
      icon: MonitorSmartphone,
    },
    {
      // Tableau de bord qualité puis un écran par référentiel du réseau (navigation v3, 14 oct. 2026).
      href: "/admin/referentiels",
      label: "Référentiels",
      group: "Référentiels",
      icon: Database,
      permission: "referentiels:manage",
      keywords: ["gares", "districts", "lignes", "PtCar", "EBP", "SPI", "PN", "imports", "qualité"],
    },
    { href: "/admin/sante", label: "Santé", group: "Supervision", icon: HeartPulse },
    { href: "/admin/audit", label: "Journal d'audit", group: "Supervision", icon: ScrollText },
    { href: "/admin/journal", label: "Tri du Journal", group: "Réglages", icon: ListFilter },
    { href: "/admin/quinyx", label: "Quinyx", group: "Réglages", icon: CalendarClock },
    { href: "/admin/campagnes", label: "Campagnes", group: "Réglages", icon: Mail },
  ],
};

/** Onglets d'un module regroupés par `group`, dans l'ordre d'apparition (Administration). */
export function tabGroups(module: NavModule): { label: string; tabs: NavTab[] }[] {
  const out: { label: string; tabs: NavTab[] }[] = [];
  for (const t of module.tabs) {
    const label = t.group ?? "";
    const g = out.find((x) => x.label === label);
    if (g) g.tabs.push(t);
    else out.push({ label, tabs: [t] });
  }
  return out;
}

export type QuickAction = { href: string; label: string; icon: LucideIcon; permission: string };

export const QUICK_ACTIONS: QuickAction[] = [
  { href: "/commandes/nouveau", label: "Bon de commande bus", icon: Bus, permission: "otto:write" },
  {
    href: "/commandes/taxi/nouveau",
    label: "Bon de commande taxi",
    icon: Car,
    permission: "generate_taxi:write",
  },
  {
    href: "/operations/journal",
    label: "Message au journal",
    icon: Plus,
    permission: "journal:write",
  },
];

export function tabAllowed(user: PermissionSubject, tab: NavTab): boolean {
  if (tab.hideFor?.includes(user.role)) return false;
  const perms = tab.permission === undefined ? [] : [tab.permission].flat();
  if (!perms.every((p) => can(user, p))) return false;
  return !tab.anyOf?.length || tab.anyOf.some((p) => can(user, p));
}

/** Modules visibles pour l'agent : un module sans onglet autorisé disparaît (l'Accueil reste). */
export function visibleModules(user: PermissionSubject): NavModule[] {
  return MODULES.map((m) => ({ ...m, tabs: m.tabs.filter((t) => tabAllowed(user, t)) }))
    .filter((m) => m.id === "accueil" || m.tabs.length > 0)
    .map((m) =>
      m.tabs.length > 0 && !m.tabs.some((t) => t.href === m.href)
        ? { ...m, href: m.tabs[0]!.href }
        : m,
    );
}

/** Liens du menu du compte visibles pour l'agent. */
export function accountLinks(user: PermissionSubject): (NavTab & { icon: LucideIcon })[] {
  return ACCOUNT_LINKS.filter((l) => tabAllowed(user, l));
}

/**
 * Administration visible : tout pour admin / sysop ; pour un autre rôle, seulement les pages qui portent une permission
 * qu'il a (Référentiels) ; `null` s'il n'en a aucune.
 */
export function adminModule(user: PermissionSubject): NavModule | null {
  if (isAdmin(user)) return ADMIN;
  const tabs = ADMIN.tabs.filter((t) => t.permission !== undefined && tabAllowed(user, t));
  return tabs.length ? { ...ADMIN, href: tabs[0]!.href, tabs } : null;
}

export function quickActions(user: PermissionSubject): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => can(user, a.permission));
}

const within = (pathname: string, href: string) =>
  pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

/**
 * Module actif pour un chemin : celui dont un onglet (ou l'adresse) est le plus long préfixe du chemin. L'Accueil ne
 * répond qu'à `/` et à ses onglets (Statistiques).
 */
export function activeModule(pathname: string, modules: NavModule[]): NavModule | undefined {
  const all = [...modules, ADMIN];
  let best: NavModule | undefined;
  let len = -1;
  for (const m of all) {
    for (const href of [m.href, ...m.tabs.map((t) => t.href)]) {
      if (href === "/" ? pathname === "/" : within(pathname, href)) {
        if (href.length > len) {
          best = m;
          len = href.length;
        }
      }
    }
  }
  return best;
}

/** Onglet actif : correspondance exacte, sinon le plus long préfixe. */
export function activeTab(pathname: string, module: NavModule): NavTab | undefined {
  const exact = module.tabs.find((t) => t.href === pathname);
  if (exact) return exact;
  return (
    [...module.tabs]
      .filter((t) => t.href !== module.href && t.href !== "/" && pathname.startsWith(`${t.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    module.tabs.find((t) => t.href === module.href)
  );
}
