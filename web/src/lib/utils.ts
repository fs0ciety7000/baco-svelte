import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge doit connaître nos tailles de texte et nos couleurs sémantiques : sans cela, `text-body` (taille)
// et `text-accent-fg` (couleur) sont pris pour la même famille et l'un des deux est supprimé.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["box", "control"] }],
      "font-size": [
        { text: ["label", "small", "hint", "body", "body-lg", "h3", "h2", "h1", "stat"] },
      ],
      "text-color": [
        {
          text: [
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
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
