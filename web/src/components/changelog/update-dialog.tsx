"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { acknowledgeChangelog } from "@/app/changelog-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { ReleaseSummary } from "@/lib/changelog";
import { pl } from "@/lib/utils";
import { CHANGELOG_LINK } from "@/navigation";

import { ReleaseSections, releaseDate } from "./release-notes";

/**
 * « CSM a été mis à jour » : montrée une fois par version et par compte (le serveur ne la transmet que si
 * `preferences.changelogSeen` est plus ancien). Rendue après l'hydratation (portail Radix) : rien dans le HTML
 * serveur, aucun écart d'hydratation. Fermer, « OK » ou « Voir tout » enregistrent la version vue ; ouvrir
 * directement la page Nouveautés aussi, sans afficher la fenêtre.
 */
export function UpdateDialog({ release }: { release: ReleaseSummary }) {
  const pathname = usePathname();
  const onChangelog = pathname === CHANGELOG_LINK.href;
  const [open, setOpen] = useState(!onChangelog);
  const done = useRef(false);

  const acknowledge = () => {
    if (done.current) return;
    done.current = true;
    // Échec réseau : la fenêtre reviendra au prochain chargement, rien de bloquant.
    acknowledgeChangelog(release.version).catch(() => {
      done.current = false;
    });
  };

  useEffect(() => {
    if (onChangelog) {
      setOpen(false);
      acknowledge();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement à l'arrivée sur la page Nouveautés
  }, [onChangelog]);

  const close = () => {
    setOpen(false);
    acknowledge();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        eyebrow={`Version ${release.version} · ${releaseDate(release.date)}`}
        title="CSM a été mis à jour"
        description={release.title || undefined}
        className="max-w-xl"
        data-testid="update-dialog"
      >
        <div className="flex flex-col gap-4">
          <ReleaseSections sections={release.sections} />
          {release.more > 0 ? (
            <p className="text-small text-fg-muted">
              Et {release.more} {pl(release.more, "autre changement", "autres changements")} dans
              les nouveautés.
            </p>
          ) : null}
        </div>
        {/* Boutons toujours visibles, même quand le résumé défile (mobile). */}
        <DialogFooter className="sticky -bottom-4 bg-surface shadow-[0_1rem_0_var(--surface)]">
          <Button variant="secondary" asChild>
            <Link href={CHANGELOG_LINK.href} onClick={close}>
              <Sparkles aria-hidden /> Voir tout le changelog
            </Link>
          </Button>
          <Button onClick={close}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
