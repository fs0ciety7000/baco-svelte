"use client";

import { TrainChip } from "@/components/ui/train-chip";
import { CheckSquare2, ClipboardList, Loader2, RefreshCw, Square } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  aleaDay,
  aleaDwell,
  aleaMarks,
  setAleaMark,
  type AleaDayData,
  type AleaMark,
} from "@/app/(app)/pmr/actions";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { subscribeLive } from "@/lib/live";
import { safeCall } from "@/lib/orders/safe-call";
import { addDays, brusselsTime, formatDay, pbDate, sinceLabel } from "@/lib/orders/time";
import { aleaDecision, type AleaDecision, type AleaDwell, type AleaGroup } from "@/lib/pmr/model";
import { cn } from "@/lib/utils";

import { CopyButton, CopyIcon, useCopy } from "./copy";
import { useDicosDaySync } from "./dicos-day-sync";

const NO_BLOCKS: AleaGroup[] = [];

const DECISION: Record<AleaDecision["status"], { label: string; tone: "danger" | "ok" | "warn" }> =
  {
    obligatoire: { label: "Obligatoire", tone: "danger" },
    non: { label: "Non obligatoire", tone: "ok" },
    verifier: { label: "À vérifier", tone: "warn" },
  };

type Filter = "tous" | "obligatoire" | "verifier" | "a-encoder";

/** « Temps d'arrêt prévus : ATMS (5) · iRail (2) » — ATMS (synchronisé par l'extension) en priorité. */
function sourceLabel(dwell: Record<string, AleaDwell>): string {
  const v = Object.values(dwell);
  const atms = v.filter((d) => d.source === "atms").length;
  const irail = v.filter((d) => d.source === "irail").length;
  const parts = [atms ? `ATMS (${atms})` : "", irail ? `iRail (${irail})` : ""].filter(Boolean);
  return parts.length
    ? `Temps d'arrêt prévus : ${parts.join(" · ")}`
    : "Temps d'arrêt prévus : non trouvés";
}

const verbOf = (g: AleaGroup) => (g.io === "IN" ? "Embarquement" : "Débarquement");
const headOf = (g: AleaGroup) =>
  `${formatDay(g.day)} · ${g.train} · ${g.station}${g.time ? ` (${g.time})` : ""} · ${verbOf(g)}`;

/**
 * Bouton « Export ALEA » + modale (demande du 9 oct. 2026). Un bloc par train, jour, gare et sens ; les PMR (ou les
 * groupes) de tous les dossiers y sont additionnées ; l'en-tête dit quels dossiers composent le bloc et le total ;
 * « Obligatoire » suit les logigrammes d'encodage (temps d'arrêt prévu : horaire ATMS synchronisé par l'extension, sinon iRail). Partagé PMR / groupes.
 */
