// Source unique des jetons des thèmes CSM (docs/DESIGN-DIRECTION.md, catalogue validé le 9 oct. 2026 :
// docs/design/AUDIT-INTERFACE.md). Chaque thème porte ses couleurs, sa forme (angle chanfreiné, doux, pilule) et sa
// typographie. `npm run tokens` régénère src/app/themes.css ; un test vérifie la synchronisation, le contraste AA et
// l'écart de teinte entre l'accent et les statuts.

export const COLOR_TOKENS = [
  "bg",
  "surface",
  "surface-2",
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
  "referentiels",
  "equipe",
  "admin",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Scheme = "dark" | "light";
export type Shape = "angle" | "soft" | "pill";
export type TypeSet = "saira" | "geist" | "plex";
export type Theme = {
  id: ThemeId;
  label: string;
  description: string;
  scheme: Scheme;
  shape: Shape;
  type: TypeSet;
  colors: Record<ColorToken, string>;
  modules?: Record<ModuleId, string>;
};

export const THEME_IDS = [
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
/** Choix possibles de l'agent : un thème fixe, ou « auto » (Commandement / Ivoire selon le système). */
export type ThemeChoice = ThemeId | "auto";
export const AUTO_THEMES: Record<Scheme, ThemeId> = { dark: "commandement", light: "ivoire" };

// Rôles : `fg-subtle` = texte d'appoint (placeholder, désactivé) ; `progress` = statut « confirmé / en cours de
// traitement », distinct de l'accent (réservé à l'action : bouton primaire, sélection, focus).
export const THEMES: Theme[] = [
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
      referentiels: "#F6B3D8",
      equipe: "#F8BFA6",
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
      referentiels: "#9B3876",
      equipe: "#66423F",
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
    label: "Contraste élevé",
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

/** Forme : rayon des boîtes (cartes, dialogues), rayon des contrôles (boutons, champs, badges), chanfrein. */
export const SHAPES: Record<
  Shape,
  { box: string; control: string; chamfer: string; chamferSm: string }
> = {
  angle: { box: "0px", control: "0px", chamfer: "8px", chamferSm: "6px" },
  soft: { box: "8px", control: "6px", chamfer: "0px", chamferSm: "0px" },
  pill: { box: "12px", control: "999px", chamfer: "0px", chamferSm: "0px" },
};

const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif";
const MONO_FALLBACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Typographie : texte, titres (display), mono ; casse et approche des titres. */
export const TYPESETS: Record<
  TypeSet,
  { ui: string; title: string; code: string; case: string; track: string; weight: string }
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
  plex: {
    ui: `var(--font-plex), ${SANS_FALLBACK}`,
    title: `var(--font-plex-condensed), var(--font-plex), ${SANS_FALLBACK}`,
    code: `var(--font-plex-mono), ${MONO_FALLBACK}`,
    case: "none",
    track: "-0.01em",
    weight: "600",
  },
};

/** Teinte de fond des badges de statut (part de la couleur du statut mêlée à `surface`). */
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
  const lines = [
    `color-scheme: ${theme.scheme};`,
    ...COLOR_TOKENS.map((k) => `--${k}: ${theme.colors[k]};`),
    ...MODULE_IDS.map((m) => `--mod-${m}: ${theme.modules?.[m] ?? "var(--accent)"};`),
    `--r-box: ${shape.box};`,
    `--r-control: ${shape.control};`,
    `--chamfer: ${shape.chamfer};`,
    `--chamfer-sm: ${shape.chamferSm};`,
    `--font-ui: ${type.ui};`,
    `--font-title: ${type.title};`,
    `--font-code: ${type.code};`,
    `--display-case: ${type.case};`,
    `--display-track: ${type.track};`,
    `--display-weight: ${type.weight};`,
  ];
  return `${indent}${selector} {\n${lines.map((l) => `${indent}  ${l}`).join("\n")}\n${indent}}`;
}

/** CSS des thèmes : un bloc par `data-theme`, plus « auto » qui suit prefers-color-scheme. */
export function themesCss(): string {
  const parts = [
    "/* Fichier généré par `npm run tokens` depuis src/design/tokens.ts : ne pas modifier à la main. */",
    block(':root,\n[data-theme="commandement"]', themeById("commandement")),
    ...THEMES.filter((t) => t.id !== "commandement").map((t) => block(`[data-theme="${t.id}"]`, t)),
    block('[data-theme="auto"]', themeById(AUTO_THEMES.dark)),
    `@media (prefers-color-scheme: light) {\n${block('[data-theme="auto"]', themeById(AUTO_THEMES.light), "  ")}\n}`,
  ];
  return `${parts.join("\n\n")}\n`;
}
