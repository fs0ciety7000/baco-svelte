"use client";

import { announceDutyChange, DUTY_CHANGED } from "@/lib/team";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { setDutyDistricts } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { DistrictPicker } from "@/components/ui/district-picker";
import { DISTRICT_NAME_OPTIONS } from "@/lib/district-param";
import { DUTY_SHORT } from "@/lib/ops/log";
import { cn } from "@/lib/utils";

function DutyDialog({
  open,
  onOpenChange,
  initial,
  hint,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: string[];
  /** Origine de la proposition (prestation Quinyx du jour). */
  hint?: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (open) setPicked(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Où travailles-tu aujourd'hui ?"
        description="Tu recevras les urgences et les perturbations iRail de ces districts, pour la journée."
      >
        {hint ? (
          <p className="mb-2 text-small text-fg-muted" data-testid="duty-quinyx">
            Proposé d&apos;après ton horaire Quinyx : {hint}. Change-le si tu travailles ailleurs.
          </p>
        ) : null}
        <DistrictPicker
          options={DISTRICT_NAME_OPTIONS}
          values={picked}
          onValuesChange={setPicked}
          allLabel={null}
          layout="stack"
          showHint="always"
          label="Districts du jour"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Plus tard
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={pending}
            data-testid="duty-save"
            onClick={() =>
              start(async () => {
                const res = await setDutyDistricts(picked);
                if (!res.ok) return void toast.error(res.error);
                toast.success(
                  picked.length
                    ? `Districts du jour : ${picked.map((d) => DUTY_SHORT[d]).join(", ")}.`
                    : "Aucun district aujourd'hui : pas de notification de district.",
                );
                onOpenChange(false);
                announceDutyChange();
                router.refresh();
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Puce « Mes districts du jour » (en-tête du Journal) : ouvre le choix. */
export function DutyChip({
  districts,
  today,
  suggested = null,
}: {
  districts: string[];
  today: boolean;
  suggested?: { districts: string[]; label: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // Changement fait dans un autre onglet : la barre du haut (et la cloche) se mettent à jour ici aussi.
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("csm-duty");
      ch.onmessage = () => {
        window.dispatchEvent(new Event(DUTY_CHANGED));
        router.refresh();
      };
    } catch {
      return;
    }
    return () => ch?.close();
  }, [router]);
  const set = today && districts.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="duty-chip"
        className={cn(
          // Puce des districts (lot 3 du design v4) : pilule sur `surface-2` ; à choisir = teinte d'avertissement.
          "inline-flex h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-pill border px-3 text-small font-medium transition-colors md:pointer-fine:h-[1.875rem]",
          set
            ? "border-transparent bg-surface-2 text-fg hover:bg-surface-3"
            : "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_var(--tint),var(--surface))] text-fg hover:border-warn",
        )}
        title="Districts où je travaille aujourd'hui"
      >
        <MapPin aria-hidden className="size-3.5" />
        {set ? (
          districts.map((d) => DUTY_SHORT[d] ?? d).join(" · ")
        ) : (
          <>
            <span className="sm:hidden" aria-label="Mes districts du jour ?">
              ?
            </span>
            {/* Libellé long sur grand écran seulement : la barre du haut laisse la place aux onglets du module. */}
            <span className="max-sm:hidden 2xl:hidden" aria-label="Mes districts du jour ?">
              Districts ?
            </span>
            <span className="hidden 2xl:inline">Mes districts du jour ?</span>
          </>
        )}
      </button>
      <DutyDialog
        open={open}
        onOpenChange={setOpen}
        initial={today ? districts : (suggested?.districts ?? [])}
        hint={!today && suggested?.districts.length ? suggested.label : undefined}
      />
    </>
  );
}
