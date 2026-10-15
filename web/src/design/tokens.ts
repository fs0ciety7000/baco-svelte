// Source unique des jetons des thèmes CSM (docs/DESIGN-DIRECTION.md, catalogue validé le 9 oct. 2026 :
// docs/design/AUDIT-INTERFACE.md ; refonte v4 « Signal / Quai / Cabine » du 15 oct. 2026 :
// docs/design/REFONTE-DESIGN-V4.md). Chaque thème porte ses couleurs, sa forme (angle chanfreiné, doux, pilule, net),
// sa typographie et sa profondeur (ombres). `npm run tokens` régénère src/app/themes.css ; un test vérifie la
// synchronisation, le contraste AA et l'écart de teinte entre l'accent et les statuts.

export const COLOR_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "surface-3",
  "border",
  "border-strong",
  "fg",
  "fg-muted",
  "fg-subtle",
  "accent",
  "accent-fg",
  "ok",
  "warn",
  "danger",
  "info",
  "progress",
] as const;

/** Modules qui ont leur couleur propre dans les thèmes « taxonomie » (Craie) ; ailleurs, l'accent. */
export const MODULE_IDS = [
  "commandes",
  "pmr",
  "operations",
  "reseau",
  "ressources",
  "admin",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Scheme = "dark" | "light";
export type Shape = "angle" | "soft" | "pill" | "net" | "quai" | "cabine";
export type TypeSet = "saira" | "geist" | "plex" | "pro" | "quai" | "cabine";
/** « reference » : thèmes mis en avant (directions Signal, Quai, Cabine + Contraste élevé) ; « other » : « Autres thèmes ». */
export type ThemeGroup = "reference" | "other";
/** Directions de la refonte v4 (15 oct. 2026) : chacune a un thème Jour, un thème Nuit et un choix « Automatique ». */
export type DirectionId = "signal" | "quai" | "cabine";

/**
 * Détails de composants propres à une direction, portés par des variables CSS (aucun style ad hoc dans les pages) :
 * en-têtes de tableau, trait sous les titres de carte, filet au-dessus de la bande de compteurs, puce choisie,
 * hauteurs de ligne / contrôle / champ (Cabine : compacte en desktop ; le tactile garde 44 px).
 */
export type ThemeStyle = {
  thBg?: string;
  thFg?: string;
  thWeight?: string;
  thRule?: string;
  titleRule?: string;
  stripRule?: string;
  chipOnBg?: string;
  chipOnFg?: string;
  chipOnBorder?: string;
  cardFrame?: string;
  rowH?: string;
  controlH?: string;
  fieldH?: string;
};

type BaseColors = Record<Exclude<ColorToken, "surface-3">, string> & { "surface-3"?: string };

export type Theme = {
  id: ThemeId;
  label: string;
  description: string;
  scheme: Scheme;
  shape: Shape;
  type: TypeSet;
  group?: ThemeGroup;
  direction?: DirectionId;
  colors: Record<ColorToken, string>;
  modules?: Record<ModuleId, string>;
  /** Ombres : au repos (cartes) et flottante (panneau ancré, menus, dialogues, barre d'actions). */
  shadows?: { rest: string; float: string };
  /** Part du statut dans le fond des badges et pastilles (0,12 par défaut). */
  tint?: number;
  style?: ThemeStyle;
};
type ThemeSource = Omit<Theme, "colors"> & { colors: BaseColors };

export const THEME_IDS = [
  "jour",
  "nuit",
  "quai-jour",
  "quai-nuit",
  "cabine-jour",
  "cabine-nuit",
  "net-contraste",
  "commandement",
  "craie",
  "craie-jour",
  "ivoire",
  "porcelaine",
  "rail",
  "nocturne",
  "graphite",
  "prune",
  "foret",
  "contraste",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Directions : un thème Jour, un thème Nuit, un choix automatique (Nuit / Jour selon le système). */
export const DIRECTIONS = [
  {
    id: "signal",
    label: "Signal",
    description: "Net et calme, des chiffres qui se lisent de loin",
    day: "jour",
    night: "nuit",
    auto: "auto",
  },
  {
    id: "quai",
    label: "Quai",
    description: "Institutionnel ferroviaire : bleu, IBM Plex, angles presque droits",
    day: "quai-jour",
    night: "quai-nuit",
    auto: "quai-auto",
  },
  {
    id: "cabine",
    label: "Cabine",
    description: "Monochrome encre, compact : la couleur est réservée aux statuts",
    day: "cabine-jour",
    night: "cabine-nuit",
    auto: "cabine-auto",
  },
] as const satisfies readonly {
  id: DirectionId;
  label: string;
  description: string;
  day: ThemeId;
  night: ThemeId;
  auto: AutoChoice;
}[];
export const AUTO_CHOICES = ["auto", "quai-auto", "cabine-auto"] as const;
export type AutoChoice = (typeof AUTO_CHOICES)[number];
/** Valeurs acceptées dans les préférences (cookie `csm_ui`). */
export const THEME_CHOICES = [...THEME_IDS, ...AUTO_CHOICES] as const;
/** Choix possibles de l'agent : un thème fixe, ou un « automatique » d'une direction (Nuit / Jour selon le système). */
export type ThemeChoice = ThemeId | AutoChoice;
/** « Automatique » de Signal (défaut de tous les agents). */
export const AUTO_THEMES: Record<Scheme, ThemeId> = { dark: "nuit", light: "jour" };

export function isAutoChoice(choice: string): choice is AutoChoice {
  return (AUTO_CHOICES as readonly string[]).includes(choice);
}

/** Thèmes Nuit / Jour suivis par un choix automatique. */
export function autoThemes(choice: AutoChoice): Record<Scheme, ThemeId> {
  const d = DIRECTIONS.find((x) => x.auto === choice) ?? DIRECTIONS[0];
  return { dark: d.night, light: d.day };
}

/** Schéma posé sur <html> (`data-scheme`) : aucun pour un choix automatique (le CSS suit le système). */
export function choiceScheme(choice: ThemeChoice): Scheme | undefined {
  return isAutoChoice(choice) ? undefined : themeById(choice).scheme;
}

// Rôles : `fg-subtle` = texte d'appoint (placeholder, désactivé) ; `progress` = statut « confirmé / en cours de
// traitement », distinct de l'accent (réservé à l'action : bouton primaire, sélection, focus) ; `surface-3` = survol,
// élément actif ou surélevé (v4).
const SOURCES: ThemeSource[] = [
  // --- Direction A « Signal » (15 oct. 2026), thèmes par défaut : gris teintés d'une seule famille, profondeur par le
  // ton, pétrole le jour, ambre la nuit, Geist, rayons 8 / 6 px. Identifiants `jour` / `nuit` gardés (préférences et
  // cookie `csm_ui`). Palettes : REFONTE-DESIGN-V4 §3 A (OKLCH → hex).
  {
    id: "jour",
    label: "Signal · Jour",
    description: "Clair et net, pétrole : la journée au bureau",
    scheme: "light",
    shape: "net",
    type: "pro",
    group: "reference",
    direction: "signal",
    colors: {
      bg: "#F4F8F8", // oklch(.975 .004 200)
      surface: "#FFFFFF",
      "surface-2": "#ECF1F1", // oklch(.955 .005 200)
      "surface-3": "#E3E9E9", // oklch(.93 .006 200)
      border: "#DADFDF",
      "border-strong": "#7A8282",
      fg: "#14191C",
      "fg-muted": "#4F575B",
      "fg-subtle": "#6D7478",
      accent: "#00666B", // oklch(.46 .085 200)
      "accent-fg": "#FFFFFF",
      ok: "#256C2C",
      warn: "#925B00",
      danger: "#BA2B28",
      info: "#2F59AB",
      progress: "#86398B",
    },
    shadows: {
      rest: "0 1px 0 rgb(20 25 28 / 0.04), 0 1px 2px rgb(20 25 28 / 0.05)",
      float: "0 1px 2px rgb(20 25 28 / 0.06), 0 12px 32px -12px rgb(20 25 28 / 0.22)",
    },
    tint: 0.12,
  },
  {
    id: "nuit",
    label: "Signal · Nuit",
    description: "Bleu-noir, accent ambre : les écrans de soirée",
    scheme: "dark",
    shape: "net",
    type: "pro",
    group: "reference",
    direction: "signal",
    colors: {
      bg: "#0C0E12", // oklch(.165 .008 260)
      surface: "#14161A",
      "surface-2": "#1C1F23",
      "surface-3": "#24272C",
      border: "#2C2F35",
      "border-strong": "#686C73",
      fg: "#EBEDF0",
      "fg-muted": "#AFB3B9",
      "fg-subtle": "#8D9197",
      accent: "#F8BC49", // oklch(.83 .145 80)
      "accent-fg": "#191309",
      ok: "#6BD586",
      warn: "#F5853E",
      danger: "#FC6983",
      info: "#6EBDF3",
      progress: "#D998E8",
    },
    shadows: {
      rest: "inset 0 1px 0 rgb(255 255 255 / 0.04)",
      float:
        "inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px #2C2F35, 0 16px 40px -12px rgb(0 0 0 / 0.65)",
    },
    tint: 0.16,
    style: { cardFrame: "transparent" },
  },
  // --- Direction B « Quai » : institutionnelle ferroviaire. Bleu SNCB en accent, `info` en cyan pour rester distinct,
  // IBM Plex (sans préchargement), angles presque droits, titres soulignés d'un trait accent, en-têtes marqués.
  {
    id: "quai-jour",
    label: "Quai · Jour",
    description: "Bleu ferroviaire, gris bleutés, IBM Plex",
    scheme: "light",
    shape: "quai",
    type: "quai",
    group: "reference",
    direction: "quai",
    colors: {
      bg: "#F2F5F9",
      surface: "#FFFFFF",
      "surface-2": "#EBEFF4",
      "surface-3": "#E2E7EC",
      border: "#D6DBE1",
      "border-strong": "#7A8189",
      fg: "#0E1721",
      "fg-muted": "#4B535E",
      "fg-subtle": "#6B727C",
      accent: "#0859AC",
      "accent-fg": "#FFFFFF",
      ok: "#2F6E14",
      warn: "#955700", // maquette #9A5A00, assombri : AA sur surface-3
      danger: "#BA2B2E",
      info: "#007373",
      progress: "#7E388E",
    },
    shadows: {
      rest: "0 1px 0 rgb(14 23 33 / 0.04), 0 1px 2px rgb(14 23 33 / 0.05)",
      float: "0 1px 2px rgb(14 23 33 / 0.06), 0 12px 28px -12px rgb(8 40 90 / 0.25)",
    },
    tint: 0.11,
    style: {
      thBg: "var(--surface-3)",
      thFg: "var(--fg)",
      thWeight: "600",
      thRule: "var(--border-strong)",
      titleRule: "1.5rem",
      stripRule: "3px",
    },
  },
  {
    id: "quai-nuit",
    label: "Quai · Nuit",
    description: "Bleu nuit, accent bleu ciel, IBM Plex",
    scheme: "dark",
    shape: "quai",
    type: "quai",
    group: "reference",
    direction: "quai",
    colors: {
      bg: "#0C121A",
      surface: "#131A24",
      "surface-2": "#1B232E",
      "surface-3": "#232C38",
      border: "#2D3642",
      "border-strong": "#687380",
      fg: "#EBEFF4",
      "fg-muted": "#ACB5C1",
      "fg-subtle": "#8D96A2",
      accent: "#67B0F9",
      "accent-fg": "#06101C",
      ok: "#6BD586",
      warn: "#F0A646",
      danger: "#F97676",
      info: "#65D2D2",
      progress: "#D998E8",
    },
    shadows: {
      rest: "inset 0 1px 0 rgb(255 255 255 / 0.04)",
      float:
        "inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px #2D3642, 0 16px 40px -12px rgb(0 0 0 / 0.65)",
    },
    tint: 0.16,
    style: {
      thBg: "var(--surface-3)",
      thFg: "var(--fg)",
      thWeight: "600",
      thRule: "var(--border-strong)",
      titleRule: "1.5rem",
      stripRule: "3px",
      cardFrame: "transparent",
    },
  },
  // --- Direction C « Cabine » : monochrome encre (accent = encre), gris chauds, Inter Tight + JetBrains Mono (sans
  // préchargement), lignes compactes 32 px en desktop ; la nuit, séparation par un trait fin.
  {
    id: "cabine-jour",
    label: "Cabine · Jour",
    description: "Papier chaud, encre noire, compact",
    scheme: "light",
    shape: "cabine",
    type: "cabine",
    group: "reference",
    direction: "cabine",
    colors: {
      bg: "#F6F3EF",
      surface: "#FDFBF9",
      "surface-2": "#F0ECE8",
      "surface-3": "#E8E4DF",
      border: "#DDD8D3",
      "border-strong": "#7F7973",
      fg: "#1F1915",
      "fg-muted": "#5A544F",
      "fg-subtle": "#78726D",
      accent: "#2A2420",
      "accent-fg": "#FFFFFF",
      ok: "#197037",
      warn: "#8C5700", // maquette #925B00, assombri : AA sur surface-3
      danger: "#B61537",
      info: "#1A609E",
      progress: "#7A3E87",
    },
    shadows: {
      rest: "0 1px 0 rgb(31 25 21 / 0.03), 0 1px 2px rgb(31 25 21 / 0.05)",
      float: "0 1px 2px rgb(31 25 21 / 0.06), 0 14px 34px -14px rgb(31 25 21 / 0.28)",
    },
    tint: 0.11,
    style: {
      chipOnBg: "var(--fg)",
      chipOnFg: "var(--bg)",
      chipOnBorder: "var(--fg)",
      rowH: "2rem",
      controlH: "2rem",
      fieldH: "2.125rem",
    },
  },
  {
    id: "cabine-nuit",
    label: "Cabine · Nuit",
    description: "Noir profond, encre crème, compact",
    scheme: "dark",
    shape: "cabine",
    type: "cabine",
    group: "reference",
    direction: "cabine",
    colors: {
      bg: "#080706",
      surface: "#110F0D",
      "surface-2": "#1A1815",
      "surface-3": "#24211E",
      border: "#2B2825",
      "border-strong": "#6C6762", // maquette #67625D : ≥ 3:1 sur surface-2
      fg: "#EBE7E2",
      "fg-muted": "#B5B0A9",
      "fg-subtle": "#938E87",
      accent: "#EEE9E0",
      "accent-fg": "#120F0B",
      ok: "#67D283",
      warn: "#CDAF33",
      danger: "#F56B76",
      info: "#6DBBE8",
      progress: "#D695E4",
    },
    shadows: {
      rest: "none",
      float: "0 0 0 1px #2B2825, 0 20px 48px -16px rgb(0 0 0 / 0.8)",
    },
    tint: 0.15,
    style: {
      chipOnBg: "var(--fg)",
      chipOnFg: "var(--bg)",
      chipOnBorder: "var(--fg)",
      rowH: "2rem",
      controlH: "2rem",
      fieldH: "2.125rem",
    },
  },
  // --- Contraste élevé (11 oct. 2026) : seul `surface-3` ajouté.
  {
    id: "net-contraste",
    label: "Contraste élevé",
    description: "Accessibilité : noir, blanc, jaune vif",
    scheme: "dark",
    shape: "net",
    type: "pro",
    group: "reference",
    colors: {
      bg: "#000000",
      surface: "#0A0A0A",
      "surface-2": "#141414",
      "surface-3": "#1F1F1F",
      border: "#8A8A8A",
      "border-strong": "#BDBDBD",
      fg: "#FFFFFF",
      "fg-muted": "#D9D9D9",
      "fg-subtle": "#BDBDBD",
      accent: "#FFD400",
      "accent-fg": "#000000",
      ok: "#3DFF8C",
      warn: "#FF9A1F",
      danger: "#FF5C5C",
      info: "#4CC9FF",
      progress: "#E59BFF",
    },
    shadows: { rest: "none", float: "0 0 0 1px #BDBDBD" },
  },
  // --- Autres thèmes (catalogue du 9 oct. 2026, inchangés).
  {
    id: "commandement",
    label: "Commandement",
    description: "Ambre de poste de commande",
    scheme: "dark",
    shape: "angle",
    type: "saira",
    colors: {
      bg: "#0D0B09",
      surface: "#161310",
      "surface-2": "#1F1B17",
      border: "#37322C",
      "border-strong": "#7C766E",
      fg: "#EDE7DC",
      "fg-muted": "#B1AA9E",
      "fg-subtle": "#8C857C",
      accent: "#FAC13B",
      "accent-fg": "#0D0B09",
      ok: "#64CF80",
      warn: "#F68C36",
      danger: "#FD7277",
      info: "#68B7ED",
      progress: "#D78ADB",
    },
  },
  {
    id: "craie",
    label: "Craie",
    description: "Craie crème sur tableau noir (gsap.com)",
    scheme: "dark",
    shape: "pill",
    type: "geist",
    colors: {
      bg: "#0E100F",
      surface: "#151513",
      "surface-2": "#1E1E1B",
      border: "#3D3E38",
      "border-strong": "#7B7B72",
      fg: "#EEECD6",
      "fg-muted": "#AFAFA2",
      "fg-subtle": "#8A8A80",
      accent: "#FFFCE1",
      "accent-fg": "#0E100F",
      ok: "#5ED476",
      warn: "#F8962D",
      danger: "#FF7777",
      info: "#5ABDF2",
      progress: "#C9A7F5",
    },
    modules: {
      commandes: "#F9E361",
      pmr: "#C3B0FD",
      operations: "#65E0E7",
      reseau: "#F6B3D8",
      ressources: "#F8BFA6",
      admin: "#C3BDB0",
    },
  },
  {
    id: "craie-jour",
    label: "Craie de jour",
    description: "Papier crème, encre noire",
    scheme: "light",
    shape: "pill",
    type: "geist",
    colors: {
      bg: "#FAF8E7",
      surface: "#FEFDF4",
      "surface-2": "#F1EEDC",
      border: "#D8D5C3",
      "border-strong": "#807E70",
      fg: "#0D100E",
      "fg-muted": "#58594F",
      "fg-subtle": "#6D6C63",
      accent: "#131715",
      "accent-fg": "#FAF8E7",
      ok: "#0F6A31",
      warn: "#855A00",
      danger: "#AC262A",
      info: "#005F98",
      progress: "#7A3E9E",
    },
    modules: {
      commandes: "#766200",
      pmr: "#6646A8",
      operations: "#017272",
      reseau: "#9B3876",
      ressources: "#66423F",
      admin: "#615D54",
    },
  },
  {
    id: "ivoire",
    label: "Ivoire",
    description: "Jour chaud, accent bleu canard",
    scheme: "light",
    shape: "angle",
    type: "saira",
    colors: {
      bg: "#F5F1E8",
      surface: "#FBF8F1",
      "surface-2": "#EFE9DC",
      border: "#D8CFBF",
      "border-strong": "#857B6C",
      fg: "#1A1714",
      "fg-muted": "#5C554B",
      "fg-subtle": "#6E665B",
      accent: "#0B5F66",
      "accent-fg": "#FBF8F1",
      ok: "#2A6B2E",
      warn: "#855A00",
      danger: "#B0262B",
      info: "#2F55A4",
      progress: "#8A3A7E",
    },
  },
  {
    id: "porcelaine",
    label: "Porcelaine",
    description: "Jour froid et net, bleu pétrole",
    scheme: "light",
    shape: "soft",
    type: "geist",
    colors: {
      bg: "#F4F6F8",
      surface: "#FDFEFF",
      "surface-2": "#EBEFF2",
      border: "#D7DBE0",
      "border-strong": "#7B8187",
      fg: "#131922",
      "fg-muted": "#515963",
      "fg-subtle": "#666C75",
      accent: "#006071",
      "accent-fg": "#FDFEFF",
      ok: "#146D34",
      warn: "#855A00",
      danger: "#B32228",
      info: "#3055B6",
      progress: "#932B83",
    },
  },
  {
    id: "rail",
    label: "Rail",
    description: "Gris acier, bleu ferroviaire",
    scheme: "dark",
    shape: "angle",
    type: "plex",
    colors: {
      bg: "#0E1116",
      surface: "#151A21",
      "surface-2": "#1D242D",
      border: "#2F3946",
      "border-strong": "#76828F",
      fg: "#E6EBF1",
      "fg-muted": "#A9B4C0",
      "fg-subtle": "#87929E",
      accent: "#4DA3F0",
      "accent-fg": "#0B1220",
      ok: "#4CC38A",
      warn: "#F0A030",
      danger: "#F27A72",
      info: "#B9A2FF",
      progress: "#F59BD0",
    },
  },
  {
    id: "nocturne",
    label: "Nocturne",
    description: "Bleu nuit, accent lavande",
    scheme: "dark",
    shape: "soft",
    type: "geist",
    colors: {
      bg: "#070B14",
      surface: "#0D1424",
      "surface-2": "#131C30",
      border: "#26344F",
      "border-strong": "#6E7F9E",
      fg: "#DCE6F5",
      "fg-muted": "#A3B1C9",
      "fg-subtle": "#8392AD",
      accent: "#B79CFF",
      "accent-fg": "#0A0F1C",
      ok: "#4CC38A",
      warn: "#F2B05E",
      danger: "#F27A7A",
      info: "#62B6FF",
      progress: "#FF9BD2",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutre et sobre, accent indigo",
    scheme: "dark",
    shape: "soft",
    type: "geist",
    colors: {
      bg: "#0A0A0B",
      surface: "#111113",
      "surface-2": "#19191C",
      border: "#2A2A2F",
      "border-strong": "#6F6F78",
      fg: "#EDEDEF",
      "fg-muted": "#A8A8B0",
      "fg-subtle": "#85858D",
      accent: "#8E8CFF",
      "accent-fg": "#0A0A0B",
      ok: "#4FCB86",
      warn: "#F0A44B",
      danger: "#F47575",
      info: "#5CC4E8",
      progress: "#E08CE6",
    },
  },
  {
    id: "prune",
    label: "Prune",
    description: "Sombre chaud, accent rose poudré",
    scheme: "dark",
    shape: "soft",
    type: "geist",
    colors: {
      bg: "#130E14",
      surface: "#1B141C",
      "surface-2": "#241B26",
      border: "#3B2F3E",
      "border-strong": "#857888",
      fg: "#F1E8EF",
      "fg-muted": "#BBADB8",
      "fg-subtle": "#968894",
      accent: "#FF9EC4",
      "accent-fg": "#1A0D14",
      ok: "#6FD08F",
      warn: "#F5B04A",
      danger: "#FF7B6B",
      info: "#5FCFE0",
      progress: "#B9A0FF",
    },
  },
  {
    id: "foret",
    label: "Forêt",
    description: "Vert profond, accent sable",
    scheme: "dark",
    shape: "angle",
    type: "plex",
    colors: {
      bg: "#0B110E",
      surface: "#111915",
      "surface-2": "#18221D",
      border: "#2C3A33",
      "border-strong": "#71827A",
      fg: "#E6EEE8",
      "fg-muted": "#A7B6AD",
      "fg-subtle": "#86948C",
      accent: "#E8D9A8",
      "accent-fg": "#0B110E",
      ok: "#6BD49A",
      warn: "#F2A65A",
      danger: "#F47A72",
      info: "#7CC0F0",
      progress: "#C9A6F2",
    },
  },
  {
    id: "contraste",
    label: "Contraste élevé (angles)",
    description: "Accessibilité : noir, blanc, jaune vif",
    scheme: "dark",
    shape: "angle",
    type: "geist",
    colors: {
      bg: "#000000",
      surface: "#0A0A0A",
      "surface-2": "#141414",
      border: "#8A8A8A",
      "border-strong": "#BDBDBD",
      fg: "#FFFFFF",
      "fg-muted": "#D9D9D9",
      "fg-subtle": "#BDBDBD",
      accent: "#FFD400",
      "accent-fg": "#000000",
      ok: "#3DFF8C",
      warn: "#FF9A1F",
      danger: "#FF5C5C",
      info: "#4CC9FF",
      progress: "#E59BFF",
    },
  },
];

/** Mélange sRGB de deux couleurs hexadécimales (part `t` de `b`). */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(ch(a, i) * (1 - t) + ch(b, i) * t)
          .toString(16)
          .padStart(2, "0")
          .toUpperCase(),
      )
      .join("")
  );
}

