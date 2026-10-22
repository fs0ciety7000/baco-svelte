"use client";

import { pl } from "@/lib/utils";
import { ExternalLink, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  createPmrClient,
  duplicateOrder,
  findPmrClients,
  saveTaxiOrder,
  suggestDossiers,
  type DossierSuggestion,
} from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { AutosaveIndicator, FormSection, Segmented } from "@/components/ui/form-kit";
import { Combobox } from "@/components/ui/combobox";
import { Input, Textarea } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { DateField } from "@/components/ui/date-field";
import { TimeField } from "@/components/ui/time-field";
import {
  BILLING,
  checkTaxiForSend,
  parseEmails,
  PMR_CAUSES,
  PMR_TYPES,
  type TaxiDraft,
} from "@/lib/orders/schemas";
import { safeCall } from "@/lib/orders/safe-call";
import { isEditable, type Status } from "@/lib/orders/status";
import { useAutosave } from "@/lib/orders/use-autosave";
import { sectionState, stepStates, TAXI_STEPS } from "@/lib/orders/steps";
import { formatLongDay } from "@/lib/orders/time";
import { TrainChip } from "@/components/ui/train-chip";

import { TemplateDialog } from "./bus-form";
import { SendDialog } from "./send-dialog";
import { OrderSteps } from "./order-steps";
import { OrderTicket } from "./order-ticket";
import { StartPanel, type StartPanelProps } from "./start-panel";
import { OrderActionBar } from "./order-action-bar";
import { ArchivedBadge } from "./archived-badge";
import { useFormDeletion } from "./delete-order";
import { StationInput } from "./station-input";
import { ViaStationsField } from "./via-stations-field";
import { cleanVias, routeWithVias } from "@/lib/orders/via";
import { DOSSIER_HINT, normalizeDossier } from "@/lib/orders/dossier";
import { TrainNumberField } from "./train-field";
import type { OrderTrain } from "@/app/(app)/commandes/train-actions";
import { stationsFromTrain } from "@/lib/orders/train-route";
import type { StationRef } from "@/lib/stations/search";

export type Client = {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  type: string;
};

export type TaxiFormProps = {
  /** Identifiant de l'écran « nouveau » (clé React + URL), pour qu'un 2e « Nouveau » reparte de zéro. */
  formKey?: string;
  orderId: string | null;
  number: number | null;
  status: Status;
  statusBeforeCancel: string;
  updated: string | null;
  initial: TaxiDraft;
  canWrite: boolean;
  canPmr: boolean;
  coordinator: boolean;
  client: Client | null;
  reference: {
    companies: { id: string; name: string; emails: string[]; phones: string[]; places: string[] }[];
    stationRefs: StationRef[];
  };
  officeEmail: string;
  start?: Omit<StartPanelProps, "kind">;
  /** Suppression permise à l'agent (`deletionFor`) ; absente pour un bon neuf. */
  deletion?: { until: string | null; label: string } | null;
  /** Bon clôturé depuis plus de 30 jours (visible dans Commandes › Archives). */
  archived?: boolean;
};

