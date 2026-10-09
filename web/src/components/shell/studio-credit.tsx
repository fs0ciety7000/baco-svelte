import { cn } from "@/lib/utils";

/** Mention de l'éditeur (pied de page du shell et de la page de connexion). */
export function StudioCredit({ className }: { className?: string }) {
  return (
    <p className={cn("text-small text-fg-muted", className)}>
      Développé par{" "}
      <a
        href="https://studios.fs0ciety.org/"
        target="_blank"
        rel="noopener noreferrer"
        className="link"
      >
        OCC MONS Studios
      </a>{" "}
      · {new Date().getFullYear()}
    </p>
  );
}
