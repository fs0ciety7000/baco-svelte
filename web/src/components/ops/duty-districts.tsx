"use client";

import { DUTY_CHANGED } from "@/lib/team";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { setDutyDistricts } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { DUTY_DISTRICTS, DUTY_SHORT } from "@/lib/ops/log";
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
        <div className="flex flex-col gap-2" role="group" aria-label="Districts du jour">
          {DUTY_DISTRICTS.map((d) => {
            const on = picked.includes(d);
            return (
              <button
                key={d}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked(on ? picked.filter((x) => x !== d) : [...picked, d])}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-3 border px-3 text-left transition-colors",
                  on
                    ? "border-accent bg-accent-soft"
                    : "border-border-strong bg-surface hover:border-fg-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-5 place-items-center border text-[0.8rem] leading-none",
                    on ? "border-accent bg-accent text-accent-fg" : "border-border-strong",
                  )}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="font-mono text-small text-fg-muted">{DUTY_SHORT[d]}</span>
                <span className="text-body text-fg">{d}</span>
              </button>
            );
          })}
        </div>
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
                window.dispatchEvent(new Event(DUTY_CHANGED));
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
  const set = today && districts.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="duty-chip"
        className={cn(
          "inline-flex h-11 min-w-11 md:h-control-sm shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border px-2.5 text-small transition-colors",
          set
            ? "border-border-strong text-fg hover:border-fg-muted"
            : "border-warn bg-[color-mix(in_oklab,var(--warn)_12%,var(--surface))] text-fg",
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
            <span className="max-sm:hidden">Mes districts du jour ?</span>
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
