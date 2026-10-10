"use client";

import {
  ArrowDown,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  History,
  Maximize2,
  Minimize2,
  Pencil,
  MessageSquareReply,
  Pin,
  Printer,
  Reply,
  TriangleAlert,
  Undo2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  loadEntryPanel,
  markAllRead,
  restoreEntry,
  retireEntry,
  setRead,
} from "@/app/(app)/operations/actions";
import { LiveHighlight } from "@/components/ui/live-highlight";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Timeline } from "@/components/ui/form-kit";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { CATEGORY, RETIRE_WINDOW_MS, type LogCategory } from "@/lib/ops/log";
import { safeCall } from "@/lib/orders/safe-call";
import { plainText } from "@/lib/ops/chat-markdown";
import { brusselsTime, dayOf, formatLongDay, pbDate } from "@/lib/orders/time";
import { cn } from "@/lib/utils";
import type { Agent, LinkedObject, LogEntry, LogEvent } from "@/server/data/ops";

import { ChatMarkdown } from "./chat-markdown";
import { LogComposer, type ComposerPreset } from "./log-composer";
import { LogLinks, LogMeta } from "./log-entry";

const toneVar: Record<string, string> = {
  danger: "var(--danger)",
  info: "var(--info)",
  accent: "var(--accent)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  neutral: "var(--border-strong)",
};

const stamp = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const FIELD: Record<string, string> = {
  body: "Texte",
  category: "Catégorie",
  occurred_at: "Heure de l'événement",
  urgent: "Urgent",
  pinned_until: "Épinglage",
  train: "Train",
  bus_order: "Bus lié",
  taxi_order: "Taxi lié",
  pmr_assist: "Prestation liée",
  level_crossing: "PN lié",
  attachments: "Pièces jointes",
  district: "District",
};

function eventTitle(e: LogEvent) {
  if (e.kind === "create") return "Publication";
  if (e.kind === "retire") return "Retirée";
  if (e.kind === "restore") return "Rétablie";
  if (e.field === "category")
    return `Catégorie : ${CATEGORY[e.from as LogCategory]?.label ?? e.from} → ${CATEGORY[e.to as LogCategory]?.label ?? e.to}`;
  if (e.field === "body") return "Texte corrigé";
  return `${FIELD[e.field] ?? e.field} modifié`;
}

const initials = (name: string) =>
  name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const hhmm = (v: string) => {
  const d = pbDate(v);
  return d ? brusselsTime(d) : "--:--";
};
const shortDay = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
/** « ven. 09/10 · 14:32 » (heure de Bruxelles). */
const stampOf = (v: string) => {
  const d = pbDate(v);
  return d ? `${shortDay.format(d)} · ${brusselsTime(d)}` : "—";
};

/**
 * Journal (ex-main courante, 9 oct. 2026) : fil plein écran façon messagerie. Messages Markdown et emojis, du plus
 * ancien au plus récent, barre d'écriture en bas, consignes épinglées en bandeau, « Lu », panneau de détail
 * (historique, modification, retrait). Le fil remplit la hauteur de l'écran ; « Plein écran » masque le shell.
 */
