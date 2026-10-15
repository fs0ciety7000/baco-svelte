// Planificateur de tâches PMR — types partagés (moteur pur, UI, actions).
// Règles et sources : ../../../../docs/design/REGLES-PLANIFICATEUR-PMR.md ; cadrage : CADRAGE-PLANIFICATEUR-PMR.md.
// Aucune donnée personnelle ici : le dossier DICOS suffit, le nominatif reste dans `pmr_mission` (droit `pmr:read`).

/** Type de tâche. `trajet` = déplacement en voiture (recalculé par `agentTimeline`, jamais compté comme occupation). */
export type PlannerTaskKind = "pmr_in" | "pmr_out" | "technique" | "trajet" | "autre";

/** Destination d'une attribution : agent de gare (Quinyx), guichet B-CS, taxi ou chef de bord du train. */
export type AssigneeKind = "agent" | "bcs" | "taxi" | "cdb";

export type PlannerAssignee = {
  kind: AssigneeKind;
  /** Identifiant de l'agent (`PlannerAgent.id`) quand `kind = "agent"`. */
  agentId?: string;
  /** Libellé libre (gare du guichet B-CS, société de taxi…). */
  label?: string;
};

export type PlannerTaskStatus = "a_attribuer" | "attribuee" | "faite" | "annulee";

/** Origine : mission DICOS acceptée, dossier DICOS en attente, saisie manuelle (format ALEA), modèle de la semaine. */
export type PlannerTaskSource = "dicos" | "dicos_attente" | "manuel" | "modele" | (string & {});

export type PlannerTask = {
  id: string;
  /** Jour de service « AAAA-MM-JJ » (Bruxelles). */
  day: string;
  kind: PlannerTaskKind;
  /** Heure du train à la gare assistée (départ si IN, arrivée si OUT), ISO. Base du calcul de la fenêtre. */
  trainAt?: string;
  /** Début et fin de la tâche (ISO). */
  start: string;
  end: string;
  /** Gare où se fait la tâche (gare assistée pour une PMR). */
  station: string;
  /** Autre gare du trajet (destination d'un IN, origine d'un OUT). */
  otherStation?: string;
  /** N° de train commercial (« 906 », « E2129 ») ; absent pour un taxi ou une tâche sans train. */
  train?: string;
  /** NV, MR, DCO (light) ; CRF, CRE, CRP (fauteuil) ; autre ou absent = light (voir `pmrCategory`). */
  pmrType?: string;
  /** Nombre de voyageurs. */
  pax: number;
  /** Assistance légère (repli quand le type est inconnu). */
  light: boolean;
  /** N° de dossier DICOS « AAAA-MM-JJ-NNNN ». */
  dossier?: string;
  source: PlannerTaskSource;
  /** Statut DICOS brut (« Cancelled », « annulee »…) : une tâche annulée est signalée, jamais supprimée. */
  dicosStatus?: string;
  assignee?: PlannerAssignee;
  status: PlannerTaskStatus;
  /** Lien entre tâches à traiter ensemble : `cx:…` correspondance OUT → IN, `tr:…` plusieurs PMR d'un même train. */
  linkKey?: string;
  /** Gare, heure ou jour changé par DICOS après l'attribution : à revoir (effacé à la réattribution ou à « faite »). */
  dicosChanged?: boolean;
  /** Libellé d'une tâche technique ou libre (« EDF RE1707 M7 »). */
  label?: string;
};

export type PlannerPost = "CPI" | "SPI" | "OPI" | "PA" | "EXTRA";

export type PlannerShift = { start: string; end: string };

export type PlannerAgent = {
  id: string;
  /** Nom affiché (prénom + nom Quinyx) ; jamais un voyageur. */
  name: string;
  post: PlannerPost;
  /** Code de la gare de base (FMS, FTY…), = `PlannerBase.code`. */
  base: string;
  /** Prestations du jour, heures réelles Quinyx (ISO). */
  shifts: PlannerShift[];
};

export type PlannerBase = {
  /** Code PtCar de la gare de base (FMS). */
  code: string;
  /** Nom de la gare de base, tel qu'il figure sur les tâches (« Mons », « Charleroi-Central »). */
  name: string;
  district: string;
  /** Zone SPI (FMS, FTY…). */
  zone?: string;
  /** Matrice voiture, aller simple depuis la base : `minutes` jusqu'à `station`. */
  travel: { station: string; minutes: number }[];
  /** Codes des bases voisines que celle-ci peut couvrir (Mons ↔ Tournai, Liège ↔ Verviers, Libramont ↔ Arlon). */
  covers: string[];
};

export type BcsCounter = {
  station: string;
  /** Ouverture en semaine « HH:MM-HH:MM » ; absente = fermé. */
  weekdayHours?: string;
  /** Ouverture le week-end et les jours fériés ; absente = fermé. */
  weekendHours?: string;
  /** PMR acceptées par heure (3). */
  perHour: number;
  /** PMR light seulement. */
  lightOnly: boolean;
  /** Code de la base de rattachement (prend la relève hors guichet). */
  base: string;
};

/** Fenêtre en minutes autour de l'heure du train T : de T − before à T + after. */
export type WindowSpec = { before: number; after: number };

export type PlannerSettings = {
  windows: {
    light: { in: WindowSpec; out: WindowSpec };
    wheelchair: { in: WindowSpec; out: WindowSpec };
  };
  /** Correspondance (même dossier, OUT puis IN dans la même gare) si l'écart est strictement inférieur (minutes). */
  connectionMaxMinutes: number;
  /** Durée du IN d'une correspondance, à partir de T. */
  connectionIn: { light: number; wheelchair: number };
  /** Ordre de préférence des postes : gare de base / gare secondaire. */
  postPreference: { base: PlannerPost[]; secondary: PlannerPost[] };
  /** Limite B-CS par défaut quand un guichet n'en a pas. */
  bcsPerHour: number;
};

export const DEFAULT_PLANNER_SETTINGS: PlannerSettings = {
  windows: {
    light: { in: { before: 15, after: 5 }, out: { before: 5, after: 15 } },
    wheelchair: { in: { before: 20, after: 10 }, out: { before: 10, after: 20 } },
  },
  connectionMaxMinutes: 30,
  connectionIn: { light: 5, wheelchair: 10 },
  postPreference: {
    base: ["PA", "CPI", "EXTRA", "SPI"],
    secondary: ["OPI", "CPI", "EXTRA", "SPI"],
  },
  bcsPerHour: 3,
};

/** Contexte des contrôles et de l'attribution. `tasks` = toutes les tâches connues du jour (attributions comprises). */
export type PlannerContext = {
  tasks: PlannerTask[];
  agents: PlannerAgent[];
  bases: PlannerBase[];
  bcs: BcsCounter[];
  settings?: PlannerSettings;
};

export type CheckLevel = "ok" | "warn" | "block";
export type CheckResult = { level: CheckLevel; reasons: string[] };
