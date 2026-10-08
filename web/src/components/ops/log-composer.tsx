"use client";

import { Link2, Paperclip, Pin, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  createEntry,
  removeAttachment,
  searchLinks,
  updateEntry,
} from "@/app/(app)/operations/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { CATEGORY, LOG_CATEGORIES, ATTACHMENT_MAX, type LogCategory } from "@/lib/ops/log";
import { safeCall } from "@/lib/orders/safe-call";
import { brusselsDay, brusselsTime, dayOf, pbDate } from "@/lib/orders/time";
import { cn } from "@/lib/utils";
import type { Agent, Linkable, LinkedObject, LogEntry } from "@/server/data/ops";

const KIND_LABEL: Record<LinkedObject["kind"], string> = {
  bus: "Bus C3",
  taxi: "Taxi",
  pmr: "Prestation PMR",
  pn: "Passage à niveau",
};

function hhmm(value: string) {
  const d = pbDate(value);
  return d ? brusselsTime(d) : "";
}

export type ComposerPreset = {
  category?: LogCategory;
  train?: string;
  link?: Linkable;
  body?: string;
};

/**
 * Compositeur de la main courante (création et modification) : catégorie, heure de l'événement, texte avec
 * mentions « @ », train, objet lié, urgent, épinglage, pièces jointes (3, 5 Mo, images et PDF).
 */