export function JournalChat({
  rows,
  pinned,
  me,
  coordinator,
  canWrite,
  agents,
  linkKinds,
  showDay,
  header,
  preset,
  olderHref,
  highlight = [],
}: {
  rows: LogEntry[];
  pinned: LogEntry[];
  me: string;
  coordinator: boolean;
  canWrite: boolean;
  agents: Agent[];
  linkKinds: LinkedObject["kind"][];
  showDay: boolean;
  /** Barre du haut (jour, filtres, recherche), rendue côté serveur. */
  header: ReactNode;
  preset?: ComposerPreset;
  /** Lien « messages plus anciens » (fil continu chargé par paquets de 100). */
  olderHref?: string;
  /** Mots recherchés, surlignés dans les messages. */
  highlight?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(params.get("entree"));
  const [panel, setPanel] = useState<{
    entry: LogEntry;
    events: LogEvent[];
    replies: LogEntry[];
  } | null>(null);
  // Réponse en cours dans la barre d'écriture.
  const [replying, setReplying] = useState<LogEntry | null>(null);
  const reply = (r: LogEntry) => {
    setReplying(r);
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>('[data-testid="log-body"]')?.focus(),
    );
  };
  const jumpTo = (id: string) => {
    const el = scroller.current?.querySelector(`[data-entry="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.querySelector("article")?.animate(
        [{ outlineColor: "var(--accent)" }, { outlineColor: "transparent" }],
        { duration: 1200 },
      );
    } else open(id);
  };
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const wanted = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadEntryPanel(id));
    if (wanted.current !== id) return;
    if (res.ok) setPanel(res.data);
    else {
      toast.error(res.error);
      setOpenId(null);
    }
  }, []);
  useEffect(() => {
    if (openId) void load(openId);
  }, [openId, load]);
  // Lien de notification vers la page déjà ouverte (navigation douce) : ouvre l'entrée demandée.
  const wantedEntry = params.get("entree");
  useEffect(() => {
    if (wantedEntry && wantedEntry !== openId) {
      setPanel(null);
      setEditing(false);
      setOpenId(wantedEntry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedEntry]);
  const openUpdated = openId
    ? [...rows, ...pinned].find((r) => r.id === openId)?.updated
    : undefined;
  useEffect(() => {
    if (openId && openUpdated && !editing) void load(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUpdated]);

  const open = (id: string) => {
    setPanel(null);
    setEditing(false);
    setOpenId(id);
    const sp = new URLSearchParams(params.toString());
    sp.set("entree", id);
    window.history.replaceState(null, "", `${pathname}?${sp}`);
  };
  const close = () => {
    setOpenId(null);
    setPanel(null);
    setEditing(false);
    wanted.current = null;
    const sp = new URLSearchParams(params.toString());
    sp.delete("entree");
    window.history.replaceState(null, "", sp.size ? `${pathname}?${sp}` : pathname);
  };

  const toggleRead = (e: LogEntry) =>
    start(async () => {
      const read = !e.readers.some((r) => r.id === me);
      const res = await safeCall(setRead({ id: e.id, read }));
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
      if (openId === e.id) void load(e.id);
    });

  const e = panel?.entry;
  const isAuthor = !!e && e.authorId === me;
  const canEdit = !!e && canWrite && e.status === "active" && (isAuthor || coordinator);
  const withinWindow = !!e && Date.now() - (pbDate(e.created)?.getTime() ?? 0) < RETIRE_WINDOW_MS;
  const canRetire =
    !!e && canWrite && e.status === "active" && (coordinator || (isAuthor && withinWindow));

  // --- Fil façon messagerie -------------------------------------------------------------------
  const list = [...rows].reverse(); // le serveur trie du plus récent au plus ancien
  const unread = list.filter(
    (r) => r.status === "active" && r.authorId !== me && !r.readers.some((x) => x.id === me),
  ).length;
  const markAll = () =>
    start(async () => {
      const ids = list
        .filter(
          (r) => r.status === "active" && r.authorId !== me && !r.readers.some((x) => x.id === me),
        )
        .map((r) => r.id)
        .slice(-200);
      const res = await safeCall(markAllRead(ids));
      if (!res.ok) return void toast.error(res.error);
      router.refresh();
    });
  const frame = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [fresh, setFresh] = useState(0);
  const [top, setTop] = useState(0);
  const lastId = useRef<string | null>(null);
  const lastCount = useRef(0);
  const lastHeight = useRef(0);

  // Hauteur : le fil remplit l'écran sous l'en-tête du module (le défilement est interne au fil).
  useLayoutEffect(() => {
    const measure = () => {
      const el = frame.current;
      if (!el || full) return;
      setTop(Math.max(0, el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener("resize", measure);
    // Un bandeau qui apparaît au-dessus (districts du jour, maintenance) déplace le fil : on remesure.
    const ro = new ResizeObserver(measure);
    const main = frame.current?.closest("main");
    if (main) ro.observe(main);
    return () => {
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [full]);

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setFresh(0);
  }, []);

  // Nouveaux messages : on suit le bas si l'agent y était (ou s'il vient d'écrire), sinon pastille « nouveaux ».
  const newest = list[list.length - 1];
  useLayoutEffect(() => {
    const first = lastId.current === null;
    const changed = newest?.id !== lastId.current;
    const added = Math.max(0, list.length - lastCount.current);
    lastId.current = newest?.id ?? "";
    lastCount.current = list.length;
    const el = scroller.current;
    if (first || (changed && (atBottom || newest?.authorId === me))) toBottom();
    else if (changed && added) setFresh((n) => n + added);
    // Messages plus anciens ajoutés en haut : on garde la position de lecture.
    else if (!changed && added && el) el.scrollTop += el.scrollHeight - lastHeight.current;
    if (el) lastHeight.current = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest?.id, list.length]);

  // La hauteur du fil est fixée après la 1re mesure : on recolle au bas si l'agent y était.
  useLayoutEffect(() => {
    if (atBottom) toBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  // Plein écran : Échap pour sortir, défilement de la page bloqué.
  useEffect(() => {
    if (!full) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !openId) setFull(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => toBottom());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [full, openId, toBottom]);

  // Lien vers une entrée (notification, widget) : on la fait défiler au centre.
  useEffect(() => {
    if (!wantedEntry) return;
    const el = scroller.current?.querySelector(`[data-entry="${CSS.escape(wantedEntry)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [wantedEntry]);

  const message = (r: LogEntry, i: number) => {
    const prev = list[i - 1];
    const mine = r.authorId === me && r.source !== "irail";
    const irail = r.source === "irail";
    const newDay = !prev || dayOf(prev.created) !== dayOf(r.created);
    const read = r.readers.some((x) => x.id === me);
    const tone = toneVar[CATEGORY[r.category].tone];
    // Heure de l'événement affichée à part si elle diffère de l'envoi de plus de 5 minutes.
    const gap = Math.abs(
      (pbDate(r.occurredAt)?.getTime() ?? 0) - (pbDate(r.created)?.getTime() ?? 0),
    );
    return (
      <Fragment key={r.id}>
        {newDay ? (
          <li className="flex items-center gap-3 pt-4 pb-1 first:pt-0">
            <span aria-hidden className="h-px flex-1 bg-border" />
            <span className="label-mono border border-border bg-surface px-2 py-1 text-fg-muted first-letter:uppercase">
              {formatLongDay(dayOf(r.created))}
            </span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </li>
        ) : null}
        <li
          data-entry={r.id}
          className={cn("mt-3 flex gap-2 sm:mt-4 sm:gap-2.5", mine && "flex-row-reverse")}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center overflow-hidden border font-mono text-hint font-semibold sm:size-9 sm:text-small",
              mine
                ? "border-accent bg-accent-soft text-fg"
                : irail
                  ? "border-info bg-[color-mix(in_oklab,var(--info)_14%,var(--surface))] text-fg"
                  : "border-border-strong bg-surface text-fg-muted",
            )}
          >
            {irail ? (
              "iR"
            ) : r.authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/avatar/${r.authorId}?v=${encodeURIComponent(r.authorAvatar)}`}
                alt=""
                className="size-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              initials(r.authorName)
            )}
          </span>
          <div
            className={cn(
              "flex min-w-0 max-w-[min(46rem,calc(100%-2.25rem))] flex-col gap-1 sm:max-w-[min(46rem,88%)]",
              mine && "items-end",
            )}
          >
            <div
              className={cn(
                "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5",
                mine && "justify-end",
              )}
            >
              <span className="text-small font-semibold text-fg">
                {mine ? `Toi (${r.authorName})` : r.authorName}
                {r.authorStatus ? (
                  <span
                    className="ml-1.5 rounded-control border border-border-strong px-1 text-label font-medium text-fg-muted"
                    data-testid="author-status"
                  >
                    {r.authorStatus}
                  </span>
                ) : null}
              </span>
              <span className="font-mono text-hint text-fg-muted tabular" title="Envoyé le">
                <span className="max-sm:hidden">{stampOf(r.created || r.occurredAt)}</span>
                <span className="sm:hidden">{hhmm(r.created || r.occurredAt)}</span>
              </span>
              {gap > 5 * 60_000 ? (
                <span className="text-hint text-fg-muted">
                  · événement{" "}
                  {dayOf(r.occurredAt) !== dayOf(r.created)
                    ? stampOf(r.occurredAt)
                    : hhmm(r.occurredAt)}
                </span>
              ) : null}
            </div>
            <article
              data-hl={r.id}
              style={{ "--status": tone } as React.CSSProperties}
              aria-label={`${!read && !mine && r.status === "active" ? "Non lu. " : ""}Message de ${r.authorName}, ${stampOf(r.created || r.occurredAt)}`}
              className={cn(
                "group relative flex min-w-0 flex-col gap-2 rounded-box border border-l-[3px] border-l-(--status) px-3 py-2 animate-fade-in",
                // Mes messages : fond surface-2 ; non lu : pastille info (l'accent est réservé à l'action).
                mine ? "border-border bg-surface-2" : "border-border bg-surface",
                r.urgent &&
                  r.status === "active" &&
                  "border-danger bg-[color-mix(in_oklab,var(--danger)_8%,var(--surface))]",
                r.status === "retiree" && "border-dashed opacity-70",
                !read &&
                  !mine &&
                  r.status === "active" &&
                  "before:absolute before:top-2.5 before:right-2.5 before:size-2 before:rounded-full before:bg-info",
                wantedEntry === r.id && "outline-2 outline-offset-2 outline-accent",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={CATEGORY[r.category].tone}>{CATEGORY[r.category].label}</Badge>
                {r.urgent ? (
                  <Badge tone="danger">
                    <TriangleAlert aria-hidden className="size-3" /> Urgent
                  </Badge>
                ) : null}
                {r.pinnedUntil && (pbDate(r.pinnedUntil)?.getTime() ?? 0) > Date.now() ? (
                  <Badge tone="accent">
                    <Pin aria-hidden className="size-3" /> Épinglé
                  </Badge>
                ) : null}
                {r.status === "retiree" ? <Badge tone="neutral">Retiré</Badge> : null}
                {r.district ? <span className="label-mono text-fg-muted">{r.district}</span> : null}
              </div>
              {r.replyTo ? (
                <button
                  type="button"
                  onClick={() => jumpTo(r.replyTo!.id)}
                  className="flex min-w-0 cursor-pointer flex-col items-start border-l-2 border-border-strong bg-surface-2 px-2 py-1 text-left hover:border-accent"
                  aria-label={`Réponse à ${r.replyTo.author || "un message"} : aller au message d'origine`}
                  data-testid="log-quote"
                >
                  <span className="inline-flex items-center gap-1 text-hint font-semibold text-fg-muted">
                    <Reply aria-hidden className="size-3" /> {r.replyTo.author || "Message"}
                  </span>
                  <span className="line-clamp-2 text-small text-fg-muted">{r.replyTo.excerpt}</span>
                </button>
              ) : null}
              <ChatMarkdown
                body={r.body}
                highlight={highlight}
                className={r.status === "retiree" ? "line-through" : ""}
              />
              {r.status === "retiree" && r.retiredReason ? (
                <p className="text-small text-fg-muted">Motif du retrait : {r.retiredReason}</p>
              ) : null}
              <LogLinks entry={r} />
              <div className="-mx-1 -mb-1 flex flex-wrap items-center justify-between gap-1">
                <span className="inline-flex items-center gap-1 px-1 text-hint text-fg-muted">
                  {read ? <Check aria-hidden className="size-3.5 text-ok" /> : null}
                  {r.readers.length ? `Lu par ${r.readers.length}` : "Pas encore lu"}
                  {r.editedAt ? " · modifié" : ""}
                </span>
                <span className="flex items-center">
                  {r.replyCount > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-info"
                      onClick={() => open(r.id)}
                      data-testid="log-replies"
                      aria-label={`${r.replyCount} réponse${r.replyCount > 1 ? "s" : ""} : ouvrir le fil`}
                    >
                      <MessageSquareReply aria-hidden />
                      <span className="font-mono tabular">{r.replyCount}</span>
                      <span className="max-sm:sr-only">réponse{r.replyCount > 1 ? "s" : ""}</span>
                    </Button>
                  ) : null}
                  {canWrite && r.status === "active" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => reply(r)}
                      data-testid="log-reply"
                      aria-label={`Répondre à ${r.authorName}`}
                    >
                      <Reply aria-hidden /> <span className="max-sm:sr-only">Répondre</span>
                    </Button>
                  ) : null}
                  {r.status === "active" && !mine ? (
                    <Button
                      size="sm"
                      variant={read ? "ghost" : "secondary"}
                      className="h-8 px-2"
                      onClick={() => toggleRead(r)}
                      disabled={pending}
                      data-testid="log-read"
                      aria-label={read ? "Marquer comme non lu" : "Marquer comme lu"}
                    >
                      <Check aria-hidden />{" "}
                      <span className="max-sm:sr-only">{read ? "Lu" : "Marquer lu"}</span>
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => open(r.id)}
                    aria-label={`Détail du message de ${r.authorName}`}
                    data-testid="log-open"
                  >
                    <History aria-hidden /> <span className="max-sm:sr-only">Détail</span>
                  </Button>
                </span>
              </div>
            </article>
          </div>
        </li>
      </Fragment>
    );
  };

  return (
    <>
      <div
        ref={frame}
        style={full ? undefined : { height: `calc(100dvh - ${top}px - var(--journal-gap))` }}
        className={cn(
          "flex min-h-[26rem] flex-col overflow-hidden border border-border bg-bg max-sm:-mx-4 max-sm:border-x-0 [--journal-gap:calc(env(safe-area-inset-bottom)+5.25rem)] md:[--journal-gap:1.5rem]",
          full &&
            "fixed inset-0 z-[45] min-h-0 border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
        )}
        data-testid="journal"
      >
        <div className="flex items-start gap-2 border-b border-border bg-surface px-3 py-2">
          <div className="min-w-0 flex-1">{header}</div>
          <div className="flex shrink-0 items-center gap-1">
            {unread ? (
              <Button
                size="sm"
                variant="ghost"
                className="border border-border"
                disabled={pending}
                onClick={markAll}
                data-testid="log-read-all"
                title="Marquer tous les messages affichés comme lus"
              >
                <CheckCheck aria-hidden />
                <span className="max-sm:sr-only">Tout marquer lu</span>
                <span className="font-mono tabular">({unread})</span>
              </Button>
            ) : null}
            <Button
              size="icon"
              variant="ghost"
              className="max-md:hidden"
              data-print="hide"
              onClick={() => window.print()}
              aria-label="Imprimer le fil affiché"
              title="Imprimer le fil affiché"
            >
              <Printer aria-hidden />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setFull((f) => !f)}
              aria-pressed={full}
              aria-label={full ? "Quitter le plein écran" : "Plein écran"}
              title={full ? "Quitter le plein écran (Échap)" : "Plein écran"}
              data-testid="journal-full"
            >
              {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </Button>
          </div>
        </div>

        {pinned.length ? (
          <section
            aria-label="Consignes épinglées"
            className="border-b border-border bg-accent-faint"
            data-testid="log-pinned"
          >
            <button
              type="button"
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-3 text-left"
              aria-expanded={pinsOpen}
              onClick={() => setPinsOpen((o) => !o)}
            >
              <Pin aria-hidden className="size-4 shrink-0 text-accent" />
              <span className="label-mono shrink-0 text-fg-muted">
                {pinned.length} consigne{pinned.length > 1 ? "s" : ""}
              </span>
              <span className="min-w-0 flex-1 truncate text-small text-fg">
                {plainText(pinned[0]?.body ?? "")}
              </span>
              {pinsOpen ? (
                <ChevronUp aria-hidden className="size-4 shrink-0" />
              ) : (
                <ChevronDown aria-hidden className="size-4 shrink-0" />
              )}
            </button>
            {pinsOpen ? (
              <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto px-3 pb-3">
                {pinned.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => open(p.id)}
                      className="flex w-full cursor-pointer flex-col gap-1 border border-border bg-surface px-3 py-2 text-left hover:border-fg-muted"
                    >
                      <LogMeta entry={p} showDay />
                      <ChatMarkdown body={p.body} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <div className="relative min-h-0 flex-1">
          {/* Nouveaux messages des collègues signalés (les siens non : l'agent sait ce qu'il vient d'écrire). */}
          <LiveHighlight
            scope="journal"
            swap={false}
            context={`${showDay}|${olderHref ?? ""}`}
            sigs={Object.fromEntries(
              rows.filter((r) => r.authorId !== me).map((r) => [r.id, `${r.status}|${r.updated}`]),
            )}
          />
          <div
            ref={scroller}
            data-hl-scope="journal"
            className="absolute inset-0 overflow-y-auto overscroll-contain px-3 py-4 md:px-5"
            onScroll={(ev) => {
              const el = ev.currentTarget;
              const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              setAtBottom(bottom);
              lastHeight.current = el.scrollHeight;
              if (bottom && fresh) setFresh(0);
            }}
          >
            {list.length === 0 ? (
              <div className="grid h-full place-items-center text-center">
                <div className="flex max-w-xs flex-col items-center gap-2">
                  <span aria-hidden className="text-[2rem] leading-none">
                    💬
                  </span>
                  <p className="label-mono text-fg">Aucun message</p>
                  <p className="text-small text-fg-muted">
                    {showDay
                      ? "Aucun résultat pour cette recherche."
                      : "Rien n'a été écrit pour ce jour ou ces filtres."}
                  </p>
                </div>
              </div>
            ) : (
              <ol
                role="log"
                aria-label="Fil du journal"
                aria-live="polite"
                className="flex flex-col"
                data-testid="log-list"
              >
                {olderHref ? (
                  <li className="flex justify-center pb-2">
                    <Button asChild size="sm" variant="ghost" className="border border-border">
                      <Link href={olderHref} scroll={false} data-testid="log-older">
                        <ChevronUp aria-hidden /> Messages plus anciens
                      </Link>
                    </Button>
                  </li>
                ) : null}
                {list.map(message)}
              </ol>
            )}
          </div>
          {fresh > 0 && !atBottom ? (
            <button
              type="button"
              onClick={() => toBottom(true)}
              className="absolute bottom-3 left-1/2 z-10 inline-flex min-h-10 -translate-x-1/2 cursor-pointer items-center gap-1.5 border border-accent bg-surface px-3 text-small font-medium text-fg shadow-lg animate-pop-in"
            >
              <ArrowDown aria-hidden className="size-4" /> {fresh} nouveau{fresh > 1 ? "x" : ""}{" "}
              message{fresh > 1 ? "s" : ""}
            </button>
          ) : !atBottom && list.length > 8 ? (
            <button
              type="button"
              onClick={() => toBottom(true)}
              aria-label="Aller au dernier message"
              className="absolute right-3 bottom-3 z-10 grid size-10 cursor-pointer place-items-center border border-border-strong bg-surface text-fg-muted shadow-lg hover:text-fg"
            >
              <ArrowDown aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>

        {canWrite ? (
          <LogComposer
            variant="chat"
            agents={agents}
            linkKinds={linkKinds}
            preset={preset}
            replyTo={
              replying
                ? {
                    id: replying.id,
                    author: replying.authorName,
                    excerpt: plainText(replying.body).slice(0, 120),
                  }
                : null
            }
            onCancelReply={() => setReplying(null)}
            onDone={() => {
              if (showDay) router.push("/operations/journal");
            }}
          />
        ) : null}
      </div>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => (o ? null : close())}
        eyebrow="// Journal"
        title={e ? `${CATEGORY[e.category].label} · ${e.authorName}` : "Message"}
        description={e?.status === "retiree" ? "Message retiré" : undefined}
        footer={
          e ? (
            <div className="flex w-full flex-wrap gap-2">
              {canEdit && !editing ? (
                <Button size="sm" onClick={() => setEditing(true)} data-testid="log-edit">
                  <Pencil aria-hidden /> Modifier
                </Button>
              ) : null}
              {canRetire && !editing ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setRetiring(true)}
                  data-testid="log-retire"
                >
                  <XCircle aria-hidden /> Retirer
                </Button>
              ) : null}
              {e.status === "retiree" && coordinator && canWrite ? (
                <Button
                  size="sm"
                  onClick={() =>
                    start(async () => {
                      const res = await safeCall(restoreEntry(e.id));
                      if (!res.ok) return void toast.error(res.error);
                      toast.success("Entrée rétablie.");
                      router.refresh();
                      void load(e.id);
                    })
                  }
                >
                  <Undo2 aria-hidden /> Rétablir
                </Button>
              ) : null}
              {editing ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Annuler la modification
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {!e ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : editing ? (
          <LogComposer
            key={e.id}
            agents={agents}
            linkKinds={linkKinds}
            entry={e}
            onChanged={() => void load(e.id)}
            onDone={() => {
              setEditing(false);
              void load(e.id);
            }}
          />
        ) : (
          <div className="flex flex-col gap-4" data-testid="log-panel">
            <LogMeta entry={e} showDay />
            <ChatMarkdown body={e.body} />
            {e.status === "retiree" ? (
              <p className="text-small text-fg-muted">
                Motif du retrait : {e.retiredReason || "—"}
              </p>
            ) : null}
            <LogLinks entry={e} />
            {e.replyTo ? (
              <button
                type="button"
                className="flex cursor-pointer flex-col items-start border-l-2 border-border-strong bg-surface-2 px-2 py-1 text-left hover:border-accent"
                onClick={() => open(e.replyTo!.id)}
              >
                <span className="text-hint font-semibold text-fg-muted">
                  En réponse à {e.replyTo.author || "un message"}
                </span>
                <span className="text-small text-fg-muted">{e.replyTo.excerpt}</span>
              </button>
            ) : null}
            <div className="flex flex-col gap-2" data-testid="log-thread">
              <div className="flex items-center justify-between gap-2">
                <h3 className="label-mono text-fg-muted">
                  Réponses ({panel?.replies.length ?? 0})
                </h3>
                {canWrite && e.status === "active" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border border-border"
                    onClick={() => {
                      close();
                      reply(e);
                    }}
                  >
                    <Reply aria-hidden /> Répondre
                  </Button>
                ) : null}
              </div>
              {panel?.replies.length ? (
                <ul className="flex flex-col gap-2">
                  {panel.replies.map((x) => (
                    <li key={x.id} className="border border-border bg-surface px-3 py-2">
                      <p className="text-hint text-fg-muted">
                        <span className="font-semibold text-fg">{x.authorName}</span> ·{" "}
                        {stampOf(x.created)}
                      </p>
                      <ChatMarkdown body={x.body} />
                      <LogLinks entry={x} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-fg-muted">Aucune réponse pour l&apos;instant.</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="label-mono text-fg-muted">Lu par</h3>
              <p className="text-body">
                {e.readers.length
                  ? e.readers.map((r) => r.name).join(", ")
                  : "Personne pour l'instant."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="label-mono text-fg-muted">Historique</h3>
              <Timeline
                items={(panel?.events ?? []).map((ev) => ({
                  id: ev.id,
                  title: eventTitle(ev),
                  meta: `${ev.by} · ${stamp.format(pbDate(ev.at) ?? new Date())}`,
                  note: ev.note || (ev.field === "body" ? undefined : undefined),
                  color:
                    ev.kind === "retire"
                      ? "var(--danger)"
                      : ev.kind === "create"
                        ? "var(--info)"
                        : "var(--fg-muted)",
                }))}
              />
            </div>
          </div>
        )}
      </Sheet>

      <Dialog open={retiring} onOpenChange={(o) => (setRetiring(o), o ? null : setReason(""))}>
        <DialogContent
          title="Retirer l'entrée"
          description="L'entrée reste conservée et visible des coordinateurs, avec le motif."
        >
          <Field label="Motif" required>
            <Textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              maxLength={500}
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRetiring(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim() || pending}
              onClick={() =>
                start(async () => {
                  if (!e) return;
                  const res = await safeCall(retireEntry({ id: e.id, reason }));
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Entrée retirée.");
                  setRetiring(false);
                  setReason("");
                  router.refresh();
                  void load(e.id);
                })
              }
            >
              Retirer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
