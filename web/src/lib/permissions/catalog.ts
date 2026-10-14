// Catalogue des permissions v3 (lot L0, 14 oct. 2026) : SOURCE UNIQUE des clés, de leurs libellés et des rôles qui
// les portent par défaut. Voir docs/design/CADRAGE-ROLES-V3.md.
//
// - Une clé n'a d'effet que si le code ou les règles PocketBase la testent : seul le développement en ajoute.
// - `roles` = rôles qui la reçoivent par défaut (admin et sysop ont TOUT, écran / désactivé / connecteur RIEN : voir
//   FULL_ROLES et NO_MODULE_ROLES). Les rôles par défaut restent en code jusqu'au lot L3 (collection `roles`).
// - `requires` = clés sans lesquelles celle-ci est retirée du calcul (on ne modifie pas ce qu'on ne voit pas).
// - `legacy` = clés v2 dont elle hérite (un `grants` / `denies` v2 vaut pour elle) ; vide tant qu'aucune clé n'est éclatée.
// - `v2` = clé déjà présente avant la v3 (`PERMISSION_MODULES` ou lectures BACO) ; `hidden` = jamais proposée dans
//   l'interface (lectures historiques de BACO, encore citées par quelques écrans).
//
// Ce fichier est lu par Node sans compilation (`npm run catalog` : --experimental-strip-types) : aucune importation,
// aucune syntaxe TypeScript non effaçable (enum, namespace…). Copie générée pour les hooks PocketBase :
// `pocketbase/pb_hooks/lib/catalog.js` (test `catalog.test.ts` : échoue si la copie est périmée).

export type PermLevel = "normal" | "sensible";

export type CatalogRole = "moderator" | "paco" | "guest";

export type CatalogEntry = {
  key: string;
  /** Tâche métier (regroupement de l'éditeur de rôles). */
  task: string;
  /** Libellé court. */
  label: string;
  /** Phrase « Peut… » de l'aperçu. */
  sentence: string;
  level: PermLevel;
  requires: string[];
  legacy: string[];
  /** Rôles qui la portent par défaut (hors admin / sysop qui ont tout). */
  roles: CatalogRole[];
  v2: boolean;
  hidden?: boolean;
};

// Regroupement de l'éditeur de rôles = menus de la navigation v3 (14 oct. 2026). Les identifiants de tâche ne changent
// pas (ils sont seulement des étiquettes) ; seuls l'ordre, le groupe et le libellé suivent les menus.
export const TASKS: { id: string; group: string; label: string }[] = [
  { id: "operations.stats", group: "Accueil", label: "Statistiques" },
  { id: "operations.journal", group: "Opérations", label: "Journal, Ma journée, Relève" },
  { id: "commandes.bus", group: "Commandes", label: "Bons bus" },
  { id: "commandes.fournisseurs", group: "Commandes", label: "Fournisseurs" },
  { id: "commandes.taxi", group: "Commandes", label: "Taxis" },
  { id: "commandes.archives", group: "Commandes", label: "Archives des bons (PDF)" },
  { id: "pmr.missions", group: "PMR", label: "Missions PMR et groupes" },
  { id: "pmr.nominatif", group: "PMR", label: "Clients, matériel et données nominatives" },
  { id: "operations.trains", group: "Réseau", label: "Trains en direct" },
  { id: "ressources.trains", group: "Réseau", label: "Horaires, gares et lignes" },
  { id: "ressources.ptcar", group: "Réseau", label: "PtCar" },
  { id: "ressources.ebp", group: "Réseau", label: "EBP" },
  { id: "ressources.lignes", group: "Réseau", label: "Points SPI" },
  { id: "operations.pn", group: "Réseau", label: "Carte PN" },
  { id: "reseau.referentiels", group: "Réseau", label: "Gestion des référentiels" },
  { id: "ressources.annuaire", group: "Ressources", label: "Contacts" },
  { id: "equipe", group: "Ressources", label: "Collègues, planning et présence" },
  { id: "ressources.documents", group: "Ressources", label: "Procédures et documents" },
  { id: "commandes.b201", group: "Ressources", label: "B201" },
  { id: "nouveautes", group: "Nouveautés", label: "Nouveautés" },
  { id: "baco", group: "Historique", label: "Lectures héritées de BACO" },
];

