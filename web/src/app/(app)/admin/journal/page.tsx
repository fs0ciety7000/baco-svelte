import type { Metadata } from "next";

import { JournalRulesEditor } from "@/components/admin/journal-rules";
import { rulesSchema } from "@/lib/ops/journal-rules";
import { requireAdmin } from "@/server/auth";
import { getSetting } from "@/server/data/admin";

export const metadata: Metadata = { title: "Journal · Administration · CSM" };

export default async function Page() {
  // Garde dans la page (pas seulement le layout) : Next rend layout et page en parallèle.
  await requireAdmin();
  const setting = await getSetting<unknown>("journal_rules").catch(() => null);
  const rules = rulesSchema.safeParse(setting?.value).data?.rules ?? [];
  return (
    <section className="flex max-w-4xl flex-col gap-4" aria-label="Tri automatique du Journal">
      <p className="text-body text-fg-muted">
        Catégorie donnée aux messages automatiques. Les règles s&apos;appliquent dans l&apos;ordre :
        la première dont un mot-clé figure dans le texte l&apos;emporte ; une règle sans mot-clé
        sert de catégorie par défaut pour sa source (pour iRail : les perturbations, les travaux et
        les rétablissements gardant leur catégorie). Les messages repris de BACO se reclassent avec
        le bouton ci-dessous (à refaire après l&apos;import de la bascule).
      </p>
      <JournalRulesEditor initial={rules} />
    </section>
  );
}
