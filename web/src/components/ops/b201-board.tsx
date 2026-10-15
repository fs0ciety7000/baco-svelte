"use client";

import { ArrowUpRight, History, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { saveB201, saveB201Notes } from "@/app/(app)/commandes/actions";
import { KindIconClient } from "@/components/orders/kind-icon";
import { ChatMarkdown } from "@/components/ops/chat-markdown";
import { MarkdownEditor } from "@/components/ops/markdown-editor";
import { CopyIcon, useCopy } from "@/components/pmr/copy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { AutosaveIndicator } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { TimeField } from "@/components/ui/time-field";
import {
  B201_DISTRICT_LABEL,
  B201_NOTES_MAX,
  COMMON_NOTES_TITLE,
  type B201District,
} from "@/lib/ops/b201";
import { PERIODS, type Period } from "@/lib/orders/time";
import { useAutosave } from "@/lib/orders/use-autosave";
import { cn, pl } from "@/lib/utils";
import type { B201Entry, DistrictNotes, ManualEntry, Service } from "@/server/data/b201";

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
 * B201 du jour (Opérations › B201, 15 oct. 2026) : notes et commentaires en Markdown **par district** (une fiche par jour
 * et par district, chacune avec son enregistrement automatique, son verrou optimiste, son auteur et ses versions) et
 * transports du jour (commandes en lecture + saisies hors outil, fiche du jour). Plusieurs districts : éditeurs l'un sous
 * l'autre en desktop (vue d'ensemble), en onglets sous 768 px. Les notes écrites avant le 15 oct. (sans district) restent
 * affichées en lecture seule, une fois, au-dessus.
 */
