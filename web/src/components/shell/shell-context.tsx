"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { UiPreferences } from "@/design/preferences";
import {
  adminModule,
  quickActions,
  visibleModules,
  type NavModule,
  type QuickAction,
} from "@/navigation";

import type { ShellUser } from "./types";

export type ShellData = {
  user: ShellUser;
  modules: NavModule[];
  admin: NavModule | null;
  actions: QuickAction[];
  ui: UiPreferences;
  setUi: (ui: UiPreferences) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

const ShellContext = createContext<ShellData | null>(null);

// Les icônes (composants) ne traversent pas la frontière serveur → client : la navigation est donc
// calculée ici, côté client, à partir de l'agent (même fonction que côté serveur).
export function ShellProvider({
  user,
  initialUi,
  children,
}: {
  user: ShellUser;
  initialUi: UiPreferences;
  children: ReactNode;
}) {
  const [ui, setUi] = useState(initialUi);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const value = useMemo<ShellData>(
    () => ({
      user,
      modules: visibleModules(user),
      admin: adminModule(user),
      actions: quickActions(user),
      ui,
      setUi,
      paletteOpen,
      setPaletteOpen,
    }),
    [user, ui, paletteOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellData {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell hors du shell");
  return ctx;
}