export function LogComposer({
  agents,
  linkKinds,
  entry,
  preset,
  onDone,
  onChanged,
  autoFocus,
}: {
  agents: Agent[];
  /** Types d'objets que l'agent peut lier (selon ses droits de lecture). */
  linkKinds: LinkedObject["kind"][];
  entry?: LogEntry;
  preset?: ComposerPreset;
  onDone?: (id: string) => void;
  /** Appelé après la suppression d'une pièce jointe (l'entrée a changé : relire sa version). */
  onChanged?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [category, setCategory] = useState<LogCategory>(
    entry?.category ?? preset?.category ?? "info",
  );
  const [body, setBody] = useState(entry?.body ?? preset?.body ?? "");
  const [day, setDay] = useState(entry ? dayOf(entry.occurredAt) : brusselsDay());
  const [time, setTime] = useState(entry ? hhmm(entry.occurredAt) : brusselsTime());
  const [urgent, setUrgent] = useState(entry?.urgent ?? false);
  const [pin, setPin] = useState(!!entry?.pinnedUntil);
  const [pinDay, setPinDay] = useState(
    entry?.pinnedUntil ? dayOf(entry.pinnedUntil) : brusselsDay(),
  );
  const [pinTime, setPinTime] = useState(entry?.pinnedUntil ? hhmm(entry.pinnedUntil) : "23:59");
  const [train, setTrain] = useState(entry?.train ?? preset?.train ?? "");
  const [links, setLinks] = useState<Linkable[]>(
    entry
      ? entry.links.map((l) => ({ kind: l.kind, id: l.id, label: l.label }))
      : preset?.link
        ? [preset.link]
        : [],
  );
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Suggestions de mention : le mot en cours commence par « @ ».
  const [caret, setCaret] = useState(0);
  const mention = useMemo(() => {
    const before = body.slice(0, caret);
    const m = /(^|\s)@([\w.-]{0,30})$/.exec(before);
    if (!m) return null;
    const q = (m[2] ?? "").toLowerCase();
    const list = agents
      .filter((a) => a.username.toLowerCase().startsWith(q) || a.name.toLowerCase().includes(q))
      .slice(0, 6);
    return list.length ? { start: before.length - (m[2] ?? "").length - 1, list } : null;
  }, [body, caret, agents]);
  const insertMention = (a: Agent) => {
    if (!mention) return;
    const next = `${body.slice(0, mention.start)}@${a.username} ${body.slice(caret)}`;
    setBody(next);
    const pos = mention.start + a.username.length + 2;
    requestAnimationFrame(() => {
      textRef.current?.focus();
      textRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  // Objet lié : recherche courte, un objet par type.
  const [linkKind, setLinkKind] = useState<LinkedObject["kind"]>(linkKinds[0] ?? "pn");
  const [linkQ, setLinkQ] = useState("");
  const [linkResults, setLinkResults] = useState<Linkable[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!linkOpen) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const res = await safeCall(searchLinks({ kind: linkKind, q: linkQ }));
      if (n !== seq.current) return;
      setLinkResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(t);
  }, [linkKind, linkQ, linkOpen]);

  const existing = entry?.attachments ?? [];
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > ATTACHMENT_MAX) {
        toast.error(`${f.name} dépasse 5 Mo.`);
        continue;
      }
      if (existing.length + next.length >= 3) {
        toast.error("3 pièces jointes au maximum.");
        break;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const data = {
        body,
        category,
        day,
        time,
        urgent,
        pinUntilDay: pin ? pinDay : "",
        pinUntilTime: pin ? pinTime : "",
        train,
        busOrder: links.find((l) => l.kind === "bus")?.id ?? "",
        taxiOrder: links.find((l) => l.kind === "taxi")?.id ?? "",
        pmrAssist: links.find((l) => l.kind === "pmr")?.id ?? "",
        levelCrossing: links.find((l) => l.kind === "pn")?.id ?? "",
      };
      let id = entry?.id ?? "";
      if (entry) {
        const res = await safeCall(
          updateEntry({ id: entry.id, expectedUpdated: entry.updated, entry: data }),
        );
        if (!res.ok) return setError(res.error);
      } else {
        const res = await safeCall(createEntry(data));
        if (!res.ok) return setError(res.error);
        id = res.data.id;
      }
      if (files.length) {
        const form = new FormData();
        for (const f of files) form.append("fichiers", f);
        try {
          const up = await fetch(`/api/operations/main-courante/${id}/fichiers`, {
            method: "POST",
            body: form,
          });
          if (!up.ok)
            toast.error(
              ((await up.json().catch(() => ({}))) as { error?: string }).error ??
                "Pièce jointe refusée.",
            );
        } catch {
          toast.error("Pièces jointes non envoyées (réseau).");
        }
      }
      toast.success(entry ? "Entrée modifiée." : "Entrée publiée.");
      if (!entry) {
        setBody("");
        setUrgent(false);
        setPin(false);
        setTrain("");
        setLinks([]);
        setFiles([]);
        setTime(brusselsTime());
        setDay(brusselsDay());
      }
      router.refresh();
      onDone?.(id);
    });

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="log-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-small font-medium text-fg">Catégorie</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Catégorie">
          {LOG_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "h-control-sm min-w-11 cursor-pointer border px-3 text-small transition-colors",
                category === c
                  ? "border-accent bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface))] text-fg"
                  : "border-border-strong bg-surface text-fg-muted hover:text-fg",
              )}
            >
              {CATEGORY[c].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="relative">
        <Field
          label="Texte"
          required
          hint="« @ » pour mentionner un agent · Ctrl + Entrée pour publier"
        >
          <Textarea
            ref={textRef}
            value={body}
            maxLength={4000}
            rows={4}
            autoFocus={autoFocus}
            data-testid="log-body"
            onChange={(e) => {
              setBody(e.target.value);
              setCaret(e.target.selectionStart);
            }}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
            onKeyDown={(e) => {
              if (mention && e.key === "Enter" && !e.ctrlKey && !e.metaKey && mention.list[0]) {
                e.preventDefault();
                insertMention(mention.list[0]);
              }
            }}
          />
        </Field>
        {mention ? (
          <ul
            role="listbox"
            aria-label="Agents à mentionner"
            className="absolute right-0 left-0 z-20 mt-1 border border-border-strong bg-surface shadow-lg"
          >
            {mention.list.map((a) => (
              <li key={a.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 text-left text-body hover:bg-surface-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMention(a)}
                >
                  <span className="font-medium">{a.name}</span>
                  <span className="font-mono text-small text-fg-muted">@{a.username}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Jour de l'événement">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </Field>
        <Field label="Heure">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="Train (facultatif)">
          <Input
            value={train}
            onChange={(e) => setTrain(e.target.value)}
            placeholder="IC 2134"
            maxLength={20}
          />
        </Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body md:min-h-0">
            <Checkbox
              checked={urgent}
              onCheckedChange={(v) => setUrgent(v === true)}
              aria-label="Urgent"
            />
            Urgent <span className="text-small text-fg-muted">(notifie le district)</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body md:min-h-0">
          <Checkbox
            checked={pin}
            onCheckedChange={(v) => setPin(v === true)}
            aria-label="Épingler en consigne"
          />
          <Pin aria-hidden className="size-4 text-fg-muted" /> Épingler en consigne jusqu&apos;au…
        </label>
        {pin ? (
          <div className="grid grid-cols-2 gap-3 md:max-w-sm">
            <Field label="Jour">
              <Input type="date" value={pinDay} onChange={(e) => setPinDay(e.target.value)} />
            </Field>
            <Field label="Heure">
              <Input type="time" value={pinTime} onChange={(e) => setPinTime(e.target.value)} />
            </Field>
          </div>
        ) : null}
      </div>

      {linkKinds.length ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {links.map((l) => (
              <span
                key={`${l.kind}-${l.id}`}
                className="inline-flex min-h-8 items-center gap-1 border border-border-strong bg-surface-2 pl-2 text-small"
              >
                <Link2 aria-hidden className="size-3.5 text-fg-muted" /> {l.label}
                <button
                  type="button"
                  className="grid size-8 cursor-pointer place-items-center text-fg-muted hover:text-fg"
                  aria-label={`Retirer le lien ${l.label}`}
                  onClick={() => setLinks(links.filter((x) => x !== l))}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="border border-border"
              onClick={() => setLinkOpen((o) => !o)}
              aria-expanded={linkOpen}
            >
              <Link2 aria-hidden /> Lier un objet
            </Button>
          </div>
          {linkOpen ? (
            <div className="flex flex-col gap-2 border border-border p-3">
              <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-2">
                <Select
                  aria-label="Type d'objet"
                  value={linkKind}
                  onChange={(e) => setLinkKind(e.target.value as LinkedObject["kind"])}
                >
                  {linkKinds.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                <span className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
                  />
                  <Input
                    aria-label="Rechercher l'objet à lier"
                    className="pl-9"
                    value={linkQ}
                    onChange={(e) => setLinkQ(e.target.value)}
                    placeholder={
                      linkKind === "pn"
                        ? "12, L.94, rue…"
                        : linkKind === "pmr"
                          ? "Gare, train…"
                          : "N° ou gare"
                    }
                  />
                </span>
              </div>
              <ul className="flex flex-col" aria-label="Résultats">
                {linkResults.length === 0 ? (
                  <li className="text-small text-fg-muted">Aucun résultat.</li>
                ) : null}
                {linkResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full cursor-pointer items-center px-2 text-left text-body hover:bg-surface-2"
                      onClick={() => {
                        setLinks([...links.filter((l) => l.kind !== r.kind), r]);
                        setLinkOpen(false);
                        setLinkQ("");
                      }}
                    >
                      {r.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {existing.map((name) => (
            <span
              key={name}
              className="inline-flex min-h-8 items-center gap-1 border border-border bg-surface-2 pl-2 text-small"
            >
              <Paperclip aria-hidden className="size-3.5" /> {name}
              <button
                type="button"
                className="grid size-8 cursor-pointer place-items-center text-fg-muted hover:text-danger"
                aria-label={`Supprimer la pièce jointe ${name}`}
                onClick={async () => {
                  if (!entry) return;
                  const res = await safeCall(removeAttachment({ id: entry.id, name }));
                  if (!res.ok) toast.error(res.error);
                  else {
                    router.refresh();
                    onChanged?.();
                  }
                }}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex min-h-8 items-center gap-1 border border-dashed border-border-strong pl-2 text-small"
            >
              <Paperclip aria-hidden className="size-3.5" /> {f.name}
              <button
                type="button"
                className="grid size-8 cursor-pointer place-items-center text-fg-muted hover:text-fg"
                aria-label={`Retirer ${f.name}`}
                onClick={() => setFiles(files.filter((_, k) => k !== i))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {existing.length + files.length < 3 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="border border-border"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip aria-hidden /> Joindre (image, PDF)
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          variant="primary"
          aria-busy={pending || undefined}
          disabled={pending || !body.trim()}
          data-testid="log-submit"
        >
          {entry ? "Enregistrer" : "Publier"}
        </Button>
      </div>
    </form>
  );
}
