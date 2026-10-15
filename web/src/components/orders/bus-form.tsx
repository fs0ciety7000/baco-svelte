"use client";

import { Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { pl } from "@/lib/utils";

import {
  addDriver,
  duplicateOrder,
  saveBusOrder,
  saveTemplate,
} from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { AutosaveIndicator, FormSection, Segmented, ToggleChip } from "@/components/ui/form-kit";
import { Combobox } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import {
  C3_TYPES,
  checkBusForSend,
  emptyBus,
  parseEmails,
  type BusDraft,
  type BusLine,
} from "@/lib/orders/schemas";
import { safeCall } from "@/lib/orders/safe-call";
import { isEditable, type Status } from "@/lib/orders/status";
import { orderTrainRoute, type OrderTrain } from "@/app/(app)/commandes/train-actions";
import {
  lineId,
  routeBetween,
  sameLine,
  stopsBetween,
  suggestLines,
  type LineInfo,
} from "@/lib/orders/stops";
import { stationsFromTrain, type TrainRoute } from "@/lib/orders/train-route";
import { useAutosave } from "@/lib/orders/use-autosave";
import { BUS_STEPS, sectionState, stepStates } from "@/lib/orders/steps";
import { formatLongDay } from "@/lib/orders/time";
import { TrainChip } from "@/components/ui/train-chip";

import { SendDialog } from "./send-dialog";
import { OrderSteps } from "./order-steps";
import { OrderTicket } from "./order-ticket";
import { StartPanel, type StartPanelProps } from "./start-panel";
import { OrderActionBar } from "./order-action-bar";
import { useFormDeletion } from "./delete-order";
import { ArchivedBadge } from "./archived-badge";
import { lineLabel } from "@/lib/lines";
import { StationInput } from "./station-input";
import { TrainNumberField } from "./train-field";
import { foldStation, type StationRef } from "@/lib/stations/search";

export type BusFormProps = {
  /** Identifiant de l'écran « nouveau » (clé React + URL), pour qu'un 2e « Nouveau » reparte de zéro. */
  formKey?: string;
  orderId: string | null;
  number: number | null;
  status: Status;
  statusBeforeCancel: string;
  updated: string | null;
  initial: BusDraft;
  canWrite: boolean;
  coordinator: boolean;
  reference: {
    companies: { id: string; name: string; email: string; phone: string }[];
    drivers: { id: string; company: string; name: string; phone: string }[];
    lines: LineInfo[];
    stationRefs: StationRef[];
    companyLines: { company: string; line: string }[];
  };
  officeEmail: string;
  start?: Omit<StartPanelProps, "kind">;
  /** Suppression permise à l'agent (`deletionFor`) ; absente pour un bon neuf. */
  deletion?: { until: string | null; label: string } | null;
  /** Bon clôturé depuis plus de 30 jours (visible dans Commandes › Archives). */
  archived?: boolean;
};

export function BusForm(props: BusFormProps) {
  const { reference, canWrite } = props;
  const stationRefs = reference.stationRefs;
  const router = useRouter();
  const [d, setD] = useState<BusDraft>(props.initial);
  const [sendOpen, setSendOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, start] = useTransition();
  const editable = canWrite && isEditable(props.status);
  const set = useCallback(
    <K extends keyof BusDraft>(k: K, v: BusDraft[K]) => setD((x) => ({ ...x, [k]: v })),
    [],
  );

  const onCreated = useCallback(
    (id: string) => {
      // Garde la même route (sinon Next remonterait le formulaire au prochain rafraîchissement) : ?id= permet
      // de recharger la page sans perdre la commande.
      window.history.replaceState(
        null,
        "",
        `/commandes/nouveau?id=${id}${props.formKey ? `&k=${props.formKey}` : ""}`,
      );
    },
    [props.formKey],
  );
  const autosave = useAutosave({
    value: d,
    enabled: editable,
    initialId: props.orderId,
    initialUpdated: props.updated,
    save: saveBusOrder,
    onCreated,
  });
  const orderId = autosave.id;
  const number = autosave.number ?? props.number;
  const del = useFormDeletion({
    kind: "bus",
    serverDeletion: props.deletion,
    initialId: props.orderId,
    id: orderId,
    number,
    relation: d.relation,
  });

  const company = reference.companies.find((c) => c.id === d.company);
  const missing = useMemo(
    () => checkBusForSend(d, { companyEmail: company?.email ?? "" }),
    [d, company?.email],
  );
  const err = (field: string) =>
    showErrors ? missing.find((m) => m.field === field)?.message : undefined;
  // Rail d'étapes (v4 lot 4) : mêmes champs manquants que la validation d'envoi.
  const steps = useMemo(() => stepStates(BUS_STEPS, missing), [missing]);
  const stepOf = (id: string) =>
    sectionState(
      steps.find((s) => s.id === id),
      showErrors,
    );

  // Trajet tiré du référentiel des trains (14 oct. 2026) : le serveur cherche les trains qui passent par les deux gares
  // (Server Action, le navigateur ne reçoit que le résultat) ; repli sur le réseau des lignes (`routeBetween`) quand aucun
  // train ne les relie. Les lignes et arrêts ne sont posés d'office qu'après un changement de gare par le rédacteur
  // (jamais à l'ouverture d'un bon existant) ; tout reste modifiable.
  const placeKey = (o: string, dst: string, day: string) =>
    `${foldStation(o)}|${foldStation(dst)}|${day}`;
  const [trainInfo, setTrainInfo] = useState<{ key: string; route: TrainRoute | null } | null>(
    null,
  );
  const fetchedKey = useRef("");
  const applyPending = useRef(false);
  const trainRoute =
    trainInfo?.key === placeKey(d.origin, d.destination, d.order_date) ? trainInfo.route : null;

  /** Lignes et arrêts posés d'office : d'après les trains, sinon d'après le réseau des lignes. */
  const autoRoute = (route: TrainRoute | null, x: BusDraft) => {
    if (route) {
      const leg = x.direct ? route.direct : route.omnibus;
      return { lines: leg.lines, stops: leg.stops };
    }
    const r = routeBetween(reference.lines, x.origin, x.destination);
    return r ? { lines: r.lines, stops: x.direct ? r.transfers : r.stops } : null;
  };
  const autoRouteRef = useRef(autoRoute);
  useEffect(() => {
    autoRouteRef.current = autoRoute;
  });

  useEffect(() => {
    const o = d.origin.trim();
    const dst = d.destination.trim();
    if (o.length < 2 || dst.length < 2 || foldStation(o) === foldStation(dst)) return;
    const key = placeKey(o, dst, d.order_date);
    if (fetchedKey.current === key) return;
    let live = true;
    const t = setTimeout(async () => {
      const route = await orderTrainRoute({ origin: o, destination: dst, day: d.order_date }).catch(
        () => null,
      );
      if (!live) return;
      fetchedKey.current = key;
      setTrainInfo({ key, route });
      if (!applyPending.current) return;
      setD((x) => {
        if (placeKey(x.origin, x.destination, x.order_date) !== key) return x;
        const next = autoRouteRef.current(route, x);
        if (!next) return x;
        applyPending.current = false;
        return { ...x, ...next };
      });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [d.origin, d.destination, d.order_date]);

  // Lignes : celles des trains (ou de l'itinéraire du réseau) d'abord, puis celles qui desservent O ou D, puis celles
  // de la société ; « L.96 » et « 96 » ne font qu'une.
  const route = useMemo(
    () => routeBetween(reference.lines, d.origin, d.destination),
    [reference.lines, d.origin, d.destination],
  );
  const suggested = useMemo(
    () => [
      ...(trainRoute ? [...trainRoute.omnibus.lines, ...trainRoute.direct.lines] : []),
      ...(route?.lines ?? []),
      ...suggestLines(reference.lines, d.origin, d.destination),
    ],
    [trainRoute, route, reference.lines, d.origin, d.destination],
  );
  const lineChoices = useMemo(() => {
    const own = reference.companyLines.filter((l) => l.company === d.company).map((l) => l.line);
    const seen = new Set<string>();
    return [...d.lines, ...suggested, ...own]
      .filter((l) => {
        const k = lineId(l);
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 24);
  }, [reference.companyLines, d.company, d.lines, suggested]);

  // Repli (réseau des lignes, 11 oct. 2026) : itinéraire sur plusieurs lignes au besoin, limité aux lignes cochées s'il y
  // en a ; bus direct = gares de correspondance seulement.
  const refLines = (lines: string[]) =>
    reference.lines.filter((l) => sameLine(lines, l.line)).map((l) => l.line);
  const routeFor = (lines: string[], origin: string, destination: string) =>
    routeBetween(reference.lines, origin, destination, refLines(lines));
  const stopsFor = (lines: string[], origin: string, destination: string, direct: boolean) => {
    const r = routeFor(lines, origin, destination);
    if (r) return direct ? r.transfers : r.stops;
    return direct ? [] : stopsBetween(reference.lines, refLines(lines), origin, destination);
  };

  // Gares des lignes cochées (origine et destination exclues), dans l'ordre de chaque ligne.
  const lineStations = useMemo(() => {
    const ends = new Set([foldStation(d.origin), foldStation(d.destination)]);
    return reference.lines
      .filter((l) => sameLine(d.lines, l.line))
      .map((l) => ({
        line: l.line,
        stations: l.stations.filter((st) => !ends.has(foldStation(st))),
      }))
      .filter((l) => l.stations.length);
  }, [reference.lines, d.lines, d.origin, d.destination]);

  // Arrêts proposés : gares où au moins un train s'arrête entre les deux (dans l'ordre du trajet), sinon l'itinéraire du
  // réseau ; un arrêt déjà coché ailleurs (bon repris, saisie antérieure) reste visible.
  const autoStops = useMemo(() => {
    const base = trainRoute
      ? trainRoute.proposed
      : (routeFor(d.lines, d.origin, d.destination)?.stops ??
        stopsBetween(reference.lines, refLines(d.lines), d.origin, d.destination));
    const known = new Set(
      [...base, ...lineStations.flatMap((l) => l.stations)].map((s) => foldStation(s)),
    );
    return [...base, ...d.stops.filter((s) => !known.has(foldStation(s)))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainRoute, reference.lines, d.lines, d.origin, d.destination, d.stops, lineStations]);

  // Ajouter / retirer un arrêt : ordre de l'itinéraire d'abord, puis celui des lignes cochées.
  const toggleStop = (stop: string, on: boolean) =>
    setD((x) => {
      const picked = new Set(on ? [...x.stops, stop] : x.stops.filter((st) => st !== stop));
      const order = [...autoStops, ...lineStations.flatMap((l) => l.stations), ...x.stops];
      const seen = new Set<string>();
      const stops = order.filter((st) => {
        if (!picked.has(st) || seen.has(foldStation(st))) return false;
        seen.add(foldStation(st));
        return true;
      });
      return { ...x, stops };
    });

  // Origine / destination : lignes et arrêts posés d'office dès que le trajet est connu (réponse du serveur, ou tout de
  // suite si ce trajet vient d'être calculé). Une simple correction d'écriture (« mons » → « Mons ») ne touche à rien.
  const setPlace = (field: "origin" | "destination", value: string) => {
    const next = { ...d, [field]: value };
    const key = placeKey(next.origin, next.destination, next.order_date);
    if (key === placeKey(d.origin, d.destination, d.order_date)) return set(field, value);
    if (trainInfo?.key === key) {
      applyPending.current = false;
      const auto = autoRoute(trainInfo.route, next);
      return setD((x) => ({ ...x, [field]: value, ...(auto ?? {}) }));
    }
    applyPending.current = true;
    set(field, value);
  };

  // Omnibus / direct : arrêts recalculés (trains : le plus omnibus ou le plus direct ; repli : correspondances).
  const setDirect = (direct: boolean) =>
    setD((x) => ({
      ...x,
      direct,
      stops: trainRoute
        ? (direct ? trainRoute.direct : trainRoute.omnibus).stops
        : stopsFor(x.lines, x.origin, x.destination, direct),
    }));

  // Cocher / décocher une ligne. Repli sur le réseau : itinéraire limité aux lignes cochées (aucune : libre). Trajet
  // tiré des trains : les arrêts ne bougent pas (ils viennent des trains, pas des lignes).
  const toggleLine = (line: string, on: boolean) => {
    const lines = on ? [...d.lines, line] : d.lines.filter((l) => lineId(l) !== lineId(line));
    if (trainRoute) return set("lines", lines);
    const stops = stopsFor(lines, d.origin, d.destination, d.direct);
    setD((x) => ({ ...x, lines, stops }));
  };

  // N° de train : gares (gardées si le train y passe), lignes et arrêts du train ; annulable.
  const [trainUndo, setTrainUndo] = useState<BusDraft | null>(null);
  const applyTrain = (t: OrderTrain) => {
    const s = stationsFromTrain(t, d.origin, d.destination);
    if (!s.leg) return;
    applyPending.current = false;
    setTrainUndo(d);
    setD({
      ...d,
      train_number: String(t.number),
      origin: s.origin,
      destination: s.destination,
      lines: s.leg.lines,
      stops: s.leg.stops,
      stops_mode: "auto",
    });
  };
  const setBus = (i: number, patch: Partial<BusLine>) =>
    setD((x) => ({ ...x, buses: x.buses.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const addBus = () =>
    setD((x) => ({ ...x, buses: [...x.buses, emptyBus(x.buses.at(-1)?.planned ?? "")] }));
  const removeBus = (i: number) =>
    setD((x) => ({
      ...x,
      buses: x.buses.length > 1 ? x.buses.filter((_, j) => j !== i) : x.buses,
    }));

  const companyDrivers = reference.drivers.filter((dr) => dr.company === d.company);
  const [extraDrivers, setExtraDrivers] = useState<typeof reference.drivers>([]);
  const drivers = [...companyDrivers, ...extraDrivers.filter((x) => x.company === d.company)];
  // Listes longues avec recherche (refonte R2) : sociétés et chauffeurs de la société.
  const companyOptions = useMemo(
    () =>
      reference.companies.map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.email ? undefined : "Sans adresse e-mail",
      })),
    [reference.companies],
  );
  const driverOptions = drivers.map((dr) => ({ value: dr.id, label: dr.name }));

  const prepareSend = async () => {
    setShowErrors(true);
    await autosave.flush({ create: true });
    setSendOpen(true);
  };

  const duplicate = () =>
    start(async () => {
      if (!orderId) return;
      await autosave.flush();
      const res = await safeCall(duplicateOrder({ kind: "bus", id: orderId }));
      if (!res.ok) return void toast.error(res.error);
      toast.success("Copie créée (brouillon daté d'aujourd'hui).");
      router.push(`/commandes/bus/${res.data.id}`);
    });

  const summary = {
    incident: [C3_TYPES.find((t) => t.value === d.c3_type)?.label, d.reason, d.order_date]
      .filter(Boolean)
      .join(" · "),
    trajet:
      d.origin || d.destination
        ? `${d.origin || "?"} → ${d.destination || "?"}${d.direct ? " · direct" : ""}`
        : "",
    fournisseur: company?.name ?? "",
    bus: `${d.buses.filter((b) => !b.cancelled).length} bus${d.buses[0]?.planned ? ` · ${d.buses[0].planned}` : ""}`,
  };

  return (
    // v4 lot 4 : rail d'étapes collant (≥ 1280 px) | formulaire en cartes | aperçu en billet (≥ 1024 px).
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,45rem)_minmax(16rem,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[9.5rem_minmax(0,46rem)_minmax(17rem,21rem)] xl:gap-5">
      <OrderSteps steps={steps} className="sticky top-20 hidden xl:flex" />
      <form
        className="flex min-w-0 flex-col gap-3"
        aria-label="Bon de commande bus"
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && editable) {
            e.preventDefault();
            void prepareSend();
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-h3 font-semibold text-fg tabular" data-testid="order-number">
              {number ? `C3 n° ${number}` : "Nouveau bon"}
            </span>
            <StatusBadge status={props.status} />
            {props.archived ? <ArchivedBadge /> : null}
          </div>
          {editable ? (
            <AutosaveIndicator
              state={autosave.state}
              savedAt={autosave.savedAt}
              onRetry={() => void autosave.flush()}
            />
          ) : (
            <span className="label-mono text-fg-muted">Lecture seule</span>
          )}
        </div>
        {autosave.error ? (
          <p role="alert" className="border border-danger/60 px-3 py-2 text-body text-danger">
            {autosave.error}
          </p>
        ) : null}

        {/* Mobile : l'aperçu passe en tête, en version compacte (trajet, date, PDF). */}
        <OrderTicket
          compact
          className="lg:hidden"
          eyebrow={`Aperçu du bon${number ? ` · C3 n° ${number}` : ""}`}
          route={`${d.origin || "Origine"} → ${d.destination || "Destination"}`}
          when={busWhen(d)}
          pdfHref={orderId ? `/api/commandes/bus/${orderId}/pdf` : ""}
        />

        {!orderId && props.start && editable ? <StartPanel kind="bus" {...props.start} /> : null}

        <fieldset disabled={!editable} className="contents">
          <FormSection
            id="bon-incident"
            index={1}
            title="Incident"
            summary={summary.incident}
            state={stepOf("bon-incident")}
          >
            <Segmented
              label="Type C3"
              value={d.c3_type}
              onChange={(v) => set("c3_type", v)}
              options={C3_TYPES}
              disabled={!editable}
            />
            <Field label="Motif" required error={err("reason")}>
              <Input
                value={d.reason}
                onChange={(e) => set("reason", e.target.value)}
                placeholder="Ex. dérangement de signalisation L.96"
                maxLength={2000}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Date de circulation" required error={err("order_date")}>
                <DateField value={d.order_date} onValueChange={(v) => set("order_date", v)} />
              </Field>
              <Field label="Heure d'appel">
                <TimeField value={d.call_time} onValueChange={(v) => set("call_time", v)} />
              </Field>
              <Field label="Relation / n° d'ordre" className="col-span-2 sm:col-span-1">
                <Input
                  value={d.relation}
                  onChange={(e) => set("relation", e.target.value)}
                  placeholder="TC_…"
                  maxLength={200}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            id="bon-trajet"
            index={2}
            title="Trajet"
            summary={summary.trajet}
            state={stepOf("bon-trajet")}
          >
            <TrainNumberField
              value={d.train_number}
              onChange={(v) => {
                set("train_number", v);
                setTrainUndo(null);
              }}
              day={d.order_date}
              disabled={!editable}
              autoApply={!d.destination.trim()}
              onApply={applyTrain}
              onUndo={
                trainUndo
                  ? () => {
                      setD(trainUndo);
                      setTrainUndo(null);
                    }
                  : null
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Origine" required error={err("origin")}>
                <StationInput
                  value={d.origin}
                  onChange={(v) => setPlace("origin", v)}
                  refs={stationRefs}
                  disabled={!editable}
                />
              </Field>
              <Field label="Destination" required error={err("destination")}>
                <StationInput
                  value={d.destination}
                  onChange={(v) => setPlace("destination", v)}
                  refs={stationRefs}
                  disabled={!editable}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Segmented
                label="Desserte"
                value={d.direct ? "direct" : "omnibus"}
                onChange={(v) => setDirect(v === "direct")}
                options={[
                  { value: "omnibus", label: "Omnibus" },
                  { value: "direct", label: "Direct" },
                ]}
                disabled={!editable}
              />
              <Segmented
                label="Sens"
                value={d.round_trip ? "ar" : "as"}
                onChange={(v) => set("round_trip", v === "ar")}
                options={[
                  { value: "as", label: "Aller simple" },
                  { value: "ar", label: "Aller-retour" },
                ]}
                disabled={!editable}
              />
            </div>
            {lineChoices.length ? (
              <div className="flex flex-col gap-2">
                <span className="text-small font-medium text-fg">Lignes concernées</span>
                <div className="flex flex-wrap gap-2">
                  {lineChoices.map((l) => (
                    <ToggleChip
                      key={l}
                      pressed={sameLine(d.lines, l)}
                      onPressedChange={(on) => toggleLine(l, on)}
                      disabled={!editable}
                    >
                      {lineLabel(l)}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-small text-fg-muted">
                Saisis l&apos;origine et la destination pour proposer les lignes.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-small font-medium text-fg">
                  {d.direct ? "Arrêts (direct)" : "Arrêts intermédiaires"}
                </span>
                <Segmented
                  label="Saisie des arrêts"
                  value={d.stops_mode}
                  onChange={(v) => set("stops_mode", v)}
                  options={[
                    { value: "auto", label: "Par ligne" },
                    { value: "manuel", label: "Saisie libre" },
                  ]}
                  disabled={!editable}
                />
              </div>
              {d.stops_mode === "manuel" ? (
                <Textarea
                  aria-label="Arrêts (saisie libre)"
                  value={d.stops_manual}
                  onChange={(e) => set("stops_manual", e.target.value)}
                  placeholder="Un arrêt par ligne"
                  maxLength={5000}
                />
              ) : (
                <>
                  {autoStops.length ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-small text-fg-muted" data-testid="route-source">
                        {trainRoute
                          ? `Arrêts des trains entre les deux gares (${trainRoute.trains} ${pl(trainRoute.trains, "train")}) · cochés : ${
                              d.direct
                                ? `direct, ${trainRoute.direct.type} ${trainRoute.direct.number}`
                                : `omnibus, ${trainRoute.omnibus.type} ${trainRoute.omnibus.number}`
                            }`
                          : `Itinéraire par les lignes${d.direct ? " (direct : correspondances cochées)" : ""}`}
                      </span>
                      <div className="flex flex-wrap gap-2" data-testid="route-stops">
                        {autoStops.map((st) => (
                          <ToggleChip
                            key={st}
                            pressed={d.stops.includes(st)}
                            disabled={!editable}
                            onPressedChange={(on) => toggleStop(st, on)}
                          >
                            {st}
                          </ToggleChip>
                        ))}
                      </div>
                    </div>
                  ) : trainRoute ? (
                    <p className="text-small text-fg-muted">
                      Aucun train ne s&apos;arrête entre ces deux gares : ajoute des arrêts depuis
                      les gares des lignes ci-dessous, ou passe en saisie libre.
                    </p>
                  ) : (
                    <p className="text-small text-fg-muted">
                      Aucun itinéraire trouvé : choisis les arrêts dans les gares des lignes
                      ci-dessous, ou passe en saisie libre.
                    </p>
                  )}
                  {/* Toutes les gares des lignes cochées (demande du 11 oct. 2026) : n'importe quel arrêt, au choix. */}
                  {lineStations.length ? (
                    <details
                      className="group rounded-box border border-border"
                      open={!autoStops.length}
                    >
                      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-small font-medium text-fg">
                        Toutes les gares des lignes cochées
                      </summary>
                      <div className="flex flex-col gap-3 px-3 pb-3" data-testid="line-stations">
                        {lineStations.map((l) => (
                          <div key={l.line} className="flex flex-col gap-1.5">
                            <span className="text-small text-fg-muted">{lineLabel(l.line)}</span>
                            <div className="flex flex-wrap gap-2">
                              {l.stations.map((st) => (
                                <ToggleChip
                                  key={st}
                                  pressed={d.stops.includes(st)}
                                  disabled={!editable}
                                  onPressedChange={(on) => toggleStop(st, on)}
                                >
                                  {st}
                                </ToggleChip>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </>
              )}
            </div>
          </FormSection>

          <FormSection
            id="bon-fournisseur"
            index={3}
            title="Fournisseur"
            summary={summary.fournisseur}
            state={stepOf("bon-fournisseur")}
          >
            <Field
              label="Société"
              required
              error={err("company")}
              hint={
                company
                  ? company.email ||
                    "Pas d'adresse e-mail enregistrée : saisis-la ci-dessous (facultatif)."
                  : undefined
              }
            >
              <Combobox
                value={d.company}
                onValueChange={(v) => set("company", v)}
                options={companyOptions}
                placeholder="Choisir une société…"
                emptyText="Aucune société"
                data-testid="bus-company"
              />
            </Field>
            {company && !company.email ? (
              <Field
                label="E-mail de la société"
                hint="Facultatif : sans adresse, le bon est généré en PDF (pas de brouillon e-mail)."
              >
                <Input
                  type="email"
                  inputMode="email"
                  value={d.company_email}
                  onChange={(e) => set("company_email", e.target.value)}
                  maxLength={500}
                  placeholder="commandes@societe.be"
                />
              </Field>
            ) : null}
            {company?.phone ? (
              <p className="text-small text-fg-muted">
                Tél.{" "}
                <a className="link" href={`tel:${company.phone.replace(/\s/g, "")}`}>
                  {company.phone}
                </a>
              </p>
            ) : null}
          </FormSection>

          <FormSection
            id="bon-bus"
            index={4}
            title="Bus"
            summary={summary.bus}
            state={stepOf("bon-bus")}
          >
            <ol className="flex flex-col gap-3">
              {d.buses.map((b, i) => (
                <li
                  key={i}
                  className={`flex flex-col gap-3 border p-3 ${b.cancelled ? "border-danger/50 bg-[color-mix(in_oklab,var(--danger)_6%,var(--surface))]" : "border-border"}`}
                  data-testid="bus-row"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`label-mono ${b.cancelled ? "text-danger line-through" : "text-fg-muted"}`}
                    >
                      Bus {i + 1}
                      {b.cancelled ? " · annulé" : ""}
                    </span>
                    {d.buses.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirer le bus ${i + 1}`}
                        onClick={() => removeBus(i)}
                      >
                        <Trash2 />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Field label="Heure prévue">
                      <TimeField
                        value={b.planned}
                        onValueChange={(v) => setBus(i, { planned: v })}
                      />
                    </Field>
                    <Field label="Heure réelle">
                      <TimeField value={b.actual} onValueChange={(v) => setBus(i, { actual: v })} />
                    </Field>
                    <Field label="Heure confirmée">
                      <TimeField
                        value={b.confirmed}
                        onValueChange={(v) => setBus(i, { confirmed: v })}
                      />
                    </Field>
                    <Field label="Démobilisation">
                      <TimeField value={b.demob} onValueChange={(v) => setBus(i, { demob: v })} />
                    </Field>
                    <Field label="Plaque">
                      <Input
                        value={b.plate}
                        onChange={(e) => setBus(i, { plate: e.target.value.toUpperCase() })}
                        maxLength={40}
                      />
                    </Field>
                    <Field label="Chauffeur" className="sm:col-span-2">
                      <Combobox
                        value={b.driver}
                        onValueChange={(v) => setBus(i, { driver: v })}
                        options={driverOptions}
                        placeholder={drivers.length ? "Choisir un chauffeur…" : "—"}
                        emptyText="Aucun chauffeur pour cette société"
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
                      <Checkbox
                        checked={b.specific_route}
                        onCheckedChange={(v) => setBus(i, { specific_route: v === true })}
                      />
                      Trajet spécifique
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
                      <Checkbox
                        checked={b.cancelled}
                        onCheckedChange={(v) => setBus(i, { cancelled: v === true })}
                      />
                      Bus annulé
                    </label>
                  </div>
                  {b.specific_route ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Origine de ce bus">
                        <StationInput
                          value={b.origin}
                          onChange={(v) => setBus(i, { origin: v })}
                          refs={stationRefs}
                          disabled={!editable}
                        />
                      </Field>
                      <Field label="Destination de ce bus">
                        <StationInput
                          value={b.destination}
                          onChange={(v) => setBus(i, { destination: v })}
                          refs={stationRefs}
                          disabled={!editable}
                        />
                      </Field>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
            {err("buses") ? (
              <p role="alert" className="text-hint text-danger">
                {err("buses")}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={addBus}
                disabled={d.buses.length >= 50}
              >
                <Plus aria-hidden /> Ajouter un bus
              </Button>
              {d.company ? (
                <NewDriverButton
                  companyId={d.company}
                  onAdded={(dr) => setExtraDrivers((x) => [...x, dr])}
                />
              ) : null}
            </div>
            <Field label="Capacité par bus" className="max-w-40">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                value={d.bus_capacity}
                onChange={(e) => set("bus_capacity", Number(e.target.value) || 0)}
              />
            </Field>
          </FormSection>

          <FormSection
            id="bon-options"
            index={5}
            title="Options"
            summary="Voyageurs, PMR, notes"
            defaultOpen={false}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Voyageurs">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={d.passengers}
                  onChange={(e) => set("passengers", Number(e.target.value) || 0)}
                />
              </Field>
              <Field label="PMR">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={d.pmr_count}
                  onChange={(e) => set("pmr_count", Number(e.target.value) || 0)}
                />
              </Field>
            </div>
            <Field label="Notes internes" hint="Non reprises sur le bon envoyé.">
              <Textarea
                value={d.notes}
                onChange={(e) => set("notes", e.target.value)}
                maxLength={4000}
              />
            </Field>
          </FormSection>
        </fieldset>

        <OrderActionBar
          kind="bus"
          orderId={orderId ?? undefined}
          status={props.status}
          statusBeforeCancel={props.statusBeforeCancel}
          coordinator={props.coordinator}
          buses={d.buses}
          editable={editable}
          canWrite={canWrite}
          busy={pending}
          flush={autosave.flush}
          onSend={() => void prepareSend()}
          onCreate={() => void autosave.flush({ create: true })}
          onDuplicate={duplicate}
          onTemplate={() => setTplOpen(true)}
          listHref="/commandes"
          deletion={del.deletion}
          deleteLabel={del.label}
        />
      </form>

      <aside className="hidden lg:sticky lg:top-20 lg:block" aria-label="Aperçu du bon">
        <BusPreview draft={d} companyName={company?.name ?? ""} number={number} orderId={orderId} />
      </aside>

      <SendDialog
        kind="bus"
        id={orderId}
        open={sendOpen}
        onOpenChange={setSendOpen}
        missing={missing}
        to={parseEmails([company?.email ?? "", d.company_email]).join("; ")}
        cc={props.officeEmail}
        flush={autosave.flush}
      />
      <TemplateDialog open={tplOpen} onOpenChange={setTplOpen} kind="bus" data={d} />
    </div>
  );
}

/** « jeudi 15 octobre 2026 · départ 15:30 » (date de circulation et premier départ prévu). */
function busWhen(d: BusDraft): string {
  const first = d.buses.find((b) => !b.cancelled && b.planned)?.planned;
  return [d.order_date ? formatLongDay(d.order_date) : "", first ? `départ ${first}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** Aperçu du bon bus en forme de billet (v4 lot 4) : le bon lui-même, itinéraire en pointillés de gares. */
function BusPreview({
  draft: d,
  companyName,
  number,
  orderId,
}: {
  draft: BusDraft;
  companyName: string;
  number: number | null;
  orderId: string | null;
}) {
  const active = d.buses.filter((b) => !b.cancelled);
  const stops = d.stops_mode === "manuel" ? d.stops_manual.split("\n").filter(Boolean) : d.stops;
  const route = d.origin && d.destination ? [d.origin, ...stops, d.destination] : [];
  return (
    <OrderTicket
      data-testid="order-ticket"
      eyebrow={`Aperçu du bon${number ? ` · C3 n° ${number}` : ""}`}
      route={`${d.origin || "Origine"} → ${d.destination || "Destination"}`}
      when={busWhen(d)}
      rows={[
        { label: "Type", value: C3_TYPES.find((t) => t.value === d.c3_type)?.label ?? "—" },
        ...(d.train_number
          ? [{ label: "Train", value: <TrainChip train={d.train_number} size="sm" /> }]
          : []),
        {
          label: "Desserte",
          value: `${d.direct ? "Direct" : "Omnibus"}${stops.length ? ` · ${stops.length} ${pl(stops.length, "arrêt")}` : ""}${d.round_trip ? " · A-R" : ""}`,
        },
        companyName
          ? { label: "Société", value: companyName }
          : { label: "Société", value: "à choisir", tone: "danger" as const },
        {
          label: "Bus",
          value: (
            <span className="tabular">
              {active.length} × {d.bus_capacity} places
              {active[0]?.planned ? ` · ${active.map((b) => b.planned || "—").join(", ")}` : ""}
            </span>
          ),
        },
      ]}
      stops={route}
      pdfHref={orderId ? `/api/commandes/bus/${orderId}/pdf` : ""}
      footer={
        <p className="text-hint text-fg-muted">
          Raccourci : <kbd className="font-mono">Ctrl</kbd> +{" "}
          <kbd className="font-mono">Entrée</kbd> pour préparer l&apos;envoi.
        </p>
      }
    />
  );
}

function NewDriverButton({
  companyId,
  onAdded,
}: {
  companyId: string;
  onAdded: (d: { id: string; company: string; name: string; phone: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> Nouveau chauffeur
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Nouveau chauffeur" description="Ajouté à la société choisie.">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await safeCall(addDriver({ company: companyId, name, phone }));
                if (!res.ok) return void toast.error(res.error);
                onAdded(res.data);
                toast.success("Chauffeur ajouté.");
                setOpen(false);
                setName("");
                setPhone("");
              });
            }}
          >
            <Field label="Nom" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                required
                autoFocus
              />
            </Field>
            <Field label="Téléphone">
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={100}
              />
            </Field>
            <DialogFooter>
              <Button type="submit" variant="primary" loading={pending}>
                Ajouter
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function TemplateDialog({
  open,
  onOpenChange,
  kind,
  data,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  kind: "bus" | "taxi";
  data: unknown;
}) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Enregistrer comme modèle"
        description="Le modèle est partagé avec toute l'équipe. Date, heures confirmées et plaques ne sont pas reprises."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await safeCall(saveTemplate({ kind, name, data }));
              if (!res.ok) return void toast.error(res.error);
              toast.success("Modèle enregistré.");
              onOpenChange(false);
              setName("");
            });
          }}
        >
          <Field label="Nom du modèle" required hint="Ex. « Mons → Tournai omnibus, 2 bus »">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={120}
              required
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" loading={pending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
