"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { Smile } from "lucide-react";

// Emojis du Journal : sélection courte et métier (alerte, état, transport, PMR, météo, communication), sans
// dépendance. Le texte reste de l'Unicode : rien à échapper, lisible partout (CSV, notifications).
export const EMOJI_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Alerte et état",
    items: ["🚨", "⚠️", "⛔", "❗", "❓", "✅", "❌", "🟢", "🟠", "🔴", "ℹ️", "📌"],
  },
  {
    label: "Transport",
    items: ["🚆", "🚄", "🚉", "🚌", "🚕", "🚧", "🔧", "⚡", "🛤️", "🚦", "🕐", "⏳"],
  },
  {
    label: "Voyageurs",
    items: ["♿", "🦯", "🧑‍🦽", "👥", "🧒", "🧳", "🐕‍🦺", "🚻", "🅿️", "🛗", "🎫", "📍"],
  },
  { label: "Météo", items: ["🌧️", "❄️", "🌬️", "🌩️", "🌫️", "🔥", "☀️", "🌊"] },
  {
    label: "Échanges",
    items: ["📢", "📞", "📧", "📎", "📝", "👍", "👀", "🙏", "💬", "🤝", "🎉", "☕"],
  },
];

/** Bouton « Emoji » : grille au clavier (flèches, Entrée), insère l'emoji au curseur. */
export function EmojiPicker({
  onPick,
  side = "top",
}: {
  onPick: (emoji: string) => void;
  side?: "top" | "bottom";
}) {
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button
          type="button"
          aria-label="Insérer un emoji"
          title="Emoji"
          className="grid size-10 cursor-pointer place-items-center text-fg-muted hover:bg-surface-2 hover:text-fg data-[state=open]:bg-surface-2 data-[state=open]:text-fg"
        >
          <Smile aria-hidden className="size-5" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-h-[min(22rem,60dvh)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto border border-border-strong bg-surface p-2 shadow-lg data-[state=open]:animate-fade-in"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {EMOJI_GROUPS.map((g) => (
            <Menu.Group key={g.label} className="mb-1.5 last:mb-0">
              <Menu.Label className="label-mono px-1 pb-1 text-fg-muted">{g.label}</Menu.Label>
              <div className="grid grid-cols-6 gap-0.5">
                {g.items.map((e) => (
                  <Menu.Item
                    key={e}
                    onSelect={() => onPick(e)}
                    className="grid h-10 cursor-pointer place-items-center text-[1.35rem] leading-none outline-none select-none hover:bg-surface-2 data-[highlighted]:bg-surface-2"
                    aria-label={`Emoji ${e}`}
                  >
                    {e}
                  </Menu.Item>
                ))}
              </div>
            </Menu.Group>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