/**
 * `surface-3` (v4 : survol, actif, surélevé) des thèmes qui ne le fixent pas : `surface-2` poussé de 6 % vers `fg`,
 * sans toucher leurs couleurs validées du 9 oct. 2026.
 */
export function deriveSurface3(colors: BaseColors): string {
  return colors["surface-3"] ?? mixHex(colors["surface-2"], colors.fg, 0.06);
}

export const THEMES: Theme[] = SOURCES.map((t) => ({
  ...t,
  colors: { ...t.colors, "surface-3": deriveSurface3(t.colors) } as Record<ColorToken, string>,
}));

/** Forme : rayon des boîtes (cartes, dialogues), rayon des contrôles (boutons, champs, badges), chanfrein. */
export const SHAPES: Record<
  Shape,
  { box: string; control: string; chamfer: string; chamferSm: string }
> = {
  angle: { box: "0px", control: "0px", chamfer: "8px", chamferSm: "6px" },
  soft: { box: "8px", control: "6px", chamfer: "0px", chamferSm: "0px" },
  pill: { box: "12px", control: "999px", chamfer: "0px", chamferSm: "0px" },
  // Signal (v4) : boîtes 8 px, contrôles 6 px (4 / 4 avant le 15 oct. 2026).
  net: { box: "8px", control: "6px", chamfer: "0px", chamferSm: "0px" },
  quai: { box: "3px", control: "2px", chamfer: "0px", chamferSm: "0px" },
  cabine: { box: "6px", control: "5px", chamfer: "0px", chamferSm: "0px" },
};