/**
 * Clés v2 sans effet depuis le 14 oct. 2026 : gares, lignes, PtCar, EBP et points SPI ne se modifient plus qu'avec
 * `referentiels:manage` (règles PocketBase `1760004700`). Gardées au catalogue (rôles par défaut v2 inchangés, grants /
 * denies existants valides), jamais proposées dans l'interface.
 */
const RETIRED = new Set([
  "ptcar:write",
  "ptcar:update",
  "ptcar:delete",
  "ebp:write",
  "ebp:update",
  "ebp:delete",
  "lignes:write",
  "lignes:update",
  "lignes:delete",
]);

/** Rôles qui ont toutes les permissions. */
export const FULL_ROLES = ["admin", "sysop"];

/** Rôles sans aucune permission de module, même accordée (règles et comportements propres). */
export const NO_MODULE_ROLES = ["screen", "disabled", "connector"];

const PM: CatalogRole[] = ["paco", "moderator"];
const MOD: CatalogRole[] = ["moderator"];

type Spec = [key: string, label: string, sentence: string, roles: CatalogRole[], level?: PermLevel];

/** Module v2 en quatre actions au plus : lecture, création, modification, suppression (dépendent de la lecture). */
function module(
  name: string,
  task: string,
  specs: Spec[],
  opts: { readless?: boolean } = {},
): CatalogEntry[] {
  return specs.map(([key, label, sentence, roles, level]) => {
    const full = `${name}:${key}`;
    const requires = !opts.readless && key !== "read" ? [`${name}:read`] : [];
    return {
      key: full,
      task,
      label,
      sentence,
      level: level ?? (key === "delete" ? "sensible" : "normal"),
      requires,
      legacy: [],
      roles,
      v2: true,
    };
  });
}

function extra(
  key: string,
  task: string,
  label: string,
  sentence: string,
  roles: CatalogRole[],
  requires: string[] = [],
  level: PermLevel = "normal",
): CatalogEntry {
  return { key, task, label, sentence, level, requires, legacy: [], roles, v2: false };
}

function baco(key: string, label: string): CatalogEntry {
  return {
    key,
    task: "baco",
    label: `Lecture BACO : ${label}`,
    sentence: `Lecture historique de BACO (${label})`,
    level: "normal",
    requires: [],
    legacy: [],
    roles: PM,
    v2: true,
    hidden: true,
  };
}