export function TaxiForm(props: TaxiFormProps) {
  const { reference, canWrite } = props;
  const stationRefs = reference.stationRefs;
  const router = useRouter();
  const [d, setD] = useState<TaxiDraft>(props.initial);
  const [client, setClient] = useState<Client | null>(props.client);
  const [sendOpen, setSendOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, start] = useTransition();
  const editable = canWrite && isEditable(props.status);
  const set = useCallback(
    <K extends keyof TaxiDraft>(k: K, v: TaxiDraft[K]) => setD((x) => ({ ...x, [k]: v })),
    [],
  );

  const onCreated = useCallback(
    (id: string) => {
      window.history.replaceState(
        null,
        "",
        `/commandes/taxi/nouveau?id=${id}${props.formKey ? `&k=${props.formKey}` : ""}`,
      );
    },
    [props.formKey],
  );
  const autosave = useAutosave({
    value: d,
    enabled: editable,
    initialId: props.orderId,
    initialUpdated: props.updated,
    save: saveTaxiOrder,
    onCreated,
  });
  const orderId = autosave.id;
  const number = autosave.number ?? props.number;
  const del = useFormDeletion({
    kind: "taxi",
    serverDeletion: props.deletion,
    initialId: props.orderId,
    id: orderId,
    number,
  });

  const company = reference.companies.find((c) => c.id === d.taxi_company);
  // Liste longue avec recherche (refonte R2) : lieux desservis en aide (cherchables aussi).
  const companyOptions = useMemo(
    () =>
      reference.companies.map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.places.length ? c.places.slice(0, 3).join(", ") : undefined,
      })),
    [reference.companies],
  );
  const to = parseEmails([...(company?.emails ?? []), d.taxi_email]).join("; ");
  const missing = useMemo(() => checkTaxiForSend(d, { companyEmail: to }), [d, to]);
  const err = (f: string) => (showErrors ? missing.find((m) => m.field === f)?.message : undefined);
  // Rail d'étapes (v4 lot 4) : mêmes champs manquants que la validation d'envoi.
  const steps = useMemo(() => stepStates(TAXI_STEPS, missing), [missing]);
  const stepOf = (id: string) =>
    sectionState(
      steps.find((s) => s.id === id),
      showErrors,
    );

  // Aller-retour : le retour est pré-rempli à l'inverse de l'aller.
  const setRoundTrip = (on: boolean) =>
    setD((x) => ({
      ...x,
      round_trip: on,
      return_day: on ? x.return_day || x.trip_day : "",
      return_from: on ? x.return_from || x.to_station : "",
      return_to: on ? x.return_to || x.from_station : "",
    }));

  // N° de train (14 oct. 2026) : départ / arrivée gardés si le train y passe, sinon son origine / son terminus ; heure de
  // prise en charge = départ du train à la gare de départ (l'heure par défaut d'un bon neuf est l'heure courante, pas un
  // choix du rédacteur). « Annuler la reprise » rétablit tout.
  const [trainUndo, setTrainUndo] = useState<TaxiDraft | null>(null);
  const applyTrain = (t: OrderTrain) => {
    const s = stationsFromTrain(t, d.from_station, d.to_station);
    if (!s.leg) return;
    setTrainUndo(d);
    setD({
      ...d,
      train_number: String(t.number),
      from_station: s.origin,
      to_station: s.destination,
      trip_time: s.leg.depTime || d.trip_time,
    });
  };

  const prepareSend = async () => {
    setShowErrors(true);
    await autosave.flush({ create: true });
    setSendOpen(true);
  };
  const duplicate = () =>
    start(async () => {
      if (!orderId) return;
      await autosave.flush();
      const res = await safeCall(duplicateOrder({ kind: "taxi", id: orderId }));
      if (!res.ok) return void toast.error(res.error);
      toast.success("Copie créée (brouillon daté d'aujourd'hui).");
      router.push(`/commandes/taxi/${res.data.id}`);
    });

  const summary = {
    trajet:
      d.from_station || d.to_station
        ? `${d.trip_day} ${d.trip_time} · ${routeWithVias(d.from_station, d.via_stations, d.to_station)}${d.round_trip ? " · A-R" : ""}`
        : "",
    passager: d.is_pmr
      ? `PMR${client ? ` · ${client.lastName} ${client.firstName}` : ""}`
      : `${d.passengers} ${pl(d.passengers, "passager")}`,
    fournisseur: company?.name ?? d.taxi_email,
  };

  return (
    // v4 lot 4 : rail d'étapes collant (≥ 1280 px) | formulaire en cartes | aperçu en billet (≥ 1024 px).
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,45rem)_minmax(16rem,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[9.5rem_minmax(0,46rem)_minmax(17rem,21rem)] xl:gap-5">
      <OrderSteps steps={steps} className="sticky top-20 hidden xl:flex" />
      <form
        className="flex min-w-0 flex-col gap-3"
        aria-label="Bon de commande taxi"
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
              {number ? `Taxi n° ${number}` : "Nouveau bon taxi"}
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
        {/* Mobile : l'aperçu passe en tête, en version compacte (trajet, prise en charge, PDF). */}
        <OrderTicket
          compact
          className="lg:hidden"
          eyebrow={`Aperçu du bon${number ? ` · taxi n° ${number}` : ""}`}
          route={`${d.from_station || "Départ"} → ${d.to_station || "Arrivée"}`}
          when={taxiWhen(d)}
          pdfHref={orderId ? `/api/commandes/taxi/${orderId}/pdf` : ""}
        />
        {!orderId && props.start && editable ? <StartPanel kind="taxi" {...props.start} /> : null}

        <fieldset disabled={!editable} className="contents">
          <FormSection
            id="bon-trajet"
            index={1}
            title="Trajet"
            summary={summary.trajet}
            state={stepOf("bon-trajet")}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required error={err("trip")}>
                <DateField value={d.trip_day} onValueChange={(v) => set("trip_day", v)} />
              </Field>
              <Field label="Heure de prise en charge" required>
                <TimeField value={d.trip_time} onValueChange={(v) => set("trip_time", v)} pending />
              </Field>
            </div>
            <TrainNumberField
              value={d.train_number}
              onChange={(v) => {
                set("train_number", v);
                setTrainUndo(null);
              }}
              day={d.trip_day}
              disabled={!editable}
              autoApply={!d.to_station.trim()}
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
              <Field label="Départ" required error={err("from_station")}>
                <StationInput
                  value={d.from_station}
                  onChange={(v) => set("from_station", v)}
                  refs={stationRefs}
                />
              </Field>
              <Field label="Arrivée" required error={err("to_station")}>
                <StationInput
                  value={d.to_station}
                  onChange={(v) => set("to_station", v)}
                  refs={stationRefs}
                />
              </Field>
            </div>
            <ViaStationsField
              value={d.via_stations}
              onChange={(v) => set("via_stations", v)}
              refs={stationRefs}
              disabled={!editable}
            />
            <Segmented
              label="Sens"
              value={d.round_trip ? "ar" : "a"}
              onChange={(v) => setRoundTrip(v === "ar")}
              options={[
                { value: "a", label: "Aller" },
                { value: "ar", label: "Aller-retour" },
              ]}
              disabled={!editable}
            />
            {d.round_trip ? (
              <fieldset className="flex flex-col gap-3 border border-border p-3">
                <legend className="label-mono px-1 text-fg-muted">Retour</legend>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date du retour" error={err("return")}>
                    <DateField value={d.return_day} onValueChange={(v) => set("return_day", v)} />
                  </Field>
                  <Field label="Heure du retour">
                    <TimeField
                      value={d.return_time}
                      onValueChange={(v) => set("return_time", v)}
                      pending
                    />
                  </Field>
                  <Field label="Départ du retour">
                    <StationInput
                      value={d.return_from}
                      onChange={(v) => set("return_from", v)}
                      refs={stationRefs}
                    />
                  </Field>
                  <Field label="Arrivée du retour">
                    <StationInput
                      value={d.return_to}
                      onChange={(v) => set("return_to", v)}
                      refs={stationRefs}
                    />
                  </Field>
                </div>
              </fieldset>
            ) : null}
          </FormSection>

          <FormSection
            id="bon-passager"
            index={2}
            title="Passager"
            summary={summary.passager}
            state={stepOf("bon-passager")}
          >
            <Segmented
              label="Type de transport"
              className="sm:w-full"
              value={d.is_pmr ? "pmr" : "standard"}
              onChange={(v) => set("is_pmr", v === "pmr")}
              options={[
                { value: "standard", label: "Standard" },
                { value: "pmr", label: "PMR" },
              ]}
              disabled={!editable}
            />
            {d.is_pmr ? (
              <>
                <PmrClientPicker
                  client={client}
                  canPmr={props.canPmr}
                  error={err("pmr_client")}
                  onChange={(c) => {
                    setClient(c);
                    setD((x) => ({
                      ...x,
                      pmr_client: c?.id ?? "",
                      // Type repris de la fiche seulement s'il est dans la liste (certaines fiches ont un texte libre).
                      pmr_type:
                        PMR_TYPES.find((t) => t.value === c?.type.toUpperCase())?.value ??
                        x.pmr_type,
                    }));
                  }}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Type">
                    <CustomSelect
                      value={d.pmr_type}
                      onValueChange={(v) => set("pmr_type", v)}
                      options={[{ value: "", label: "—" }, ...PMR_TYPES]}
                    />
                  </Field>
                  <Field label="Nombre de PMR" required error={err("pmr_count")}>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={50}
                      value={d.pmr_count}
                      onChange={(e) => set("pmr_count", Number(e.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Véhicules">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={20}
                      value={d.vehicles}
                      onChange={(e) => set("vehicles", Number(e.target.value) || 0)}
                    />
                  </Field>
                </div>
                <Field label="Cause PMR" required error={err("pmr_reason")}>
                  <CustomSelect
                    value={d.pmr_reason}
                    onValueChange={(v) => set("pmr_reason", v)}
                    placeholder="Choisir…"
                    options={PMR_CAUSES.map((c) => ({ value: c, label: c }))}
                  />
                </Field>
                {props.canPmr ? (
                  <DossierField
                    value={d.pmr_file}
                    onChange={(v) => set("pmr_file", v)}
                    editable={editable}
                    query={{
                      day: d.trip_day,
                      from: d.from_station,
                      to: d.to_station,
                      client: d.pmr_client,
                    }}
                  />
                ) : null}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Passagers">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    value={d.passengers}
                    onChange={(e) => set("passengers", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field label="Véhicules">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    value={d.vehicles}
                    onChange={(e) => set("vehicles", Number(e.target.value) || 0)}
                  />
                </Field>
                <Field
                  label="Nom du passager"
                  hint="Facultatif"
                  className="col-span-2 sm:col-span-1"
                >
                  <Input
                    value={d.passenger_name}
                    onChange={(e) => set("passenger_name", e.target.value)}
                    maxLength={200}
                  />
                </Field>
              </div>
            )}
            {/* Taxi PMR : le n° de dossier remplace la référence (14 oct. 2026) ; gardée si un ancien bon en a une. */}
            {!d.is_pmr || d.relation_number ? (
              <Field label="Référence / relation">
                <Input
                  value={d.relation_number}
                  onChange={(e) => set("relation_number", e.target.value)}
                  maxLength={100}
                />
              </Field>
            ) : null}
          </FormSection>

          <FormSection
            id="bon-fournisseur"
            index={3}
            title="Fournisseur"
            summary={summary.fournisseur}
            state={stepOf("bon-fournisseur")}
          >
            <Field
              label="Société de taxi"
              required
              error={err("taxi_company")}
              hint={
                company
                  ? company.emails.join("; ") || "Pas d'adresse : saisis-la ci-dessous."
                  : undefined
              }
            >
              <Combobox
                value={d.taxi_company}
                onValueChange={(v) => set("taxi_company", v)}
                options={companyOptions}
                placeholder="Choisir une société…"
                emptyText="Aucune société de taxi"
                data-testid="taxi-company"
              />
            </Field>
            {company && company.emails.length === 0 ? (
              <Field label="E-mail du taxi" error={err("taxi_email")}>
                <Input
                  type="email"
                  value={d.taxi_email}
                  onChange={(e) => set("taxi_email", e.target.value)}
                  maxLength={500}
                />
              </Field>
            ) : null}
            {company?.phones.length ? (
              <p className="text-small text-fg-muted">
                Tél.{" "}
                {company.phones.map((p, i) => (
                  <a key={p + i} className="mr-3 link" href={`tel:${p.replace(/\s/g, "")}`}>
                    {p}
                  </a>
                ))}
              </p>
            ) : null}
          </FormSection>

          <FormSection
            id="bon-facturation"
            index={4}
            title="Facturation et motif"
            summary={d.billing}
            defaultOpen={!props.orderId}
          >
            <Field label="Facturation">
              <CustomSelect
                value={d.billing}
                onValueChange={(v) => v && set("billing", v)}
                options={BILLING.map((b) => ({ value: b, label: b }))}
              />
            </Field>
            <Field label="Motif / remarques">
              <Textarea
                value={d.reason}
                onChange={(e) => set("reason", e.target.value)}
                maxLength={2000}
              />
            </Field>
            <Field label="Heure confirmée par le taxi" className="max-w-48">
              <TimeField value={d.confirmed_time} onValueChange={(v) => set("confirmed_time", v)} />
            </Field>
          </FormSection>
        </fieldset>

        <OrderActionBar
          kind="taxi"
          orderId={orderId ?? undefined}
          status={props.status}
          statusBeforeCancel={props.statusBeforeCancel}
          coordinator={props.coordinator}
          editable={editable}
          canWrite={canWrite}
          busy={pending}
          flush={autosave.flush}
          onSend={() => void prepareSend()}
          onCreate={() => void autosave.flush({ create: true })}
          onDuplicate={duplicate}
          onTemplate={() => setTplOpen(true)}
          listHref="/commandes/taxi"
          deletion={del.deletion}
          deleteLabel={del.label}
        />
      </form>

      {/* Aperçu en billet (v4 lot 4) : le bon lui-même, itinéraire en pointillés (départ, via, arrivée). */}
      <aside className="hidden lg:sticky lg:top-20 lg:block" aria-label="Aperçu du bon">
        <OrderTicket
          data-testid="order-ticket"
          eyebrow={`Aperçu du bon${number ? ` · taxi n° ${number}` : ""}`}
          route={`${d.from_station || "Départ"} → ${d.to_station || "Arrivée"}`}
          when={taxiWhen(d)}
          rows={[
            ...(d.train_number
              ? [{ label: "Train", value: <TrainChip train={d.train_number} size="sm" /> }]
              : []),
            ...(cleanVias(d.via_stations).length
              ? [
                  {
                    label: "Via",
                    value: cleanVias(d.via_stations).join(" → "),
                    testId: "preview-via",
                  },
                ]
              : []),
            ...(d.is_pmr && d.pmr_file
              ? [
                  {
                    label: "N° de dossier",
                    value: <span className="font-mono tabular">{d.pmr_file}</span>,
                  },
                ]
              : []),
            {
              label: "Retour",
              value: (
                <span className="tabular">
                  {d.round_trip ? `${d.return_day} ${d.return_time}` : "Non"}
                </span>
              ),
            },
            { label: "Passager", value: summary.passager },
            company
              ? { label: "Taxi", value: company.name }
              : { label: "Taxi", value: "à choisir", tone: "danger" as const },
            { label: "Facturation", value: d.billing },
          ]}
          stops={
            d.from_station && d.to_station
              ? [d.from_station, ...cleanVias(d.via_stations), d.to_station]
              : []
          }
          pdfHref={orderId ? `/api/commandes/taxi/${orderId}/pdf` : ""}
        />
      </aside>

      <SendDialog
        kind="taxi"
        id={orderId}
        open={sendOpen}
        onOpenChange={setSendOpen}
        missing={missing}
        to={to}
        cc={props.officeEmail}
        flush={autosave.flush}
      />
      <TemplateDialog open={tplOpen} onOpenChange={setTplOpen} kind="taxi" data={d} />
    </div>
  );
}

/** « jeudi 15 octobre 2026 · prise en charge 16:00 ». */
function taxiWhen(d: TaxiDraft): string {
  return [
    d.trip_day ? formatLongDay(d.trip_day) : "",
    d.trip_time ? `prise en charge ${d.trip_time}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * N° de dossier DICOS d'un taxi PMR (14 oct. 2026) : format AAAA-MM-JJ-NNNN, remis au format à la sortie du champ si
 * c'est sans ambiguïté (`normalizeDossier`), message clair sinon (jamais bloquant) ; dossiers DICOS connus proposés
 * (client lié, ou mission du jour à la gare de départ / d'arrivée).
 */
function DossierField({
  value,
  onChange,
  editable,
  query,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  query: { day: string; from: string; to: string; client: string };
}) {
  const check = normalizeDossier(value);
  const [suggestions, setSuggestions] = useState<DossierSuggestion[]>([]);
  const { day, from, to, client } = query;
  useEffect(() => {
    if (!editable || !day || (!from && !to && !client)) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await safeCall(suggestDossiers({ day, from, to, client }));
      if (!cancelled) setSuggestions(res.ok ? res.data : []);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [editable, day, from, to, client]);
  const others = suggestions.filter((s) => s.ref !== check.value);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Field
        label="Numéro de dossier"
        hint={`${DOSSIER_HINT}, dossier DICOS du voyageur`}
        error={check.ok ? undefined : check.message}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (check.ok && check.value !== value) onChange(check.value);
          }}
          placeholder="2026-10-14-0134"
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
          className="font-mono"
          data-testid="pmr-file"
        />
      </Field>
      {editable && others.length ? (
        <div className="flex flex-col gap-1.5" data-testid="dossier-suggestions">
          <span className="text-small text-fg-muted">Dossiers DICOS proposés</span>
          <ul className="flex flex-col gap-1">
            {others.map((s) => (
              <li key={s.ref}>
                <button
                  type="button"
                  className="flex min-h-11 w-full cursor-pointer items-center rounded-control border border-border px-3 py-1.5 text-left text-small hover:bg-surface-2"
                  onClick={() => onChange(s.ref)}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Recherche liée à la fiche client PMR (pas de copie libre du nom, audit G2). */
export function PmrClientPicker({
  client,
  canPmr,
  error,
  onChange,
  required = true,
}: {
  client: Client | null;
  canPmr: boolean;
  error?: string;
  onChange: (c: Client | null) => void;
  required?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await safeCall(findPmrClients(q));
      if (!cancelled) {
        setResults(res.ok ? res.data : []);
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  if (client) {
    return (
      <div
        className="flex items-start justify-between gap-3 border border-border p-3"
        data-testid="pmr-client"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body font-medium text-fg">
            {client.lastName} {client.firstName}
          </span>
          <span className="text-small text-fg-muted">
            {[PMR_TYPES.find((t) => t.value === client.type)?.label ?? client.type, client.phone]
              .filter(Boolean)
              .join(" · ") || "—"}
          </span>
          <Link
            href={client.id ? `/pmr/clients?id=${client.id}` : "/pmr/clients"}
            className="inline-flex items-center gap-1 text-small link"
          >
            Ouvrir la fiche <ExternalLink aria-hidden className="size-3" />
          </Link>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Changer de client"
          onClick={() => onChange(null)}
        >
          <X />
        </Button>
      </div>
    );
  }
  if (!canPmr)
    return (
      <p className="text-small text-fg-muted">Tu n&apos;as pas accès aux fiches clients PMR.</p>
    );
  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Client PMR"
        required={required}
        error={error}
        hint="Nom, prénom ou téléphone (2 caractères minimum)"
      >
        <span className="relative block">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            autoComplete="off"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="pmr-results"
          />
        </span>
      </Field>
      {q.trim().length >= 2 ? (
        <ul
          id="pmr-results"
          role="listbox"
          aria-label="Clients trouvés"
          className="relative flex max-h-64 flex-col overflow-y-auto border border-border"
        >
          {loading ? <li className="px-3 py-2 text-small text-fg-muted">Recherche…</li> : null}
          {!loading && results.length === 0 ? (
            <li className="px-3 py-2 text-small text-fg-muted">Aucun client trouvé.</li>
          ) : null}
          {results.map((c) => (
            <li key={c.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex min-h-11 w-full cursor-pointer flex-col items-start px-3 py-1.5 text-left hover:bg-surface-2"
                onClick={() => onChange(c)}
              >
                <span className="text-body text-fg">
                  {c.lastName} {c.firstName}
                </span>
                <span className="text-small text-fg-muted">
                  {[c.type, c.phone].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => setCreateOpen(true)}
      >
        <UserPlus aria-hidden /> Nouveau client
      </Button>
      <NewClientDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onChange} />
    </div>
  );
}

function NewClientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: Client) => void;
}) {
  const [f, setF] = useState({ last_name: "", first_name: "", phone: "", type: "" });
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Nouveau client PMR"
        description="Fiche minimale, à compléter ensuite dans le module PMR."
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await safeCall(createPmrClient(f));
              if (!res.ok) return void toast.error(res.error);
              onCreated(res.data);
              onOpenChange(false);
              setF({ last_name: "", first_name: "", phone: "", type: "" });
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom" required>
              <Input
                value={f.last_name}
                onChange={(e) => setF({ ...f, last_name: e.target.value })}
                required
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field label="Prénom">
              <Input
                value={f.first_name}
                onChange={(e) => setF({ ...f, first_name: e.target.value })}
                maxLength={200}
              />
            </Field>
            <Field label="Téléphone">
              <Input
                type="tel"
                inputMode="tel"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
                maxLength={100}
              />
            </Field>
            <Field label="Type">
              <CustomSelect
                value={f.type}
                onValueChange={(v) => setF({ ...f, type: v })}
                options={[{ value: "", label: "—" }, ...PMR_TYPES]}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="submit" variant="primary" loading={pending}>
              Créer et lier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