/**
 * Ombres par défaut des thèmes qui n'en fixent pas : aucune pour la forme « angle » (direction d'origine, chanfreins),
 * douces pour « soft » / « pill » ; en sombre, un liseré clair interne plutôt qu'une ombre noire.
 */
export function themeShadows(theme: Pick<Theme, "shape" | "scheme" | "shadows">): {
  rest: string;
  float: string;
} {
  if (theme.shadows) return theme.shadows;
  if (theme.shape === "angle") return { rest: "none", float: "none" };
  return theme.scheme === "dark"
    ? {
        rest: "inset 0 1px 0 rgb(255 255 255 / 0.04)",
        float:
          "inset 0 1px 0 rgb(255 255 255 / 0.06), 0 0 0 1px var(--border), 0 16px 40px -12px rgb(0 0 0 / 0.6)",
      }
    : {
        rest: "0 1px 0 rgb(0 0 0 / 0.03), 0 1px 2px rgb(0 0 0 / 0.05)",
        float: "0 1px 2px rgb(0 0 0 / 0.06), 0 12px 32px -12px rgb(0 0 0 / 0.22)",
      };
}

const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Typographie : texte, titres (display), mono ; casse et approche des titres. */
export const TYPESETS: Record<
  TypeSet,
  {
    ui: string;
    title: string;
    code: string;
    case: string;
    track: string;
    weight: string;
    /** Libellés (`.label-mono` : sourcils, en-têtes de tableau) : police, casse, approche. */
    label?: { font: string; case: string; track: string };
    /**
     * Chiffres des compteurs (`.figures`, v4) : « sans » = police du texte en chiffres tabulaires (fin du zéro barré de
     * la mono) ; sinon la police des titres, comme avant.
     */
    figures?: "sans";
    /** Titre de page (`text-h1`) : 24 / 30 dans les directions v4, 40 / 40 ailleurs. */
    h1?: { size: string; line: string };
    /** Variantes OpenType du texte (Geist : a et l plus lisibles). */
    features?: string;
  }
