// Source unique des jetons de couleur des 5 thèmes CSM (docs/DESIGN-DIRECTION.md).
// `npm run tokens` régénère src/app/themes.css ; un test vérifie la synchronisation et le contraste AA.

export const COLOR_TOKENS = [
  "bg",
  "surface",
  "surface-2",
  "border",
  "border-strong",
  "fg",
  "fg-muted",
  "accent",
  "accent-fg",
  "ok",
  "warn",
  "danger",
  "info",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Scheme = "dark" | "light";
export type Theme = {
  id: ThemeId;
  label: string;
  scheme: Scheme;
  colors: Record<ColorToken, string>;
};

export const THEME_IDS = ["commandement", "ivoire", "rail", "contraste", "nocturne"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
/** Choix possibles de l'agent : un thème fixe, ou « auto » (Commandement / Ivoire selon le système). */
export type ThemeChoice = ThemeId | "auto";
export const AUTO_THEMES: Record<Scheme, ThemeId> = { dark: "commandement", light: "ivoire" };

// Écarts validés par rapport au tableau de DESIGN-DIRECTION.md :
// - `border-strong` (bordure des champs, ≥ 3:1 sur bg / surface / surface-2, WCAG 1.4.11) ;
// - `accent-fg` (texte posé sur l'accent) = couleur de fond du thème.
export const THEMES: Theme[] = [
  {
    id: "commandement",
    label: "Commandement",
    scheme: "dark",
    colors: {
      bg: "#0B0A09",
      surface: "#141210",
      "surface-2": "#1C1916",
      border: "#2E2A25",
      "border-strong": "#6D6861",
      fg: "#EDE6DA",
      "fg-muted": "#8F877B",
      accent: "#F2A93B",
      "accent-fg": "#0B0A09",
      ok: "#5FBF77",
      warn: "#E8873A",
      danger: "#F0605F",
      info: "#4EA1D3",
    },
  },
  {
    id: "ivoire",
    label: "Ivoire",
    scheme: "light",
    colors: {
      bg: "#F5F1E8",
      surface: "#FBF8F1",
      "surface-2": "#EFE9DC",
      border: "#D8CFBF",
      "border-strong": "#888277",
      fg: "#1A1714",
      "fg-muted": "#6B6358",
      accent: "#8A5300",
      "accent-fg": "#F5F1E8",
      ok: "#256B3A",
      warn: "#9A4512",
      danger: "#B0262B",
      info: "#1A5F92",
    },
  },
  {
    id: "rail",
    label: "Rail",
    scheme: "dark",
    colors: {
      bg: "#0E1116",
      surface: "#151A21",
      "surface-2": "#1D242D",
      border: "#2A333F",
      "border-strong": "#68707A",
      fg: "#E6EBF1",
      "fg-muted": "#8794A3",
      accent: "#3A9BE5",
      "accent-fg": "#0E1116",
      ok: "#3FB27F",
      warn: "#F0A030",
      danger: "#F06A62",
      info: "#7FB8E6",
    },
  },
  {
    id: "contraste",
    label: "Contraste élevé",
    scheme: "dark",
    colors: {
      bg: "#000000",
      surface: "#0A0A0A",
      "surface-2": "#141414",
      border: "#8A8A8A",
      "border-strong": "#B0B0B0",
      fg: "#FFFFFF",
      "fg-muted": "#D0D0D0",
      accent: "#FFD000",
      "accent-fg": "#000000",
      ok: "#00FF7F",
      warn: "#FF9900",
      danger: "#FF4040",
      info: "#40C0FF",
    },
  },
  {
    id: "nocturne",
    label: "Nocturne bleu",
    scheme: "dark",
    colors: {
      bg: "#070B14",
      surface: "#0D1424",
      "surface-2": "#131C30",
      border: "#22304A",
      "border-strong": "#5E6A81",
      fg: "#DCE6F5",
      "fg-muted": "#7F90AD",
      accent: "#5AA9FF",
      "accent-fg": "#070B14",
      ok: "#4CC38A",
      warn: "#F2B05E",
      danger: "#F06A6A",
      info: "#8AB4FF",
    },
  },
];

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
  const vars = COLOR_TOKENS.map((k) => `${indent}  --${k}: ${theme.colors[k]};`).join("\n");
  return `${indent}${selector} {\n${indent}  color-scheme: ${theme.scheme};\n${vars}\n${indent}}`;
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
