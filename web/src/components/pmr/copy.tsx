"use client";

import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export async function copyLabel(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copié : ${text}`);
  } catch {
    toast.error("Copie impossible (presse-papiers indisponible).");
  }
}

/** Bouton « copier le libellé » (ex. « Embarquement d'une chaise roulante »). */
export function CopyButton({ text, label }: { text: string; label?: boolean }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="border border-border"
      aria-label={`Copier le libellé : ${text}`}
      title={text}
      onClick={(e) => {
        e.stopPropagation();
        void copyLabel(text);
      }}
    >
      <Copy aria-hidden className="size-4" />
      {label ? "Copier" : null}
    </Button>
  );
}
