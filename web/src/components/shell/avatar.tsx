import { cn } from "@/lib/utils";

import { initials } from "./types";

/** Avatar à initiales (pas de service externe : DiceBear est remplacé, décision du 8 octobre 2026). */
export function Avatar({
  name,
  email,
  className,
}: {
  name: string;
  email: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center border border-border-strong bg-surface-2 font-mono text-small font-medium text-fg",
        className,
      )}
    >
      {initials(name, email)}
    </span>
  );
}
