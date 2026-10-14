import {
  Accessibility,
  Bus,
  CalendarClock,
  Car,
  Database,
  HeartPulse,
  KeyRound,
  Home,
  ListFilter,
  Mail,
  MonitorSmartphone,
  Plus,
  ScrollText,
  ShieldCheck,
  Train,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import { can, isAdmin, type PermissionSubject, type Role } from "@/lib/permissions";

// Navigation : SOURCE UNIQUE pour la barre latérale, la barre d'onglets mobile, « Plus », ⌘K et les onglets
// des modules. 6 modules au maximum (docs/CSM-V2.md §2) ; l'administration (admin / sysop) a sa propre section dans la
// barre latérale depuis le 14 oct. 2026 (pages groupées par `group`), dans « Plus » en mobile et dans ⌘K.

export type NavTab = {
  href: string;
  label: string;
  /** Permission(s) du catalogue exigée(s) (toutes, si plusieurs). */
  permission?: string | string[];
  /**
   * Rôles système pour lesquels l'onglet est masqué (rôles v3, lot L2 : seulement l'Écran sur « Mon profil » ; toute autre
   * exclusion passe par une permission du catalogue).
   */
  hideFor?: Role[];
  keywords?: string[];
  /** Groupe d'affichage (Administration : Comptes, Supervision, Réglages). */
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
  { id: "accueil", href: "/", label: "Accueil", icon: Home, mobile: true, tabs: [] },
  {
    id: "commandes",
    shortLabel: "Bons",
    href: "/commandes",
    label: "Commandes",
    icon: Bus,
    mobile: true,
    tabs: [
      {
        href: "/commandes",
        label: "Bus",
        permission: "otto:read",
        keywords: ["C3", "otto", "bon"],
      },
      { href: "/commandes/taxi", label: "Taxi", permission: "generate_taxi:read" },
      {
        href: "/commandes/suivi",
        label: "Suivi",
        permission: "otto:read",
        keywords: ["kanban", "statut"],
      },
      {
        // Sociétés de bus et de taxi gérées dans CSM (11 oct. 2026 ; la page montre le taxi selon `generate_taxi:read`).
        href: "/commandes/fournisseurs",
        label: "Fournisseurs",
        // L'invité ne voit que les bons (rôles v2) ; il lit les sociétés à travers eux (`suppliers:read`, lot L2).
        permission: ["otto:read", "suppliers:read"],
        keywords: ["sociétés", "transporteurs", "chauffeurs", "taxis", "bus"],
      },
      {
        href: "/commandes/archives",
        label: "Archives",
        permission: "archives:read",
        keywords: ["PDF", "bons terminés", "sauvegarde", "TC_"],
      },
      {
        href: "/commandes/b201",
        label: "Remise B201",
        permission: "b201:read",
        keywords: ["remise", "service"],
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
        label: "Missions PMR",
        permission: "deplacements:read",
        keywords: ["déplacements", "DICOS", "assistance"],
      },
      {
        href: "/groupes",
        label: "Groupes",
        permission: "pmr:read",
        keywords: ["école", "groupe", "DICOS"],
      },
      { href: "/pmr/historique", label: "Historique", permission: "deplacements:read" },
      { href: "/pmr/clients", label: "Clients", permission: "pmr:read" },
      { href: "/pmr/materiel", label: "Rampes et matériel", permission: "pmr:read" },
      {
        href: "/pmr/extension",
        label: "Extension DICOS",
        permission: "deplacements:read",
        keywords: ["connecteur", "zip", "installer", "ATMS", "télécharger"],
      },
    ],
  },
  {
    id: "operations",
    href: "/operations",
    label: "Opérations",
    icon: Train,
    mobile: true,
    tabs: [
      {
        href: "/operations",
        label: "Trains en direct",
        permission: "live:read",
        keywords: ["iRail", "départs", "retards"],
      },
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
      {
        href: "/operations/carte-pn",
        label: "Carte PN",
        permission: "carte_pn:read",
        keywords: ["passages à niveau"],
      },
      { href: "/operations/statistiques", label: "Statistiques", permission: "stats:read" },
    ],
  },
  {
    id: "referentiels",
    shortLabel: "Données",
    href: "/referentiels",
    // « Ressources » depuis le 11 oct. 2026 (ex-« Annuaire et données », demande de l'utilisateur).
    label: "Ressources",
    // Dans « Plus » en mobile depuis le 14 oct. 2026 (barre du bas à 5 entrées : Accueil, Bons, PMR, Opérations, Plus).
    icon: Database,
    tabs: [
      {
        href: "/referentiels",
        label: "Annuaire",
        permission: "repertoire:read",
        keywords: ["répertoire", "sociétés", "taxis", "contacts"],
      },
      { href: "/referentiels/lignes", label: "Lignes", permission: "timetable:read" },
      {
        href: "/referentiels/trains",
        label: "Trains",
        permission: "timetable:read",
        keywords: ["relations", "IC", "séries", "horaires", "arrêts", "passages"],
      },
      {
        href: "/referentiels/gares",
        label: "Gares",
        permission: "timetable:read",
        keywords: ["districts", "gares frontière", "UIC", "arrêts"],
      },
      {
        href: "/referentiels/ptcar",
        label: "PtCar",
        permission: "ptcar:read",
        keywords: ["gares", "abréviations"],
      },
      { href: "/referentiels/ebp", label: "EBP", permission: "ebp:read" },
      {
        href: "/referentiels/documents",
        label: "Procédures et documents",
        permission: "documents:read",
      },
    ],
  },
  {
    id: "equipe",
    href: "/equipe",
    label: "Équipe",
    icon: Users,
    tabs: [
      // Congés : pas pour l'instant (décision du 9 oct. 2026). Planning : horaires publiés dans Quinyx (14 oct. 2026).
      {
        href: "/equipe",
        label: "Annuaire de l'équipe",
        permission: "team:read",
        keywords: ["collègues"],
      },
      {
        href: "/equipe/planning",
        label: "Planning",
        permission: "quinyx:read",
        keywords: ["Quinyx", "horaires", "service", "AM", "PM", "nuit", "qui travaille"],
      },
      {
        href: "/equipe/profil",
        label: "Mon profil",
        keywords: ["mot de passe", "compte"],
        hideFor: ["screen"],
      },
    ],
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

function tabAllowed(user: PermissionSubject, tab: NavTab) {
  if (tab.hideFor?.includes(user.role)) return false;
  const perms = tab.permission === undefined ? [] : [tab.permission].flat();
  return perms.every((p) => can(user, p));
}

/** Modules visibles pour l'agent : un module sans onglet autorisé disparaît. */
export function visibleModules(user: PermissionSubject): NavModule[] {
  return MODULES.map((m) => ({ ...m, tabs: m.tabs.filter((t) => tabAllowed(user, t)) }))
    .filter((m) => m.id === "accueil" || m.tabs.length > 0)
    .map((m) =>
      m.tabs.length > 0 && !m.tabs.some((t) => t.href === m.href)
        ? { ...m, href: m.tabs[0]!.href }
        : m,
    );
}

export function adminModule(user: PermissionSubject): NavModule | null {
  return isAdmin(user) ? ADMIN : null;
}

export function quickActions(user: PermissionSubject): QuickAction[] {
  return QUICK_ACTIONS.filter((a) => can(user, a.permission));
}

/** Module actif pour un chemin (le plus long préfixe). */
export function activeModule(pathname: string, modules: NavModule[]): NavModule | undefined {
  const all = [...modules, ADMIN];
  if (pathname === "/") return all.find((m) => m.id === "accueil");
  return all
    .filter((m) => m.id !== "accueil")
    .find(
      (m) =>
        pathname === m.href ||
        pathname.startsWith(`${m.href}/`) ||
        m.tabs.some((t) => pathname === t.href || pathname.startsWith(`${t.href}/`)),
    );
}

/** Onglet actif : correspondance exacte, sinon le plus long préfixe. */
export function activeTab(pathname: string, module: NavModule): NavTab | undefined {
  const exact = module.tabs.find((t) => t.href === pathname);
  if (exact) return exact;
  return (
    [...module.tabs]
      .filter((t) => t.href !== module.href && pathname.startsWith(`${t.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ??
    module.tabs.find((t) => t.href === module.href)
  );
}
