"use client";

import { ArrowUpRight, History, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { saveB201 } from "@/app/(app)/commandes/actions";
import { KindIconClient } from "@/components/orders/kind-icon";
import { ChatMarkdown } from "@/components/ops/chat-markdown";
import { MarkdownEditor } from "@/components/ops/markdown-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AutosaveIndicator } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { TimeField } from "@/components/ui/time-field";
import { B201_NOTES_MAX } from "@/lib/ops/b201";
import { PERIODS, type Period } from "@/lib/orders/time";
import { useAutosave } from "@/lib/orders/use-autosave";
import { cn, pl } from "@/lib/utils";
import type { B201Entry, ManualEntry, Service } from "@/server/data/b201";

const SERVICES: { id: Service; label: string }[] = [
  { id: "bus", label: "Bus" },
  { id: "taxi", label: "Taxis" },
  { id: "taxi_pmr", label: "Taxis PMR" },
];

const newId = () => Math.random().toString(36).slice(2, 12).padEnd(8, "0");

const hm = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
});
const pbTime = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? "" : hm.format(d);
};

export type B201Version = { at: string; by: string; byName: string; content: string };

/**
 * B201 du jour (Opérations › B201, 15 oct. 2026) : notes et commentaires en Markdown (remplacent les commentaires par
 * période de l'ancienne remise) et transports du jour (commandes en lecture + saisies hors outil). Une seule fiche par
 * jour : notes et saisies manuelles partent ensemble, enregistrées automatiquement (verrou optimiste `updated`).
 */