const ENTRIES: CatalogEntry[] = [
  // ---- Commandes
  ...module("otto", "commandes.bus", [
    [
      "read",
      "Voir les bons bus",
      "Peut voir les bons bus, les fournisseurs bus et les modèles",
      [...PM, "guest"],
    ],
    [
      "write",
      "Créer un bon bus",
      "Peut créer un bon bus, une société, un chauffeur ou un modèle",
      PM,
    ],
    [
      "update",
      "Modifier un bon bus",
      "Peut compléter et modifier les bons bus et les fournisseurs bus",
      PM,
    ],
    [
      "delete",
      "Supprimer un bon bus",
      "Peut supprimer un bon bus, un fournisseur ou un modèle",
      MOD,
    ],
  ]),
  extra(
    "bus:reopen",
    "commandes.bus",
    "Rouvrir un bon bus",
    "Peut rouvrir un bon bus envoyé et rétablir un bon bus annulé",
    PM,
    ["otto:update"],
  ),
  extra(
    "suppliers:read",
    "commandes.fournisseurs",
    "Voir les fournisseurs",
    "Peut ouvrir l'onglet Fournisseurs (sociétés de bus et de taxi, chauffeurs, contacts)",
    PM,
  ),
  ...module("generate_taxi", "commandes.taxi", [
    ["read", "Voir les taxis", "Peut voir les bons taxi et les sociétés de taxi", [...PM, "guest"]],
    ["write", "Créer un bon taxi", "Peut créer un bon taxi ou une société de taxi", PM],
    ["update", "Modifier un bon taxi", "Peut compléter et modifier les bons taxi", PM],
    ["delete", "Supprimer un bon taxi", "Peut supprimer un bon taxi ou une société de taxi", MOD],
  ]),
  extra(
    "taxi:reopen",
    "commandes.taxi",
    "Rouvrir un bon taxi",
    "Peut rouvrir un bon taxi envoyé et rétablir un bon taxi annulé",
    PM,
    ["generate_taxi:update"],
  ),
  ...module("b201", "commandes.b201", [
    ["read", "Voir la B201", "Peut voir la remise B201", PM],
    ["write", "Rédiger la B201", "Peut rédiger la remise B201 du jour", PM],
    ["update", "Modifier la B201", "Peut modifier une remise B201", PM],
    ["delete", "Supprimer une B201", "Peut supprimer une remise B201", MOD],
  ]),
  ...module("archives", "commandes.archives", [
    ["read", "Voir les archives", "Peut voir et télécharger les PDF archivés des bons", PM],
    ["delete", "Supprimer une archive", "Peut supprimer un PDF archivé", MOD],
  ]),
  // ---- PMR
  ...module("deplacements", "pmr.missions", [
    [
      "read",
      "Voir les missions",
      "Peut voir les missions PMR (sans nom), l'export ALEA et la synchro DICOS",
      PM,
    ],
    [
      "write",
      "Encoder et synchroniser",
      "Peut cocher « encodé » dans l'ALEA et connecter l'extension DICOS",
      PM,
    ],
    ["update", "Modifier une mission", "Peut modifier une mission PMR", PM],
    ["delete", "Supprimer une mission", "Peut supprimer une mission PMR", MOD],
  ]),
  ...module("pmr", "pmr.nominatif", [
    [
      "read",
      "Voir les noms et coordonnées",
      "Peut voir les noms et coordonnées des voyageurs, les groupes, les clients et le matériel",
      PM,
      "sensible",
    ],
    [
      "write",
      "Créer une fiche PMR",
      "Peut créer une fiche client, du matériel ou une zone PMR",
      PM,
    ],
    [
      "update",
      "Modifier les fiches PMR",
      "Peut modifier les fiches clients et changer l'état du matériel",
      PM,
    ],
    ["delete", "Supprimer une fiche PMR", "Peut supprimer une fiche client ou du matériel", MOD],
  ]),
  extra(
    "pmr_equipment:manage",
    "pmr.nominatif",
    "Gérer le matériel et les zones",
    "Peut créer et modifier entièrement le matériel PMR et les zones",
    PM,
    ["pmr:update"],
  ),
  extra(
    "pmr_zones:read",
    "pmr.nominatif",
    "Voir les zones PMR",
    "Peut voir les zones PMR et leurs dépôts",
    PM,
  ),
  // ---- Opérations
  ...module("live", "operations.trains", [
    [
      "read",
      "Voir les trains en direct",
      "Peut voir les départs, arrivées et retards en direct",
      PM,
    ],
  ]),
  ...module("journal", "operations.journal", [
    ["read", "Lire le Journal", "Peut lire le Journal, la relève et « Ma journée »", PM],
    ["write", "Écrire au Journal", "Peut publier un message au Journal", PM],
    ["update", "Modifier ses messages", "Peut modifier ou retirer ses propres messages", PM],
    ["delete", "Supprimer un message", "Peut supprimer définitivement un message du Journal", MOD],
  ]),
  extra(
    "journal:moderate",
    "operations.journal",
    "Modérer le Journal",
    "Peut voir, retirer et rétablir les messages des autres agents",
    MOD,
    ["journal:read"],
    "sensible",
  ),
  ...module("carte_pn", "operations.pn", [
    ["read", "Voir la carte PN", "Peut voir la carte des passages à niveau", PM],
    ["write", "Ajouter un PN", "Peut ajouter un passage à niveau", PM],
    ["update", "Modifier un PN", "Peut modifier un passage à niveau", PM],
    ["delete", "Supprimer un PN", "Peut supprimer un passage à niveau", MOD],
  ]),
  ...module("stats", "operations.stats", [
    ["read", "Voir les statistiques", "Peut voir les statistiques", PM],
  ]),
  // ---- Ressources
  ...module("repertoire", "ressources.annuaire", [
    ["read", "Voir l'annuaire", "Peut voir l'annuaire des contacts", PM],
    ["write", "Ajouter un contact", "Peut ajouter un contact à l'annuaire", PM],
    ["update", "Modifier un contact", "Peut modifier un contact de l'annuaire", PM],
    ["delete", "Supprimer un contact", "Peut supprimer un contact de l'annuaire", MOD],
  ]),
  ...module("documents", "ressources.documents", [
    ["read", "Voir les procédures", "Peut voir les procédures et les documents", PM],
    ["write", "Ajouter une procédure", "Peut ajouter une procédure ou envoyer un document", PM],
    ["update", "Modifier une procédure", "Peut modifier une procédure ou un document", PM],
    ["delete", "Supprimer une procédure", "Peut supprimer une procédure ou un document", MOD],
  ]),
  ...module("ptcar", "ressources.ptcar", [
    ["read", "Voir les PtCar", "Peut voir les abréviations PtCar", PM],
    ["write", "Ajouter un PtCar", "Peut ajouter une abréviation PtCar", PM],
    [
      "update",
      "Modifier un PtCar (ancien droit)",
      "Peut modifier une abréviation PtCar (sans effet : voir « Modifier les référentiels du réseau »)",
      PM,
    ],
    ["delete", "Supprimer un PtCar", "Peut supprimer une abréviation PtCar", MOD],
  ]),
  ...module("ebp", "ressources.ebp", [
    ["read", "Voir les EBP", "Peut voir les correspondances EBP", PM],
    ["write", "Ajouter une EBP", "Peut ajouter une correspondance EBP", PM],
    ["update", "Modifier une EBP", "Peut modifier une correspondance EBP", PM],
    ["delete", "Supprimer une EBP", "Peut supprimer une correspondance EBP", MOD],
  ]),
  ...module(
    "lignes",
    "ressources.lignes",
    [
      [
        "write",
        "Ajouter des arrêts",
        "Peut ajouter des arrêts (lignes BACO) et des points SPI",
        PM,
      ],
      [
        "update",
        "Modifier des arrêts",
        "Peut modifier les arrêts (lignes BACO) et les points SPI",
        PM,
      ],
      [
        "delete",
        "Retirer des arrêts",
        "Peut retirer des arrêts (lignes BACO) et des points SPI",
        MOD,
      ],
    ],
    { readless: true },
  ),
  extra(
    "spi:read",
    "ressources.lignes",
    "Voir les points SPI",
    "Peut voir les points SPI des lignes",
    PM,
  ),
  extra(
    "timetable:read",
    "ressources.trains",
    "Voir les trains, gares et lignes",
    "Peut voir le référentiel des trains, des gares et des lignes",
    PM,
  ),
  // Navigation v3 (14 oct. 2026, décision de l'utilisateur) : gares (district, lignes, type), lignes, PtCar, EBP et points
  // SPI en lecture seule pour les PACO/RCCA et les modérateurs ; modifiables par admin / sysop (qui ont tout) ou par un
  // rôle personnalisé qui reçoit cette clé. Ouvre Administration › Référentiels. Carte PN : droits `carte_pn:*` inchangés.
  extra(
    "referentiels:manage",
    "reseau.referentiels",
    "Modifier les référentiels du réseau",
    "Peut modifier les référentiels du réseau : gares, lignes, PtCar, EBP, points SPI",
    [],
    [],
    "sensible",
  ),
  // ---- Équipe
  extra(
    "team:read",
    "equipe",
    "Voir l'annuaire de l'équipe",
    "Peut voir l'annuaire des agents CSM",
    PM,
  ),
  extra(
    "quinyx:read",
    "equipe",
    "Voir le planning",
    "Peut voir le planning Quinyx de l'équipe",
    PM,
  ),
  extra(
    "presence:read",
    "equipe",
    "Voir qui est en ligne",
    "Peut voir les agents connectés en ce moment",
    PM,
  ),
  // ---- Nouveautés
  extra(
    "changelog:read",
    "nouveautes",
    "Lire les annonces",
    "Peut lire les annonces de l'équipe dans les Nouveautés",
    PM,
  ),
  extra(
    "changelog:write",
    "nouveautes",
    "Publier une annonce",
    "Peut publier, modifier et retirer une annonce de l'équipe",
    MOD,
    ["changelog:read"],
  ),
  // ---- Lectures historiques de BACO (jamais proposées dans l'interface)
  baco("planning:read", "planning"),
  baco("bus:read", "bus"),
  baco("taxi:read", "taxi"),
  baco("ops:read", "opérationnel"),
  baco("lignes:read", "lignes"),
];

export const CATALOG: CatalogEntry[] = ENTRIES.map((e) =>
  RETIRED.has(e.key) ? { ...e, hidden: true } : e,
);

export const CATALOG_KEYS: string[] = CATALOG.map((e) => e.key);

/** Permissions par défaut d'un rôle (admin / sysop : tout ; écran, désactivé, connecteur : rien). */
export function roleDefaults(role: string): string[] {
  if (FULL_ROLES.includes(role)) return [...CATALOG_KEYS];
  if (NO_MODULE_ROLES.includes(role)) return [];
  return CATALOG.filter((e) => (e.roles as string[]).includes(role)).map((e) => e.key);
}