> = {
  saira: {
    ui: `var(--font-geist), ${SANS_FALLBACK}`,
    title: `var(--font-saira), var(--font-geist), ${SANS_FALLBACK}`,
    code: `var(--font-geist-mono), ${MONO_FALLBACK}`,
    case: "uppercase",
    track: "0.02em",
    weight: "700",
  },
  geist: {
    ui: `var(--font-geist), ${SANS_FALLBACK}`,
    title: `var(--font-geist), ${SANS_FALLBACK}`,
    code: `var(--font-geist-mono), ${MONO_FALLBACK}`,
    case: "none",
    track: "-0.02em",
    weight: "600",
  },
  // Signal : une seule voix, titres 600 serrés ; la mono ne sert plus qu'aux n° de train, heures et références.
  pro: {
    ui: `var(--font-geist), ${SANS_FALLBACK}`,
    title: `var(--font-geist), ${SANS_FALLBACK}`,
    code: `var(--font-geist-mono), ${MONO_FALLBACK}`,
    case: "none",
    track: "-0.02em",
    weight: "600",
    label: { font: `var(--font-geist), ${SANS_FALLBACK}`, case: "none", track: "0" },
    figures: "sans",
    h1: { size: "1.5rem", line: "1.875rem" },
    features: '"cv11", "ss01"',
  },
  plex: {
    ui: `var(--font-plex), ${SANS_FALLBACK}`,
    title: `var(--font-plex-condensed), var(--font-plex), ${SANS_FALLBACK}`,
    code: `var(--font-plex-mono), ${MONO_FALLBACK}`,
    case: "none",
    track: "-0.01em",
    weight: "600",
  },
  quai: {
    ui: `var(--font-plex), ${SANS_FALLBACK}`,
    title: `var(--font-plex), ${SANS_FALLBACK}`,
    code: `var(--font-plex-mono), ${MONO_FALLBACK}`,
    case: "none",
    track: "-0.01em",
    weight: "600",
    label: { font: `var(--font-plex), ${SANS_FALLBACK}`, case: "none", track: "0" },
    figures: "sans",
    h1: { size: "1.5rem", line: "1.875rem" },
  },
  cabine: {
    ui: `var(--font-inter-tight), ${SANS_FALLBACK}`,
    title: `var(--font-inter-tight), ${SANS_FALLBACK}`,
    code: `var(--font-jetbrains-mono), ${MONO_FALLBACK}`,
    case: "none",
    track: "-0.035em",
    weight: "600",
    label: { font: `var(--font-inter-tight), ${SANS_FALLBACK}`, case: "none", track: "0" },
    figures: "sans",
    h1: { size: "1.5rem", line: "1.875rem" },
    features: '"ss02", "cv11"',
  },
};