export function B201Board({
  day,
  entries,
  initialManual,
  initialContent,
  updated,
  updatedByName,
  versions,
  reportId,
  canWrite,
  me,
}: {
  day: string;
  entries: B201Entry[];
  initialManual: ManualEntry[];
  initialContent: string;
  updated: string | null;
  updatedByName: string;
  versions: B201Version[];
  reportId: string | null;
  canWrite: boolean;
  me: string;
}) {
  const [content, setContent] = useState(initialContent);
  const [manual, setManual] = useState(initialManual);
  const [tab, setTab] = useState<Period>("matin");
  const value = useMemo(() => ({ content, manual }), [content, manual]);
  const save = useCallback(
    async (
      _id: string | null,
      v: { content: string; manual: ManualEntry[] },
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
  const { state, savedAt, error, rebase, isDirty, version } = autosave;

  // B201 enregistrée ailleurs (temps réel) : reprise de la version distante seulement si rien n'est en cours ici.
  useEffect(() => {
    if (!updated || updated === version() || isDirty()) return;
    rebase(updated, { content: initialContent, manual: initialManual });
    setContent(initialContent);
    setManual(initialManual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updated]);

  // Auteur de la dernière modification : moi après mon propre enregistrement, sinon celui de la fiche.
  const lastBy = savedAt ? me : updatedByName;
  const lastAt = savedAt ? hm.format(savedAt) : pbTime(updated);

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
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="b201-notes-title"
        className="flex min-w-0 flex-col gap-3 rounded-box border border-border bg-surface p-4"
        data-testid="b201-notes"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="b201-notes-title" className="scroll-mt-20 text-h3 font-semibold text-fg">
            Notes et commentaires du jour
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            {lastAt ? (
              <span className="text-small text-fg-muted" data-testid="b201-last-edit">
                Modifié à <span className="font-mono tabular">{lastAt}</span>
                {lastBy ? ` par ${lastBy}` : ""}
              </span>
            ) : null}
            {canWrite ? (
              <AutosaveIndicator state={state} savedAt={savedAt} />
            ) : (
              <span className="label-mono text-fg-muted">Lecture seule</span>
            )}
            <Versions
              versions={versions}
              canRestore={canWrite}
              onRestore={(c) => setContent(c.slice(0, B201_NOTES_MAX))}
            />
          </div>
        </div>
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger/60 px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        ) : null}
        <MarkdownEditor
          value={content}
          onChange={setContent}
          maxLength={B201_NOTES_MAX}
          label="Notes et commentaires du jour"
          placeholder={
            "### Matin\n- Bus Mons → Quévy : chauffeur prévenu\n\n### Pour le service suivant\n- **Rappeler** le dépôt avant 14 h"
          }
          readOnly={!canWrite}
        />
      </section>

      <section aria-labelledby="b201-transports-title" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="b201-transports-title" className="scroll-mt-20 text-h3 font-semibold text-fg">
            Transports du jour
          </h2>
          <div
            role="tablist"
            aria-label="Périodes"
            className="flex w-full gap-1.5 overflow-x-auto md:hidden"
          >
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={tab === p.id}
                onClick={() => setTab(p.id)}
                className={cn(
                  "h-11 shrink-0 cursor-pointer rounded-control border px-3 text-body",
                  tab === p.id ? "border-accent text-fg" : "border-border text-fg-muted",
                )}
              >
                {p.label}
                <span className="ml-1.5 font-mono text-small tabular">{groups[p.id].length}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {PERIODS.map((p) => (
            <section
              key={p.id}
              aria-labelledby={`b201-${p.id}`}
              className={cn(
                "min-w-0 flex-col gap-3 rounded-box border border-border bg-surface p-4 md:flex",
                tab === p.id ? "flex" : "hidden",
              )}
              data-testid={`b201-${p.id}`}
            >
              <h3 id={`b201-${p.id}`} className="flex items-baseline justify-between gap-2">
                <span className="text-body-lg font-semibold text-fg">{p.label}</span>
                <span className="label-mono text-fg-muted">{p.range}</span>
              </h3>
              {SERVICES.map((s) => {
                const list = groups[p.id].filter((e) => e.service === s.id);
                return (
                  <div key={s.id} className="flex flex-col gap-1.5">
                    <h4 className="label-mono text-fg-muted">
                      {s.label} <span className="tabular">({list.length})</span>
                    </h4>
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
                              className="flex min-h-11 items-center gap-2 rounded-control border border-border px-2 py-1.5 hover:bg-surface-2"
                            >
                              <KindIconClient
                                kind={e.kind ?? "bus"}
                                pmr={e.service === "taxi_pmr"}
                              />
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
                              <ArrowUpRight
                                aria-hidden
                                className="size-3.5 shrink-0 text-fg-muted"
                              />
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
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Versions du jour (gardées par le serveur : auteur différent, ou toutes les 10 min), restaurables. */
function Versions({
  versions,
  canRestore,
  onRestore,
}: {
  versions: B201Version[];
  canRestore: boolean;
  onRestore: (content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!versions.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid="b201-versions">
          <History aria-hidden /> {versions.length} {pl(versions.length, "version")}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Versions du jour"
        description="État des notes avant chaque changement d'auteur (et toutes les 10 minutes au plus)."
        className="max-w-2xl"
      >
        <ol className="flex flex-col gap-3">
          {versions.map((v, i) => (
            <li
              key={`${v.at}-${i}`}
              className="flex flex-col gap-2 rounded-control border border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-small text-fg-muted">
                  <span className="font-mono tabular text-fg">{pbTime(v.at) || "—"}</span>
                  {v.byName ? ` · ${v.byName}` : ""}
                </span>
                {canRestore ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      onRestore(v.content);
                      setOpen(false);
                    }}
                  >
                    <RotateCcw aria-hidden /> Reprendre ce texte
                  </Button>
                ) : null}
              </div>
              <div className="max-h-48 overflow-auto">
                <ChatMarkdown body={v.content} className="text-small" />
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
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
      className="flex flex-col gap-2 rounded-control border border-dashed border-border-strong p-2"
    >
      <legend className="label-mono px-1 text-fg-muted">Saisie manuelle</legend>
      <div className="grid grid-cols-2 gap-2">
        <Select
          aria-label="Service"
          label="Service"
          value={entry.service}
          onValueChange={(v) => v && onChange({ service: v as Service })}
          options={SERVICES.map((s) => ({ value: s.id, label: s.label }))}
        />
        <TimeField
          aria-label="Heure"
          value={entry.time}
          onValueChange={(v) => onChange({ time: v })}
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
