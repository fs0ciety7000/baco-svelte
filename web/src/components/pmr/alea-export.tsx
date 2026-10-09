"use client";

import { ClipboardList, Copy, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { aleaDwell } from "@/app/(app)/pmr/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { safeCall } from "@/lib/orders/safe-call";
import { formatDay } from "@/lib/orders/time";
import { aleaDecision, type AleaDecision, type AleaDwell, type AleaGroup } from "@/lib/pmr/model";
import { cn } from "@/lib/utils";

import { CopyButton, copyLabel } from "./copy";

const DECISION: Record<AleaDecision["status"], { label: string; tone: "danger" | "ok" | "warn" }> =
  {
    obligatoire: { label: "Obligatoire", tone: "danger" },
    non: { label: "Non obligatoire", tone: "ok" },
    verifier: { label: "À vérifier", tone: "warn" },
  };

type Filter = "tous" | "obligatoire" | "verifier";

const verbOf = (g: AleaGroup) => (g.io === "IN" ? "Embarquement" : "Débarquement");
const headOf = (g: AleaGroup) =>
  `${formatDay(g.day)} · ${g.train} · ${g.station}${g.time ? ` (${g.time})` : ""} · ${verbOf(g)}`;

/**
 * Bouton « Export ALEA » + modale (demande du 9 oct. 2026). Un bloc par train, jour, gare et sens ; les PMR (ou les
 * groupes) de tous les dossiers y sont additionnées ; l'en-tête dit quels dossiers composent le bloc et le total ;
 * « Obligatoire » suit les logigrammes d'encodage (temps d'arrêt prévu lu dans l'horaire iRail). Partagé PMR / groupes.
 */
export function AleaButton({
  disabled,
  eyebrow,
  description,
  compute,
}: {
  disabled: boolean;
  eyebrow: string;
  description: string;
  compute: () => AleaGroup[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("tous");
  const [dwell, setDwell] = useState<Record<string, AleaDwell> | null>(null);
  const [dwellError, setDwellError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (open ? compute() : []), [open]);

  // Temps d'arrêt prévus (iRail, côté serveur), une fois à l'ouverture.
  useEffect(() => {
    if (!open || !groups.length) return;
    let cancelled = false;
    setDwell(null);
    setDwellError(null);
    void safeCall(
      aleaDwell(
        groups.map((g) => ({ key: g.key, day: g.day, train: g.train, station: g.station })),
      ),
    ).then((res) => {
      if (cancelled) return;
      if (res.ok) setDwell(res.data);
      else {
        setDwellError(res.error);
        setDwell({});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, groups]);

  const decided = groups.map((g) => ({
    g,
    d: dwell
      ? aleaDecision(g.rule, dwell[g.key] ?? { seconds: null, position: "unknown" })
      : aleaDecision(g.rule, undefined),
  }));
  const count = (s: AleaDecision["status"]) => decided.filter((x) => x.d.status === s).length;
  const shown = decided.filter((x) => filter === "tous" || x.d.status === filter);
  const blockText = (g: AleaGroup) => [headOf(g), ...g.lines].join("\n");
  const unit = groups[0]?.unit ?? "PMR";

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>
        <ClipboardList aria-hidden /> Export ALEA
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          eyebrow={eyebrow}
          title="Export ALEA"
          description={description}
          className="max-h-[92dvh] max-w-5xl"
        >
          {groups.length === 0 ? (
            <EmptyState
              title="Rien à exporter"
              description="Aucune assistance prévue dans la liste affichée."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtre">
                {(
                  [
                    ["tous", `Tous (${groups.length})`],
                    ["obligatoire", `Obligatoires (${count("obligatoire")})`],
                    ["verifier", `À vérifier (${count("verifier")})`],
                  ] as const
                ).map(([k, label]) => (
                  <Button
                    key={k}
                    size="sm"
                    variant={filter === k ? "primary" : "ghost"}
                    className={filter === k ? "" : "border border-border"}
                    aria-pressed={filter === k}
                    onClick={() => setFilter(k)}
                  >
                    {label}
                  </Button>
                ))}
                <span className="ml-auto inline-flex items-center gap-1.5 text-small text-fg-muted">
                  {!dwell ? (
                    <>
                      <Loader2 aria-hidden className="size-3.5 animate-spin" /> Lecture des temps
                      d&apos;arrêt (iRail)…
                    </>
                  ) : dwellError ? (
                    <span className="text-warn">
                      Temps d&apos;arrêt indisponibles : {dwellError}
                    </span>
                  ) : (
                    "Temps d'arrêt prévus : horaire iRail"
                  )}
                </span>
              </div>
              <ul className="flex flex-col gap-3" data-testid="alea-groups">
                {shown.map(({ g, d }) => (
                  <li
                    key={g.key}
                    className={cn(
                      "flex flex-col border border-border bg-surface",
                      d.status === "obligatoire" && "border-l-[3px] border-l-danger",
                      d.status === "verifier" && "border-l-[3px] border-l-warn",
                    )}
                    data-testid="alea-block"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface-2 px-3 py-2">
                      <span
                        className="bg-accent px-2 py-0.5 font-mono text-body-lg font-bold text-accent-fg tabular"
                        title="Train"
                      >
                        {g.train}
                      </span>
                      <span className="text-body-lg font-bold text-fg">{g.station}</span>
                      <Badge tone={g.io === "IN" ? "info" : "ok"}>
                        {g.io} · {verbOf(g)}
                      </Badge>
                      <span className="text-small text-fg-muted">
                        <span className="first-letter:uppercase">{formatDay(g.day)}</span>
                        {g.time ? <span className="font-mono tabular"> · {g.time}</span> : null}
                      </span>
                      <span className="ml-auto inline-flex items-center gap-2">
                        <Badge tone={dwell ? DECISION[d.status].tone : "neutral"}>
                          {dwell ? DECISION[d.status].label : "…"}
                        </Badge>
                        <CopyButton text={g.lines.join("\n")} />
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 px-3 py-2">
                      <p
                        className={cn(
                          "text-small",
                          d.status === "obligatoire"
                            ? "text-danger"
                            : d.status === "verifier"
                              ? "text-warn"
                              : "text-fg-muted",
                        )}
                      >
                        {d.reason}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-small">
                        <span className="font-medium text-fg">
                          {g.dossiers.length > 1
                            ? `${g.dossiers.length} dossiers composent cet ALEA :`
                            : "Dossier :"}
                        </span>
                        {g.dossiers.map((x) => (
                          <span
                            key={x.ref}
                            className="border border-border bg-surface-2 px-1.5 py-0.5 font-mono tabular"
                          >
                            {x.ref} · {x.count} {unit === "PMR" ? "PMR" : "pers."}
                          </span>
                        ))}
                        <span className="font-semibold text-fg">
                          Total : {g.total}{" "}
                          {unit === "PMR" ? "PMR" : g.total > 1 ? "personnes" : "personne"}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 border-l-2 border-accent pl-3">
                        {g.lines.map((line, i) => (
                          <p key={i} className="text-body font-medium text-fg select-text">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
                {shown.length === 0 ? (
                  <li className="text-small text-fg-muted">Aucun bloc pour ce filtre.</li>
                ) : null}
              </ul>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button
              variant="secondary"
              disabled={!count("obligatoire")}
              onClick={() =>
                void copyLabel(
                  decided
                    .filter((x) => x.d.status === "obligatoire")
                    .map((x) => blockText(x.g))
                    .join("\n\n"),
                )
              }
            >
              <Copy aria-hidden /> Copier les obligatoires
            </Button>
            <Button
              variant="primary"
              disabled={!groups.length}
              onClick={() => void copyLabel(groups.map(blockText).join("\n\n"))}
            >
              <Copy aria-hidden /> Tout copier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