export function B201Board({
  day,
  entries,
  initialManual,
  updated,
  reportId,
  notes,
  common,
  commonByName,
  canWrite,
  me,
}: {
  day: string;
  entries: B201Entry[];
  initialManual: ManualEntry[];
  updated: string | null;
  reportId: string | null;
  notes: DistrictNotes[];
  common: string;
  commonByName: string;
  canWrite: boolean;
  me: string;
}) {
  const [manual, setManual] = useState(initialManual);
  const [tab, setTab] = useState<Period>("matin");
  const [noteTab, setNoteTab] = useState<B201District | undefined>(notes[0]?.district);
  const activeNote = notes.some((n) => n.district === noteTab) ? noteTab : notes[0]?.district;
  const save = useCallback(
    async (_id: string | null, v: ManualEntry[], expected?: string) => {
      const res = await saveB201({ day, manual: v, expectedUpdated: expected ?? null });
      return res.ok ? { ok: true as const, data: { ...res.data, number: 0 } } : res;
    },
    [day],
  );
  const autosave = useAutosave({
    value: manual,
    enabled: canWrite,
    initialId: reportId,
    initialUpdated: updated,
    save,
  });
  const { state, savedAt, error, rebase, isDirty, version } = autosave;

  // Fiche du jour enregistrée ailleurs (temps réel) : reprise de la version distante si rien n'est en cours ici.
  useEffect(() => {
    if (!updated || updated === version() || isDirty()) return;
    rebase(updated, initialManual);
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
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="b201-notes-title"
        className="flex min-w-0 flex-col gap-4"
        data-testid="b201-notes"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="b201-notes-title" className="scroll-mt-20 text-h3 font-semibold text-fg">
            Notes et commentaires du jour
          </h2>
          <p className="text-small text-fg-muted">
            {notes.length > 1
              ? `Une page de notes par district (${notes.map((n) => n.district).join(", ")}).`
              : notes[0]
                ? `District ${B201_DISTRICT_LABEL[notes[0].district]} (${notes[0].district}).`
                : null}
          </p>
        </div>
        {common.trim() ? <CommonNotes content={common} byName={commonByName} /> : null}
        {notes.length > 1 ? (
          <div
            role="tablist"
            aria-label="Notes par district"
            className="flex gap-1.5 overflow-x-auto md:hidden"
          >
            {notes.map((n) => (
              <button
                key={n.district}
                type="button"
                role="tab"
                id={`b201-notes-tab-${n.district}`}
                aria-controls={`b201-notes-panel-${n.district}`}
                aria-selected={activeNote === n.district}
                data-testid={`b201-notes-tab-${n.district}`}
                onClick={() => setNoteTab(n.district)}
                className={cn(
                  "h-11 shrink-0 cursor-pointer rounded-control border px-3 text-body",
                  activeNote === n.district
                    ? "border-accent text-fg"
                    : "border-border text-fg-muted",
                )}
              >
                {n.district}
                {n.content.trim() ? (
                  <span aria-hidden className="ml-1.5 inline-block size-1.5 rounded-full bg-info" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        {notes.map((n) => (
          <DistrictNotesEditor
            // Changer de district ne remonte que l'éditeur concerné ; jamais de clé sur `updated`.
            key={`${day}-${n.district}`}
            day={day}
            notes={n}
            canWrite={canWrite}
            me={me}
            tabbed={notes.length > 1}
            active={activeNote === n.district}
          />
        ))}
      </section>

      <section aria-labelledby="b201-transports-title" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="b201-transports-title" className="scroll-mt-20 text-h3 font-semibold text-fg">
            Transports du jour
          </h2>
          {/* Rien de saisi hors outil ce jour : pas d'indicateur (« Brouillon non enregistré » inquiétait). */}
          {canWrite && state !== "idle" ? (
            <span data-testid="b201-transports-autosave">
              <AutosaveIndicator state={state} savedAt={savedAt} />
            </span>
          ) : null}
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
        {error ? (
          <p
            role="alert"
            className="rounded-control border border-danger/60 px-3 py-2 text-body text-danger"
          >
            {error}
          </p>
        ) : null}
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

/**
 * Notes d'un district pour le jour : enregistrement automatique propre (fiche jour + district), verrou optimiste,
 * auteur et versions. En onglets (mobile, plusieurs districts) : seul l'onglet actif est visible, les autres restent
 * montés (saisie et enregistrement gardés).
 */
function DistrictNotesEditor({
  day,
  notes,
  canWrite,
  me,
  tabbed,
  active,
}: {
  day: string;
  notes: DistrictNotes;
  canWrite: boolean;
  me: string;
  tabbed: boolean;
  active: boolean;
}) {
  const { district } = notes;
  const [content, setContent] = useState(notes.content);
  const save = useCallback(
    async (_id: string | null, v: string, expected?: string) => {
      const res = await saveB201Notes({
        day,
        district,
        content: v,
        expectedUpdated: expected ?? null,
      });
      return res.ok ? { ok: true as const, data: { ...res.data, number: 0 } } : res;
    },
    [day, district],
  );
  const { state, savedAt, error, rebase, isDirty, version } = useAutosave({
    value: content,
    enabled: canWrite,
    initialId: notes.id,
    initialUpdated: notes.updated,
    save,
  });

  // Notes du district enregistrées ailleurs (temps réel) : reprises seulement si rien n'est en cours ici.
  useEffect(() => {
    if (!notes.updated || notes.updated === version() || isDirty()) return;
    rebase(notes.updated, notes.content);
    setContent(notes.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.updated]);

  const lastBy = savedAt ? me : notes.updatedByName;
  const lastAt = savedAt ? hm.format(savedAt) : pbTime(notes.updated);
  const label = `Notes ${district} (${B201_DISTRICT_LABEL[district]})`;

  return (
    <section
      id={`b201-notes-panel-${district}`}
      role={tabbed ? "tabpanel" : undefined}
      aria-labelledby={tabbed ? `b201-notes-tab-${district}` : undefined}
      aria-label={tabbed ? undefined : label}
      data-testid={`b201-notes-${district}`}
      className={cn(
        "min-w-0 flex-col gap-3 rounded-box border border-border bg-surface p-4",
        tabbed && !active ? "hidden md:flex" : "flex",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-baseline gap-2">
          <span className="text-body-lg font-semibold text-fg">{district}</span>
          <span className="text-small text-fg-muted">{B201_DISTRICT_LABEL[district]}</span>
        </h3>
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
            versions={notes.versions}
            canRestore={canWrite}
            title={`Versions du jour · ${district}`}
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
        label={label}
        placeholder={
          "### Matin\n- Bus Mons → Quévy : chauffeur prévenu\n\n### Pour le service suivant\n- **Rappeler** le dépôt avant 14 h"
        }
        readOnly={!canWrite}
      />
    </section>
  );
}

/**
 * Notes du jour écrites avant les notes par district (15 oct. 2026) : une fiche par jour, sans district évident. Lecture
 * seule, une fois au-dessus des districts ; « Copier » pour en reprendre un passage dans les notes d'un district.
 */
function CommonNotes({ content, byName }: { content: string; byName: string }) {
  const copy = useCopy();
  return (
    <section
      aria-label={COMMON_NOTES_TITLE}
      data-testid="b201-common"
      className="flex min-w-0 flex-col gap-2 rounded-box border border-dashed border-border-strong bg-surface-2 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-body-lg font-semibold text-fg">
          <Lock aria-hidden className="size-4 text-fg-muted" />
          {COMMON_NOTES_TITLE}
        </h3>
        <div className="flex items-center gap-2">
          <span className="label-mono text-fg-muted">
            Lecture seule{byName ? ` · ${byName}` : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void copy.copy(content)}>
            <CopyIcon copied={copy.copied} /> {copy.copied ? "Copié" : "Copier"}
          </Button>
        </div>
      </div>
      <p className="text-small text-fg-muted">
        Écrites avant les notes par district, pour tous les districts. Les nouvelles notes vont dans
        le district concerné.
      </p>
      <div className="max-h-72 overflow-auto">
        <ChatMarkdown body={content} className="min-w-0" />
      </div>
    </section>
  );
}

/** Versions du jour (gardées par le serveur : auteur différent, ou toutes les 10 min), restaurables. */
function Versions({
  versions,
  canRestore,
  title,
  onRestore,
}: {
  versions: B201Version[];
  canRestore: boolean;
  title: string;
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
        title={title}
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
