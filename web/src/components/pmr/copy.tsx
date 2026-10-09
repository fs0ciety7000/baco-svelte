"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Copie dans le presse-papiers. Succès silencieux (retour sur le bouton) ; échec signalé par un toast. */
export async function copyLabel(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error("Copie impossible (presse-papiers indisponible).");
    return false;
  }
}

/**
 * État « Copié » sur place pendant 1,2 s (audit motion du 9 oct. 2026 : un toast de 4 s à chaque copie masquait le
 * contenu, surtout en mobile et dans l'export ALEA bloc par bloc).
 */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string) => {
    if (!(await copyLabel(text))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1200);
  }, []);
  return { copied, copy };
}

/** Icône de copie qui devient une coche verte (fondu + léger rebond, aucun mouvement en mode réduit). */
export function CopyIcon({ copied }: { copied: boolean }) {
  return copied ? (
    <Check aria-hidden className="size-4 animate-pop-in text-ok" />
  ) : (
    <Copy aria-hidden className="size-4" />
  );
}

/** Bouton « copier le libellé » (ex. « Embarquement d'une chaise roulante »). */
export function CopyButton({
  text,
  label,
  variant = "ghost",
}: {
  text: string;
  /** `true` : « Copier » ; texte : libellé du bouton. */
  label?: boolean | string;
  variant?: "ghost" | "secondary";
}) {
  const { copied, copy } = useCopy();
  return (
    <Button
      size="sm"
      variant={variant}
      className={cn(variant === "ghost" && "border border-border", copied && "border-ok/60")}
      aria-label={copied ? "Copié" : `Copier le libellé : ${text}`}
      title={text}
      onClick={(e) => {
        e.stopPropagation();
        void copy(text);
      }}
    >
      <CopyIcon copied={copied} />
      {label ? (copied ? "Copié" : label === true ? "Copier" : label) : null}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copié dans le presse-papiers" : ""}
      </span>
    </Button>
  );
}
