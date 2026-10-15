"use client";

import { AlertTriangle } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimeField } from "@/components/ui/time-field";
import { hhmm, parseTaskLines, type ParsedTask } from "@/lib/planner";
import { PMR_TYPE_LABEL } from "@/lib/planner/board";
import type { StationRef } from "@/lib/stations/search";
import { cn, pl } from "@/lib/utils";
import type { ManualTaskInput } from "@/app/(app)/pmr/planificateur/actions";

// « Ajouter une tâche » : collage de lignes au format ALEA / classeurs (analyse en direct dans le navigateur, seuls les
// champs analysés partent au serveur : jamais le texte brut, ni nom ni téléphone) ou tâche libre (technique, autre).

const EXAMPLE = "1MR 10h16 5010 IN de Mons à Tournai n°2026-10-15-0005";

const ms = (iso: string) => Date.parse(iso);

/** Ligne analysée → champs envoyés à `createManualTasks` (heure du train en début ET fin : fenêtre calculée à l'affichage). */
export function parsedToInput(t: ParsedTask): ManualTaskInput {
  const at = t.trainAt ?? t.start;
  return {
    kind: t.kind,
    start: at,
    end: at,
    station: t.station,
    other_station: t.otherStation ?? "",
    train: t.train ?? "",
    pmr_type: (["NV", "MR", "DCO", "CRF", "CRE", "CRP"].includes(t.pmrType ?? "")
      ? t.pmrType
      : "") as ManualTaskInput["pmr_type"],
    pax: Math.min(50, Math.max(1, t.pax || 1)),
    light: t.light,
    dossier: t.dossier ?? "",
    label: "",
  };
}

