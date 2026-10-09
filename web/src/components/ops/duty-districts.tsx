"use client";

import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { setDutyDistricts } from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { DUTY_DISTRICTS, DUTY_SHORT } from "@/lib/ops/log";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "csm-districts-plus-tard";

function DutyDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: string[];
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
export function DutyChip({ districts, today }: { districts: string[]; today: boolean }) {
  const [open, setOpen] = useState(false);
  const set = today && districts.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="duty-chip"
        className={cn(
          "inline-flex h-control-sm shrink-0 cursor-pointer items-center gap-1.5 border px-2.5 text-small transition-colors",
          set
            ? "border-border-strong text-fg hover:border-fg-muted"
            : "border-warn bg-[color-mix(in_oklab,var(--warn)_12%,var(--surface))] text-fg",
        )}
        title="Districts où je travaille aujourd'hui"
      >
        <MapPin aria-hidden className="size-3.5" />
        {set ? districts.map((d) => DUTY_SHORT[d] ?? d).join(" · ") : "Mes districts du jour ?"}
      </button>
      <DutyDialog open={open} onOpenChange={setOpen} initial={today ? districts : []} />
    </>
  );
}

/**
 * Bandeau du matin (non bloquant) : tant que l'agent n'a pas coché ses districts du jour. « Plus tard » le masque
 * jusqu'au lendemain (navigateur seulement).
 */
export function DutyBanner({ day, initial }: { day: string; initial: string[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(true);
  const [picked, setPicked] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === day) return;
    } catch {}
    setHidden(false);
  }, [day]);
  if (hidden) return null;
  const later = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, day);
    } catch {}
  };
  return (
    <div
      role="region"
      aria-label="Districts du jour"
      data-testid="duty-banner"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-accent-faint px-4 py-2 md:px-6"
    >
      <span className="inline-flex items-center gap-1.5 text-small font-medium text-fg">
        <MapPin aria-hidden className="size-4 text-accent" /> Où travailles-tu aujourd&apos;hui ?
      </span>
      <span className="flex flex-wrap gap-1.5">
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
                "h-control-sm min-w-11 cursor-pointer border px-3 text-small transition-colors",
                on
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-border-strong bg-surface text-fg-muted hover:text-fg",
              )}
              title={d}
            >
              {DUTY_SHORT[d]} <span className="max-sm:hidden">· {d}</span>
            </button>
          );
        })}
      </span>
      <span className="ml-auto flex gap-1.5">
        <Button size="sm" variant="ghost" onClick={later}>
          Plus tard
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={pending || !picked.length}
          data-testid="duty-save"
          onClick={() =>
            start(async () => {
              const res = await setDutyDistricts(picked);
              if (!res.ok) return void toast.error(res.error);
              toast.success(`Districts du jour : ${picked.map((d) => DUTY_SHORT[d]).join(", ")}.`);
              setHidden(true);
              router.refresh();
            })
          }
        >
          Valider
        </Button>
      </span>
    </div>
  );
}
