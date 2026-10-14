import { MarkdownInline } from "@/components/referentiels/markdown-view";
import { Badge, type Tone } from "@/components/ui/status-badge";
import type { ChangelogSection } from "@/lib/changelog";
import { cn } from "@/lib/utils";

const SECTION_TONE: Record<string, Tone> = {
  Nouveautés: "ok",
  Améliorations: "info",
  Corrections: "warn",
  Sécurité: "danger",
};

const dateFmt = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** « 14 octobre 2026 » pour une date AAAA-MM-JJ (jour calendaire, sans fuseau). */
export function releaseDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : dateFmt.format(d);
}

/** Espaces insécables de la typographie française (guillemets, deux-points) : jamais « Plus / » coupés en fin de ligne. */
function frenchSpacing(text: string): string {
  return text.replace(/« /g, "« ").replace(/ (»|:|;|\?|!)/g, " $1");
}

/** Sous-sections d'une version (Nouveautés, Améliorations…) : badge de ton + puces (gras et liens seulement). */
export function ReleaseSections({
  sections,
  className,
}: {
  sections: ChangelogSection[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {sections.map((s) => (
        <section key={s.name} className="flex min-w-0 flex-col gap-2">
          <h3>
            <Badge tone={SECTION_TONE[s.name] ?? "neutral"}>{s.name}</Badge>
          </h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-body marker:text-fg-subtle">
            {s.items.map((item, i) => (
              <li key={i} className="min-w-0 break-words">
                <MarkdownInline text={frenchSpacing(item)} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