export function AddTaskDialog({
  open,
  onOpenChange,
  day,
  stations,
  stationOptions,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  day: string;
  stations: StationRef[];
  stationOptions: string[];
  busy: boolean;
  onSubmit: (lines: ManualTaskInput[]) => Promise<boolean>;
}) {
  const [tab, setTab] = React.useState("alea");
  const [text, setText] = React.useState("");
  const parsed = React.useMemo(
    () => (text.trim() ? parseTaskLines(text, { day, stations }) : null),
    [text, day, stations],
  );
  const [free, setFree] = React.useState({
    kind: "technique" as "technique" | "autre",
    label: "",
    station: "",
    start: "",
    end: "",
    train: "",
  });
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    if (!open) {
      setText("");
      setError("");
      setFree({ kind: "technique", label: "", station: "", start: "", end: "", train: "" });
    }
  }, [open]);

  const errorsByLine = new Map<number, string[]>();
  const warnsByLine = new Map<number, string[]>();
  for (const e of parsed?.errors ?? []) {
    const m = e.level === "error" ? errorsByLine : warnsByLine;
    m.set(e.line, [...(m.get(e.line) ?? []), e.message]);
  }
  const lines = text.split(/\r?\n/);
  const okCount = parsed?.tasks.length ?? 0;

  const submitAlea = async () => {
    if (!parsed?.tasks.length) return;
    const ok = await onSubmit(parsed.tasks.map(parsedToInput));
    if (ok) onOpenChange(false);
  };
  const submitFree = async () => {
    if (!free.label.trim()) return setError("Donne un libellé à la tâche.");
    if (!free.start) return setError("Indique l'heure de début.");
    setError("");
    const ok = await onSubmit([
      {
        kind: free.kind,
        start: free.start,
        end: free.end || free.start,
        station: free.station,
        other_station: "",
        train: free.train,
        pmr_type: "",
        pax: 0,
        light: false,
        dossier: "",
        label: free.label.trim(),
      },
    ]);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Ajouter une tâche"
        description="Les prises en charge arrivent de DICOS ; ajoute ici ce qui manque. Les tâches ajoutées vont dans « À attribuer »."
        className="max-w-3xl"
        data-testid="add-task"
      >
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="alea">Prise en charge (ligne ALEA / Excel)</TabsTrigger>
            <TabsTrigger value="libre">Tâche libre</TabsTrigger>
          </TabsList>
          <TabsContent value="alea" className="flex flex-col gap-3 pt-3">
            <Field
              label="Colle ou tape une ligne par prise en charge"
              hint="Format : nombre+type heure n°train IN|OUT de gare à gare n°dossier. IN = embarquement à la gare de départ, OUT = débarquement à l'arrivée. Nom et téléphone éventuels sont ignorés."
            >
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-base md:text-small"
                data-testid="add-task-text"
              />
            </Field>
            <div>
              <Button
                variant="link"
                size="sm"
                type="button"
                onClick={() => setText((v) => (v.trim() ? `${v.trimEnd()}\n${EXAMPLE}` : EXAMPLE))}
              >
                Coller un exemple
              </Button>
            </div>
            {parsed ? (
              <ol className="flex flex-col gap-2" aria-live="polite" data-testid="add-task-preview">
                {parsed.ignoredPersonal ? (
                  <li className="rounded-box border border-border bg-surface-2 p-2 text-small text-fg-muted">
                    Nom et téléphone ignorés : le n° de dossier suffit.
                  </li>
                ) : null}
                {lines.map((raw, i) => {
                  const n = i + 1;
                  if (!raw.trim()) return null;
                  const task = parsed.tasks.find((t) => t.line === n);
                  const errs = errorsByLine.get(n) ?? [];
                  const warns = warnsByLine.get(n) ?? [];
                  return (
                    <li
                      key={n}
                      className={cn(
                        "flex flex-col gap-1 rounded-box border border-l-[3px] p-2.5 text-small",
                        errs.length
                          ? "border-danger/50 border-l-danger"
                          : "border-border border-l-ok",
                      )}
                      data-testid="add-task-line"
                    >
                      <p className="font-mono text-label text-fg-muted">Ligne {n}</p>
                      {task ? (
                        <p className="flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            Assistance{" "}
                            <b>{task.types.map((x) => `${x.count} ${x.type}`).join(" + ")}</b>
                            {task.pmrType && PMR_TYPE_LABEL[task.pmrType]
                              ? ` · ${PMR_TYPE_LABEL[task.pmrType]}`
                              : ""}
                          </span>
                          <span>
                            Train à{" "}
                            <b className="font-mono">{hhmm(ms(task.trainAt ?? task.start))}</b>
                          </span>
                          <span>
                            N° <b className="font-mono">{task.train ?? "TAXI"}</b>
                          </span>
                          <span>
                            <b>{task.kind === "pmr_in" ? "IN" : "OUT"}</b>{" "}
                            {task.kind === "pmr_in" ? "embarquement" : "débarquement"}
                          </span>
                          <span>
                            Gare assistée <b>{task.station}</b>
                          </span>
                          {task.otherStation ? (
                            <span>
                              Autre gare <b>{task.otherStation}</b>
                            </span>
                          ) : null}
                          {task.dossier ? (
                            <span>
                              Dossier <b className="font-mono">{task.dossier}</b>
                            </span>
                          ) : null}
                          <span>
                            Fenêtre{" "}
                            <b className="font-mono">
                              {hhmm(ms(task.start))}–{hhmm(ms(task.end))}
                            </b>
                          </span>
                          {!task.train ? (
                            <span className="text-fg-muted">
                              Taxi : à attribuer au taxi après l&apos;ajout.
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {errs.map((e) => (
                        <p key={e} className="flex items-center gap-1.5 text-danger">
                          <AlertTriangle aria-hidden className="size-3.5" /> {e}
                        </p>
                      ))}
                      {warns.map((e) => (
                        <p key={e} className="text-warn">
                          {e}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={submitAlea}
                disabled={!okCount || busy}
                loading={busy}
                data-testid="add-task-submit"
              >
                Ajouter {okCount} {pl(okCount, "tâche")}
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="libre" className="flex flex-col gap-3 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <Select
                  value={free.kind}
                  onValueChange={(v) => v && setFree((f) => ({ ...f, kind: v }))}
                  options={[
                    { value: "technique", label: "Technique (EDF, Ao/Bo, accouplement…)" },
                    { value: "autre", label: "Autre (affiche, mission…)" },
                  ]}
                />
              </Field>
              <Field label="Libellé" required>
                <Input
                  value={free.label}
                  onChange={(e) => setFree((f) => ({ ...f, label: e.target.value }))}
                  maxLength={300}
                  data-testid="free-label"
                />
              </Field>
              <Field label="Gare">
                <Combobox
                  value={free.station}
                  onValueChange={(v) => setFree((f) => ({ ...f, station: v }))}
                  allowFree
                  openOnFocus
                  options={stationOptions.map((s) => ({ value: s, label: s }))}
                  placeholder="Gare de la tâche"
                  maxLength={80}
                />
              </Field>
              <Field label="N° de train (facultatif)">
                <Input
                  value={free.train}
                  onChange={(e) => setFree((f) => ({ ...f, train: e.target.value }))}
                  maxLength={20}
                  inputMode="text"
                />
              </Field>
              <Field label="Début" required>
                <TimeField
                  value={free.start}
                  onValueChange={(v) => setFree((f) => ({ ...f, start: v }))}
                />
              </Field>
              <Field label="Fin">
                <TimeField
                  value={free.end}
                  onValueChange={(v) => setFree((f) => ({ ...f, end: v }))}
                />
              </Field>
            </div>
            {error ? (
              <p role="alert" className="text-small text-danger">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button
                variant="primary"
                type="button"
                onClick={submitFree}
                disabled={busy}
                loading={busy}
                data-testid="free-submit"
              >
                Ajouter la tâche
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