export function AleaButton({
  kind,
  canMark,
  disabled,
  eyebrow,
  description,
  compute,
  label = "Export ALEA",
  shortLabel = "ALEA",
  pickDay,
}: {
  /** Liste d'origine : sert de portée aux blocs « encodés » (PMR et groupes séparés) ; « commun » = blocs fusionnés. */
  kind: "pmr" | "groupe" | "commun";
  label?: string;
  /** Libellé visible en mobile (< 768 px), le nom accessible reste `label` (décision du 15 oct. 2026). */
  shortLabel?: string;
  /** L'agent peut cocher « encodé » (droit d'écrire les missions) ; sinon lecture seule. */
  canMark: boolean;
  disabled: boolean;
  eyebrow: string;
  description: string;
  compute: () => AleaGroup[];
  /**
   * Choix du jour dans la fenêtre (22 oct. 2026). `listDay` = jour de la liste affichée (une seule journée : ses blocs
   * viennent de `compute`), sinon null ; les autres jours sont lus par `aleaDay` (même district). Ouvre aussi
   * « Synchroniser ce jour » par l'extension DICOS (1.10.0).
   */
  pickDay?: { listDay: string | null; today: string; district: string };
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("tous");
  const copyMandatory = useCopy();
  const copyAll = useCopy();
  const [dwell, setDwell] = useState<Record<string, AleaDwell> | null>(null);
  const [dwellError, setDwellError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const listBlocks = useMemo(() => (open ? compute() : NO_BLOCKS), [open]);
  // Jour choisi : la liste de la page si c'est son jour (et rien de synchronisé depuis), sinon lu sur le serveur.
  const [day, setDay] = useState(pickDay ? (pickDay.listDay ?? pickDay.today) : "");
  const [remote, setRemote] = useState<{ day: string; data: AleaDayData } | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const remoteWanted = Boolean(pickDay) && (day !== pickDay?.listDay || reload > 0);
  const loadingDay = remoteWanted && remote?.day !== day && !remoteError;
  const groups = !remoteWanted ? listBlocks : remote?.day === day ? remote.data.blocks : NO_BLOCKS;
  const daySync = useDicosDaySync(open && Boolean(pickDay));
  useEffect(() => {
    if (!open || !pickDay || !remoteWanted || !day) return;
    let cancelled = false;
    setRemoteError(null);
    void safeCall(aleaDay({ kind, day, district: pickDay.district })).then((res) => {
      if (cancelled) return;
      if (res.ok) setRemote({ day, data: res.data });
      else setRemoteError(res.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, day, reload, remoteWanted]);
  const syncDay = async () => {
    const r = await daySync.sync(day);
    if (!r.ok) {
      toast.error(r.error || "Synchro DICOS impossible.");
      return;
    }
    toast.success(
      `${formatDay(day)} synchronisé : ${r.missions} ${r.missions > 1 ? "trajets PMR" : "trajet PMR"}${
        r.groups ? `, ${r.groups} ${r.groups > 1 ? "groupes" : "groupe"}` : ""
      }.`,
    );
    setRemote(null);
    setReload((n) => n + 1);
  };
  // Blocs déjà saisis dans ALEA (partagés par l'équipe, en direct pendant que la fenêtre est ouverte).
  const [marks, setMarks] = useState<Record<string, AleaMark>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Coche « encodé » : par liste d'origine (un bloc commun coche ses parties PMR et groupes). Clé `liste|bloc`.
  const partsOf = useCallback(
    (g: AleaGroup): ["pmr" | "groupe", string][] =>
      kind === "commun"
        ? (Object.entries(g.parts ?? {}) as ["pmr" | "groupe", string][]).filter(([, k]) => k)
        : [[kind, g.key]],
    [kind],
  );
  const loadMarks = useCallback(async () => {
    if (!groups.length) return;
    const parts = groups.flatMap(partsOf);
    const next: Record<string, AleaMark> = {};
    for (const scope of ["pmr", "groupe"] as const) {
      const keys = parts.filter(([s]) => s === scope).map(([, k]) => k);
      if (!keys.length) continue;
      const res = await safeCall(aleaMarks(scope, keys));
      if (!res.ok) return;
      for (const [k, m] of Object.entries(res.data)) next[`${scope}|${k}`] = m;
    }
    setMarks(next);
  }, [groups, partsOf]);
  /** Marque d'un bloc : toutes ses parties encodées (la première donne l'auteur et l'heure). */
  const markOf = (g: AleaGroup): AleaMark | undefined => {
    const ms = partsOf(g).map(([s, k]) => marks[`${s}|${k}`]);
    return ms.length && ms.every(Boolean) ? ms[0] : undefined;
  };
  useEffect(() => {
    if (!open || !groups.length) return;
    void loadMarks();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeLive(["alea_marks"], () => {
      clearTimeout(timer);
      timer = setTimeout(() => void loadMarks(), 300);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [open, groups, loadMarks]);
  const toggle = async (g: AleaGroup) => {
    const done = !markOf(g);
    setBusy(g.key);
    for (const [scope, key] of partsOf(g)) {
      if (Boolean(marks[`${scope}|${key}`]) === done) continue;
      const res = await safeCall(setAleaMark(scope, key, done));
      if (!res.ok) {
        setBusy(null);
        toast.error(res.error);
        return;
      }
      setMarks((m) => {
        const next = { ...m };
        if (res.data) next[`${scope}|${key}`] = res.data;
        else delete next[`${scope}|${key}`];
        return next;
      });
    }
    setBusy(null);
  };

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
  const todo = decided.filter((x) => !markOf(x.g)).length;
  const shown = decided.filter((x) =>
    filter === "tous" ? true : filter === "a-encoder" ? !markOf(x.g) : x.d.status === filter,
  );
  const blockText = (g: AleaGroup) => [headOf(g), ...g.lines].join("\n");

  return (
    <>
      {/* type=button : le bouton vit dans la barre d'outils (formulaire des filtres, v4 lot 4). */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => {
          // Réouverture : jour de la liste affichée (elle a pu changer de période depuis).
          if (pickDay) {
            setDay(pickDay.listDay ?? pickDay.today);
            setReload(0);
            setRemote(null);
            setRemoteError(null);
          }
          setOpen(true);
        }}
        disabled={disabled && !pickDay}
        aria-label={label}
      >
        <ClipboardList aria-hidden /> <span className="md:hidden">{shortLabel}</span>
        <span className="hidden md:inline">{label}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          eyebrow={eyebrow}
          title={label}
          description={description}
          className="max-h-[92dvh] max-w-5xl"
        >
          {pickDay ? (
            <DayBar
              day={day}
              today={pickDay.today}
              onDay={(d) => {
                setRemoteError(null);
                setDay(d);
              }}
              loading={loadingDay}
              error={remoteError}
              sync={remoteWanted && remote?.day === day ? remote.data.sync : undefined}
              ext={daySync.ext}
              running={daySync.running === day}
              onSync={() => void syncDay()}
            />
          ) : null}
          {loadingDay ? (
            <p className="inline-flex items-center gap-2 py-6 text-small text-fg-muted">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Lecture des missions du jour…
            </p>
          ) : groups.length === 0 ? (
            <EmptyState
              title="Rien à exporter"
              description={
                pickDay
                  ? `Aucune assistance prévue le ${formatDay(day)}${pickDay.district ? " dans ce district" : ""}. Si DICOS en a, clique « Synchroniser ce jour ».`
                  : "Aucune assistance prévue dans la liste affichée."
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtre">
                {(
                  [
                    ["tous", `Tous (${groups.length})`],
                    ["obligatoire", `Obligatoires (${count("obligatoire")})`],
                    ["verifier", `À vérifier (${count("verifier")})`],
                    ["a-encoder", `À encoder (${todo})`],
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
                    sourceLabel(dwell)
                  )}
                </span>
              </div>
              <ul className="flex flex-col gap-3" data-testid="alea-groups">
                {shown.map(({ g, d }) => {
                  const mark = markOf(g);
                  return (
                    <li
                      key={g.key}
                      className={cn(
                        "flex flex-col border border-(--card-frame) bg-surface transition-opacity duration-(--d-base) rounded-box shadow-rest",
                        d.status === "obligatoire" && "border-l-[3px] border-l-danger",
                        d.status === "verifier" && "border-l-[3px] border-l-warn",
                        mark && "border-l-[3px] border-l-ok opacity-70",
                      )}
                      data-testid="alea-block"
                      data-encoded={mark ? "1" : undefined}
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface-2 px-3 py-2">
                        <span title="Train">
                          <TrainChip train={g.train} />
                        </span>
                        <span className="text-body-lg font-bold text-fg">{g.station}</span>
                        <Badge tone={g.io === "IN" ? "info" : "ok"}>
                          {g.io} · {verbOf(g)}
                        </Badge>
                        <span className="text-small text-fg-muted">
                          <span className="first-letter:uppercase">{formatDay(g.day)}</span>
                          {g.time ? <span className="font-mono tabular"> · {g.time}</span> : null}
                        </span>
                        <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant={mark ? "secondary" : "ghost"}
                            className={mark ? "text-ok" : "border border-border"}
                            aria-pressed={Boolean(mark)}
                            disabled={!canMark}
                            loading={busy === g.key}
                            title={
                              mark
                                ? `Encodé par ${mark!.by}${(() => {
                                    const at = pbDate(mark!.at);
                                    return at ? ` à ${brusselsTime(at)}` : "";
                                  })()}`
                                : canMark
                                  ? "Marquer comme saisi dans ALEA"
                                  : "Lecture seule"
                            }
                            onClick={() => void toggle(g)}
                            data-testid="alea-mark"
                          >
                            {mark ? <CheckSquare2 aria-hidden /> : <Square aria-hidden />}
                            {mark ? `Encodé · ${mark!.by.split(" ")[0]}` : "Encodé"}
                          </Button>
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
                              className="border border-border bg-surface-2 px-1.5 py-0.5 font-mono tabular rounded-control"
                            >
                              {x.ref} · {x.count} {(x.unit ?? g.unit) === "PMR" ? "PMR" : "pers."}
                            </span>
                          ))}
                          <span className="font-semibold text-fg">
                            Total :{" "}
                            {g.totalLabel ??
                              `${g.total} ${g.unit === "PMR" ? "PMR" : g.total > 1 ? "personnes" : "personne"}`}
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
                  );
                })}
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
                void copyMandatory.copy(
                  decided
                    .filter((x) => x.d.status === "obligatoire")
                    .map((x) => blockText(x.g))
                    .join("\n\n"),
                )
              }
            >
              <CopyIcon copied={copyMandatory.copied} />
              {copyMandatory.copied ? "Copié" : "Copier les obligatoires"}
            </Button>
            <Button
              variant="primary"
              disabled={!groups.length}
              onClick={() => void copyAll.copy(groups.map(blockText).join("\n\n"))}
            >
              <CopyIcon copied={copyAll.copied} />
              {copyAll.copied ? "Copié" : "Tout copier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Barre du jour de la fenêtre ALEA : jour (← / champ / →, « Aujourd'hui »), état de la synchro DICOS de ce jour et
 * « Synchroniser ce jour » (extension 1.10.0 + onglet DICOS ouvert).
 */
function DayBar({
  day,
  today,
  onDay,
  loading,
  error,
  sync,
  ext,
  running,
  onSync,
}: {
  day: string;
  today: string;
  onDay: (day: string) => void;
  loading: boolean;
  error: string | null;
  sync: AleaDayData["sync"] | undefined;
  ext: ReturnType<typeof useDicosDaySync>["ext"];
  running: boolean;
  onSync: () => void;
}) {
  const last = sync?.lastAt ? pbDate(sync.lastAt) : null;
  const ready = ext.state === "ready";
  const extHint =
    ext.state === "none"
      ? "Extension DICOS non détectée sur cette page."
      : ext.state === "old"
        ? `Extension ${ext.version} : la synchro depuis CSM demande la version 1.10.0.`
        : ext.state === "unlinked"
          ? "Extension non connectée à ce CSM."
          : null;
  return (
    <div
      className="mb-3 flex flex-col gap-2 border-b border-border pb-3"
      data-testid="alea-day-bar"
    >
      <div className="flex flex-wrap items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="border border-border"
          aria-label="Jour précédent"
          onClick={() => onDay(addDays(day, -1))}
        >
          ←
        </Button>
        <label className="flex w-40 flex-col gap-1 text-small text-fg-muted">
          Jour
          <DateField value={day} onValueChange={(d) => d && onDay(d)} data-testid="alea-day" />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="border border-border"
          aria-label="Jour suivant"
          onClick={() => onDay(addDays(day, 1))}
        >
          →
        </Button>
        {day !== today ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDay(today)}>
            Aujourd&apos;hui
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="sm:ml-auto"
          disabled={!ready || running}
          loading={running}
          onClick={onSync}
          title={extHint ?? "Lit ce jour dans ton onglet DICOS ouvert et l'envoie à CSM"}
          data-testid="alea-sync-day"
        >
          {running ? null : <RefreshCw aria-hidden />}
          {running ? "Synchro DICOS…" : "Synchroniser ce jour"}
        </Button>
      </div>
      <p className="text-small text-fg-muted" aria-live="polite">
        {loading ? null : error ? (
          <span className="text-danger">{error}</span>
        ) : sync === undefined ? null : !sync ? null : !last ? (
          <span className="text-warn">Ce jour n&apos;a jamais été synchronisé avec DICOS.</span>
        ) : sync.covered ? (
          <>Synchronisé avec DICOS {sinceLabel(last)}.</>
        ) : (
          <span className="text-warn">Synchro DICOS de ce jour incomplète.</span>
        )}
        {extHint ? (
          <>
            {" "}
            {extHint}{" "}
            <Link href="/extension" className="link">
              Extension CSM
            </Link>
          </>
        ) : ready && !running ? (
          <> Garde un onglet DICOS ouvert pour synchroniser.</>
        ) : null}
      </p>
    </div>
  );
}