/** Teinte de fond des badges de statut par défaut (part de la couleur du statut mêlée à `surface`). */
export const BADGE_TINT = 0.12;

export const DENSITIES = ["confortable", "compact"] as const;
export type Density = (typeof DENSITIES)[number];

export function themeById(id: ThemeId): Theme {
  const theme = THEMES.find((t) => t.id === id);
  if (!theme) throw new Error(`Thème inconnu : ${id}`);
  return theme;
}

function block(selector: string, theme: Theme, indent = ""): string {
  const shape = SHAPES[theme.shape];
  const type = TYPESETS[theme.type];
  const shadows = themeShadows(theme);
  const style = theme.style ?? {};
  const sans = type.figures === "sans";
  const lines = [
    `color-scheme: ${theme.scheme};`,
    ...COLOR_TOKENS.map((k) => `--${k}: ${theme.colors[k]};`),
    ...MODULE_IDS.map((m) => `--mod-${m}: ${theme.modules?.[m] ?? "var(--accent)"};`),
    `--r-box: ${shape.box};`,
    `--r-control: ${shape.control};`,
    `--chamfer: ${shape.chamfer};`,
    `--chamfer-sm: ${shape.chamferSm};`,
    `--shadow-1: ${shadows.rest};`,
    `--shadow-2: ${shadows.float};`,
    `--tint: ${Math.round((theme.tint ?? BADGE_TINT) * 100)}%;`,
    `--font-ui: ${type.ui};`,
    `--font-title: ${type.title};`,
    `--font-code: ${type.code};`,
    `--display-case: ${type.case};`,
    `--display-track: ${type.track};`,
    `--display-weight: ${type.weight};`,
    `--label-font: ${type.label?.font ?? "var(--font-code)"};`,
    `--label-case: ${type.label?.case ?? "uppercase"};`,
    `--label-track: ${type.label?.track ?? "0.06em"};`,
    `--figures-font: ${sans ? "var(--font-ui)" : "var(--font-title)"};`,
    `--figures-track: ${sans ? "-0.03em" : type.track};`,
    `--figures-weight: ${type.weight};`,
    `--figures-case: ${sans ? "none" : type.case};`,
    `--font-features: ${type.features ?? "normal"};`,
    `--fs-h1: ${type.h1?.size ?? "2.5rem"};`,
    `--lh-h1: ${type.h1?.line ?? "2.5rem"};`,
    `--th-bg: ${style.thBg ?? "var(--surface-2)"};`,
    `--th-fg: ${style.thFg ?? "var(--fg-muted)"};`,
    `--th-weight: ${style.thWeight ?? "500"};`,
    `--th-rule: ${style.thRule ?? "var(--border)"};`,
    `--title-rule: ${style.titleRule ?? "0px"};`,
    `--strip-rule: ${style.stripRule ?? "0px"};`,
    `--chip-on-bg: ${style.chipOnBg ?? "color-mix(in oklab, var(--accent) 14%, var(--surface))"};`,
    `--chip-on-fg: ${style.chipOnFg ?? "var(--fg)"};`,
    `--chip-on-border: ${style.chipOnBorder ?? "var(--accent)"};`,
    `--card-frame: ${style.cardFrame ?? "var(--border)"};`,
    ...(style.rowH ? [`--theme-row-h: ${style.rowH};`] : []),
    ...(style.controlH ? [`--theme-control-h: ${style.controlH};`] : []),
    ...(style.fieldH ? [`--theme-field-h: ${style.fieldH};`] : []),
  ];
  return `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n${indent}}`;
}

/** CSS des thèmes : un bloc par `data-theme`, plus les « automatiques » de chaque direction (prefers-color-scheme). */
export function themesCss(): string {
  const parts = [
    "/* Fichier généré par `npm run tokens` depuis src/design/tokens.ts : ne pas modifier à la main. */",
    block(':root,\n[data-theme="nuit"]', themeById("nuit")),
    ...THEMES.filter((t) => t.id !== "nuit").map((t) => block(`[data-theme="${t.id}"]`, t)),
    ...DIRECTIONS.flatMap((d) => [
      block(`[data-theme="${d.auto}"]`, themeById(d.night)),
      `@media (prefers-color-scheme: light) {\n${block(`[data-theme="${d.auto}"]`, themeById(d.day), "  ")}\n}`,
    ]),
  ];
  return `${parts.join("\n\n")}\n`;
}
