"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Raccourcis de la B201 : ← / → jour précédent / suivant, T aujourd'hui (hors champs de saisie). */
export function B201Keys({ prev, next, today }: { prev: string; next: string; today: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowLeft") router.push(prev);
      else if (e.key === "ArrowRight") router.push(next);
      else if (e.key === "t" || e.key === "T") router.push(today);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next, today]);
  return null;
}
