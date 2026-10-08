"use client";

import { ArrowUpRight, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { saveB201 } from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { AutosaveIndicator } from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { PERIODS, type Period } from "@/lib/orders/time";
import { useAutosave } from "@/lib/orders/use-autosave";
import { cn } from "@/lib/utils";
import type { B201Entry, B201Notes, ManualEntry, Service } from "@/server/data/b201";

import { KindIconClient } from "./kind-icon";

const SERVICES: { id: Service; label: string }[] = [
  { id: "bus", label: "Bus" },
  { id: "taxi", label: "Taxis" },
  { id: "taxi_pmr", label: "Taxis PMR" },
];

const newId = () => Math.random().toString(36).slice(2, 12).padEnd(8, "0");

/**
 * Remise B201 : transports remplis depuis les commandes (lecture, lien vers la commande), saisie manuelle
 * pour un transport hors outil, commentaires par période et pour le service suivant, enregistrés
 * automatiquement (verrou optimiste). Mobile : périodes en onglets.
 */
export function B201Editor({
  day,
  entries,
  initialManual,
  initialNotes,
  updated,
  reportId,
  canWrite,
}: {
  day: string;
  entries: B201Entry[];
  initialManual: ManualEntry[];
  initialNotes: B201Notes;
  updated: string | null;
  reportId: string | null;
  canWrite: boolean;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [manual, setManual] = useState(initialManual);
  const [tab, setTab] = useState<Period | "suivant">("matin");
  const value = useMemo(() => ({ notes, manual }), [notes, manual]);
  // Même mécanique que les commandes : requêtes sérialisées, verrou optimiste, erreurs réseau rattrapées.
  const save = useCallback(
    async (
      _id: string | null,
      v: { notes: B201Notes; manual: ManualEntry[] },
      expected?: string,
    ) => {
      const res = await saveB201({ day, ...v, expectedUpdated: expected ?? null });
      return res.ok ? { ok: true as const, data: { ...res.data, number: 0 } } : res;
    },
    [day],
  );
  const autosave = useAutosave({
    value,
    enabled: canWrite,
    initialId: reportId,
    initialUpdated: updated,
    save,
  });
  const { state, savedAt, error, rebase } = autosave;

  // B201 enregistrée ailleurs (temps réel) : reprise de la version distante seulement si rien n'est en cours ici.
  const { isDirty, version } = autosave;
  useEffect(() => {
    if (!updated || updated === version() || isDirty()) return;
    rebase(updated, { notes: initialNotes, manual: initialManual });
    setNotes(initialNotes);
    setManual(initialManual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updated]);

  const groups = useMemo(() => {
    const all = [
      ...entries,
      ...manual.map((m) => ({ ...m, key: `manuel-${m.id}`, district: "" }) as B201Entry),
    ];
    return Object.fromEntries(
      PERIODS.map((p) => [
        p.id,
        all.filter((e) => e.period === p.id).sort((a, b) => a.time.localeCompare(b.time)),
      ]),
    ) as Record<Period, B201Entry[]>;
  }, [entries, manual]);

  const addManual = (period: Period) =>
    setManual((m) => [
      ...m,
      {
        id: newId(),
        period,
        service: "bus",
        time: "",
        company: "",
        origin: "",
        destination: "",
        ref: "",
      },
    ]);
  const setRow = (id: string, patch: Partial<ManualEntry>) =>
    setManual((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="tablist"
          aria-label="Périodes"
          className="flex w-full gap-1.5 overflow-x-auto md:hidden"
        >
          {[...PERIODS, { id: "suivant" as const, label: "Suivant", range: "" }].map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={tab === p.id}
              onClick={() => setTab(p.id)}
              className={cn(
                "h-11 shrink-0 cursor-pointer border px-3 text-body",
                tab === p.id ? "border-accent text-fg" : "border-border text-fg-muted",
              )}
            >
              {p.label}
              {p.id !== "suivant" ? (
                <span className="ml-1.5 font-mono text-small tabular">{groups[p.id].length}</span>
              ) : null}
            </button>
          ))}
        </div>
        {canWrite ? (
          <AutosaveIndicator state={state} savedAt={savedAt} />
        ) : (
          <span className="label-mono text-fg-muted">Lecture seule</span>
        )}
      </div>
      {error ? (
        <p role="alert" className="border border-danger/60 px-3 py-2 text-body text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {PERIODS.map((p) => (
          <section
            key={p.id}
            aria-labelledby={`b201-${p.id}`}
            className={cn(
              "min-w-0 flex-col gap-3 border border-border bg-surface p-4 md:flex",
              tab === p.id ? "flex" : "hidden",
            )}
            data-testid={`b201-${p.id}`}
          >
            <h2 id={`b201-${p.id}`} className="flex items-baseline justify-between gap-2">
              <span className="display text-h3 text-fg">{p.label}</span>
              <span className="label-mono text-fg-muted">{p.range}</span>
            </h2>
            {SERVICES.map((s) => {
              const list = groups[p.id].filter((e) => e.service === s.id);
              return (
                <div key={s.id} className="flex flex-col gap-1.5">
                  <h3 className="label-mono text-fg-muted">
                    {s.label} <span className="tabular">({list.length})</span>
                  </h3>
                  {list.length === 0 ? <p className="text-small text-fg-muted">—</p> : null}
                  <ul className="flex flex-col gap-1.5">
                    {list.map((e) =>
                      e.orderId ? (
                        <li key={e.key}>
                          <Link
                            href={
                              e.kind === "bus"
                                ? `/commandes/bus/${e.orderId}`
                                : `/commandes/taxi/${e.orderId}`
                            }
                            className="flex min-h-11 items-center gap-2 border border-border px-2 py-1.5 hover:bg-surface-2"
                          >
                            <KindIconClient kind={e.kind ?? "bus"} pmr={e.service === "taxi_pmr"} />
                            <span className="font-mono text-small tabular">
                              {e.time || "--:--"}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-small">
                              {e.origin || "?"} → {e.destination || "?"}
                              <span className="text-fg-muted"> · {e.company || "?"}</span>
                            </span>
                            {e.status ? (
                              <StatusBadge status={e.status} className="hidden sm:inline-flex" />
                            ) : null}
                            <ArrowUpRight aria-hidden className="size-3.5 shrink-0 text-fg-muted" />
                          </Link>
                        </li>
                      ) : (
                        <li key={e.key}>
                          <ManualRow
                            entry={manual.find((m) => `manuel-${m.id}` === e.key)!}
                            canWrite={canWrite}
                            onChange={(patch) => setRow(e.key.slice(7), patch)}
                            onRemove={() =>
                              setManual((m) => m.filter((x) => `manuel-${x.id}` !== e.key))
                            }
                          />
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              );
            })}
            {canWrite ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => addManual(p.id)}
              >
                <Plus aria-hidden /> Transport hors outil
              </Button>
            ) : null}
            <Field label="Commentaires de la période">
              <Textarea
                value={notes[p.id]}
                onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                readOnly={!canWrite}
                maxLength={5000}
                className="field-sizing-content"
              />
            </Field>
          </section>
        ))}
      </div>
      <section
        aria-labelledby="b201-suivant"
        className={cn(
          "flex-col gap-3 border border-border bg-surface p-4 md:flex",
          tab === "suivant" ? "flex" : "hidden",
        )}
      >
        <h2 id="b201-suivant" className="display text-h3 text-fg">
          Pour le service suivant
        </h2>
        <Textarea
          aria-labelledby="b201-suivant"
          value={notes.suivant}
          onChange={(e) => setNotes((n) => ({ ...n, suivant: e.target.value }))}
          readOnly={!canWrite}
          maxLength={5000}
          className="field-sizing-content"
        />
      </section>
    </div>
  );
}

function ManualRow({
  entry,
  canWrite,
  onChange,
  onRemove,
}: {
  entry: ManualEntry;
  canWrite: boolean;
  onChange: (p: Partial<ManualEntry>) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset
      disabled={!canWrite}
      className="flex flex-col gap-2 border border-dashed border-border-strong p-2"
    >
      <legend className="label-mono px-1 text-fg-muted">Saisie manuelle</legend>
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Service"
          value={entry.service}
          onChange={(e) => onChange({ service: e.target.value as Service })}
        >
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Heure"
          type="time"
          value={entry.time}
          onChange={(e) => onChange({ time: e.target.value })}
        />
        <Input
          aria-label="Origine"
          placeholder="Origine"
          value={entry.origin}
          onChange={(e) => onChange({ origin: e.target.value })}
          maxLength={200}
        />
        <Input
          aria-label="Destination"
          placeholder="Destination"
          value={entry.destination}
          onChange={(e) => onChange({ destination: e.target.value })}
          maxLength={200}
        />
        <Input
          aria-label="Société"
          placeholder="Société"
          value={entry.company}
          onChange={(e) => onChange({ company: e.target.value })}
          maxLength={200}
        />
        <Input
          aria-label="Référence"
          placeholder="Relation / dossier"
          value={entry.ref}
          onChange={(e) => onChange({ ref: e.target.value })}
          maxLength={200}
        />
      </div>
      {canWrite ? (
        <Button type="button" variant="ghost" size="sm" className="self-end" onClick={onRemove}>
          <Trash2 aria-hidden /> Retirer
        </Button>
      ) : null}
    </fieldset>
  );
}
