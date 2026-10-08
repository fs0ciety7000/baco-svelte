"use client";

import { Copy, FileText, MoreHorizontal, Plus, Save, Send, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";

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
import {
  ActionBar,
  AutosaveIndicator,
  FormSection,
  Segmented,
  ToggleChip,
} from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import {
  C3_TYPES,
  checkBusForSend,
  emptyBus,
  type BusDraft,
  type BusLine,
} from "@/lib/orders/schemas";
import { safeCall } from "@/lib/orders/safe-call";
import { isEditable, type Status } from "@/lib/orders/status";
import { stopsBetween, suggestLines, type LineInfo } from "@/lib/orders/stops";
import { useAutosave } from "@/lib/orders/use-autosave";

import { SendDialog } from "./send-dialog";
import { StartPanel, type StartPanelProps } from "./start-panel";
import { TransitionButtons } from "./transitions";

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
    stations: string[];
    companyLines: { company: string; line: string }[];
  };
  officeEmail: string;
  start?: Omit<StartPanelProps, "kind">;
};

const STATION_LIST = "gares-bus";

export function BusForm(props: BusFormProps) {
  const { reference, canWrite } = props;
  const router = useRouter();
  const [d, setD] = useState<BusDraft>(props.initial);
  const [sendOpen, setSendOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const company = reference.companies.find((c) => c.id === d.company);
  const missing = useMemo(
    () => checkBusForSend(d, { companyEmail: company?.email ?? "" }),
    [d, company?.email],
  );
  const err = (field: string) =>
    showErrors ? missing.find((m) => m.field === field)?.message : undefined;

  // Lignes : celles de la société d'abord, puis celles qui desservent O et D.
  const suggested = useMemo(
    () => suggestLines(reference.lines, d.origin, d.destination),
    [reference.lines, d.origin, d.destination],
  );
  const lineChoices = useMemo(() => {
    const own = reference.companyLines.filter((l) => l.company === d.company).map((l) => l.line);
    return [...new Set([...d.lines, ...suggested, ...own])].slice(0, 24);
  }, [reference.companyLines, d.company, d.lines, suggested]);
  const autoStops = useMemo(
    () => stopsBetween(reference.lines, d.lines, d.origin, d.destination),
    [reference.lines, d.lines, d.origin, d.destination],
  );

  // Origine / destination : lignes déduites des deux gares (pré-cochées si aucune ligne choisie), arrêts recalculés.
  const setPlace = (field: "origin" | "destination", value: string) =>
    setD((x) => {
      const next = { ...x, [field]: value };
      const both = reference.lines.filter(
        (l) => stopsBetween([l], [l.line], next.origin, next.destination).length > 0,
      );
      const lines = x.lines.length ? x.lines : both.map((l) => l.line);
      return {
        ...next,
        lines,
        stops: stopsBetween(reference.lines, lines, next.origin, next.destination),
      };
    });

  const toggleLine = (line: string, on: boolean) => {
    const lines = on ? [...d.lines, line] : d.lines.filter((l) => l !== line);
    const stops = stopsBetween(reference.lines, lines, d.origin, d.destination);
    setD((x) => ({ ...x, lines, stops }));
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
  const sentOrLater = props.status !== "brouillon";

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
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,45rem)_minmax(16rem,1fr)] lg:items-start lg:gap-6">
      <datalist id={STATION_LIST}>
        {reference.stations.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

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
            <span className="label-mono text-fg-muted" data-testid="order-number">
              {number ? `C3 n° ${number}` : "Nouveau bon"}
            </span>
            <StatusBadge status={props.status} />
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

        {!orderId && props.start && editable ? <StartPanel kind="bus" {...props.start} /> : null}

        <fieldset disabled={!editable} className="contents">
          <FormSection
            index={1}
            title="Incident"
            summary={summary.incident}
            state={err("reason") || err("order_date") ? "error" : undefined}
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
                <Input
                  type="date"
                  value={d.order_date}
                  onChange={(e) => set("order_date", e.target.value)}
                />
              </Field>
              <Field label="Heure d'appel">
                <Input
                  type="time"
                  value={d.call_time}
                  onChange={(e) => set("call_time", e.target.value)}
                />
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
            index={2}
            title="Trajet"
            summary={summary.trajet}
            state={err("origin") || err("destination") ? "error" : undefined}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Origine" required error={err("origin")}>
                <Input
                  list={STATION_LIST}
                  value={d.origin}
                  onChange={(e) => setPlace("origin", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Destination" required error={err("destination")}>
                <Input
                  list={STATION_LIST}
                  value={d.destination}
                  onChange={(e) => setPlace("destination", e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-3">
              <Segmented
                label="Desserte"
                value={d.direct ? "direct" : "omnibus"}
                onChange={(v) => set("direct", v === "direct")}
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
                      pressed={d.lines.includes(l)}
                      onPressedChange={(on) => toggleLine(l, on)}
                      disabled={!editable}
                    >
                      L.{l}
                    </ToggleChip>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-small text-fg-muted">
                Saisissez l&apos;origine et la destination pour proposer les lignes.
              </p>
            )}
            {!d.direct ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-small font-medium text-fg">Arrêts intermédiaires</span>
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
                ) : autoStops.length ? (
                  <div className="flex flex-wrap gap-2">
                    {autoStops.map((s) => (
                      <ToggleChip
                        key={s}
                        pressed={d.stops.includes(s)}
                        disabled={!editable}
                        onPressedChange={(on) =>
                          set(
                            "stops",
                            on
                              ? autoStops.filter((x) => x === s || d.stops.includes(x))
                              : d.stops.filter((x) => x !== s),
                          )
                        }
                      >
                        {s}
                      </ToggleChip>
                    ))}
                  </div>
                ) : (
                  <p className="text-small text-fg-muted">
                    Aucun arrêt trouvé : choisissez une ligne qui dessert les deux gares, ou passez
                    en saisie libre.
                  </p>
                )}
              </div>
            ) : null}
          </FormSection>

          <FormSection
            index={3}
            title="Fournisseur"
            summary={summary.fournisseur}
            state={err("company") ? "error" : undefined}
          >
            <Field
              label="Société"
              required
              error={err("company")}
              hint={
                company
                  ? company.email || "Pas d'adresse e-mail : à compléter dans les référentiels."
                  : undefined
              }
            >
              <Select value={d.company} onChange={(e) => set("company", e.target.value)}>
                <option value="">Choisir une société…</option>
                {reference.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? "" : " (sans e-mail)"}
                  </option>
                ))}
              </Select>
            </Field>
            {company?.phone ? (
              <p className="text-small text-fg-muted">
                Tél.{" "}
                <a
                  className="text-accent underline-offset-2 hover:underline"
                  href={`tel:${company.phone.replace(/\s/g, "")}`}
                >
                  {company.phone}
                </a>
              </p>
            ) : null}
          </FormSection>

          <FormSection
            index={4}
            title="Bus"
            summary={summary.bus}
            state={err("buses") ? "error" : undefined}
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
                      <Input
                        type="time"
                        value={b.planned}
                        onChange={(e) => setBus(i, { planned: e.target.value })}
                      />
                    </Field>
                    {sentOrLater ? (
                      <>
                        <Field label="Heure confirmée">
                          <Input
                            type="time"
                            value={b.confirmed}
                            onChange={(e) => setBus(i, { confirmed: e.target.value })}
                          />
                        </Field>
                        <Field label="Démobilisation">
                          <Input
                            type="time"
                            value={b.demob}
                            onChange={(e) => setBus(i, { demob: e.target.value })}
                          />
                        </Field>
                        <Field label="Plaque">
                          <Input
                            value={b.plate}
                            onChange={(e) => setBus(i, { plate: e.target.value.toUpperCase() })}
                            maxLength={40}
                          />
                        </Field>
                        <Field label="Chauffeur" className="sm:col-span-2">
                          <Select
                            value={b.driver}
                            onChange={(e) => setBus(i, { driver: e.target.value })}
                          >
                            <option value="">—</option>
                            {drivers.map((dr) => (
                              <option key={dr.id} value={dr.id}>
                                {dr.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2">
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
                      <Checkbox
                        checked={b.specific_route}
                        onCheckedChange={(v) => setBus(i, { specific_route: v === true })}
                      />
                      Trajet spécifique
                    </label>
                    {sentOrLater ? (
                      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
                        <Checkbox
                          checked={b.cancelled}
                          onCheckedChange={(v) => setBus(i, { cancelled: v === true })}
                        />
                        Bus annulé
                      </label>
                    ) : null}
                  </div>
                  {b.specific_route ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Origine de ce bus">
                        <Input
                          list={STATION_LIST}
                          value={b.origin}
                          onChange={(e) => setBus(i, { origin: e.target.value })}
                        />
                      </Field>
                      <Field label="Destination de ce bus">
                        <Input
                          list={STATION_LIST}
                          value={b.destination}
                          onChange={(e) => setBus(i, { destination: e.target.value })}
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
              {sentOrLater && d.company ? (
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

        <ActionBar>
          {editable && props.status === "brouillon" ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => void prepareSend()}
              data-testid="prepare-send"
            >
              <Send aria-hidden /> Préparer l&apos;envoi
            </Button>
          ) : null}
          {orderId ? (
            <TransitionButtons
              kind="bus"
              id={orderId}
              status={props.status}
              statusBeforeCancel={props.statusBeforeCancel}
              coordinator={props.coordinator}
              buses={d.buses}
              drivers={reference.drivers}
              companyId={d.company}
              before={autosave.flush}
              hideSend
            />
          ) : null}
          <div className="relative ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Plus d'actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal />
            </Button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 bottom-full z-30 mb-2 flex w-60 flex-col border border-border-strong bg-surface py-1 shadow-lg"
                onClick={() => setMenuOpen(false)}
              >
                {orderId ? (
                  <a
                    role="menuitem"
                    className="flex min-h-11 items-center gap-2 px-3 text-body hover:bg-surface-2"
                    href={`/api/commandes/bus/${orderId}/pdf`}
                    target="_blank"
                    rel="noopener"
                  >
                    <FileText aria-hidden className="size-4" /> Aperçu PDF
                  </a>
                ) : null}
                {orderId && canWrite ? (
                  <button
                    role="menuitem"
                    type="button"
                    className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-left text-body hover:bg-surface-2"
                    onClick={duplicate}
                    disabled={pending}
                  >
                    <Copy aria-hidden className="size-4" /> Dupliquer (aujourd&apos;hui)
                  </button>
                ) : null}
                {canWrite ? (
                  <button
                    role="menuitem"
                    type="button"
                    className="flex min-h-11 cursor-pointer items-center gap-2 px-3 text-left text-body hover:bg-surface-2"
                    onClick={() => setTplOpen(true)}
                  >
                    <Save aria-hidden className="size-4" /> Enregistrer comme modèle
                  </button>
                ) : null}
                <Link
                  role="menuitem"
                  className="flex min-h-11 items-center gap-2 px-3 text-body hover:bg-surface-2"
                  href="/commandes"
                >
                  Retour à la liste
                </Link>
              </div>
            ) : null}
          </div>
        </ActionBar>
      </form>

      <aside
        className="hidden flex-col gap-3 lg:sticky lg:top-20 lg:flex"
        aria-label="Aperçu du bon"
      >
        <BusPreview draft={d} companyName={company?.name ?? ""} number={number} />
      </aside>

      <SendDialog
        kind="bus"
        id={orderId}
        open={sendOpen}
        onOpenChange={setSendOpen}
        missing={missing}
        to={company?.email ?? ""}
        cc={props.officeEmail}
        flush={autosave.flush}
      />
      <TemplateDialog open={tplOpen} onOpenChange={setTplOpen} kind="bus" data={d} />
    </div>
  );
}

function BusPreview({
  draft: d,
  companyName,
  number,
}: {
  draft: BusDraft;
  companyName: string;
  number: number | null;
}) {
  const active = d.buses.filter((b) => !b.cancelled);
  const stops = d.direct
    ? []
    : d.stops_mode === "manuel"
      ? d.stops_manual.split("\n").filter(Boolean)
      : d.stops;
  return (
    <div className="flex flex-col gap-3 border border-border bg-surface p-4">
      <p className="label-mono text-fg-muted">Aperçu du bon {number ? `n° ${number}` : ""}</p>
      <p className="display text-h3 text-fg">
        {d.origin || "Origine"} → {d.destination || "Destination"}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-small">
        <dt className="text-fg-muted">Type</dt>
        <dd>{C3_TYPES.find((t) => t.value === d.c3_type)?.label}</dd>
        <dt className="text-fg-muted">Date</dt>
        <dd className="tabular">{d.order_date || "—"}</dd>
        <dt className="text-fg-muted">Desserte</dt>
        <dd>
          {d.direct ? "Direct" : `Omnibus${stops.length ? ` · ${stops.length} arrêt(s)` : ""}`}
          {d.round_trip ? " · A-R" : ""}
        </dd>
        <dt className="text-fg-muted">Société</dt>
        <dd>{companyName || "—"}</dd>
        <dt className="text-fg-muted">Bus</dt>
        <dd className="tabular">
          {active.length} × {d.bus_capacity} places
          {active[0]?.planned ? ` · ${active.map((b) => b.planned || "—").join(", ")}` : ""}
        </dd>
      </dl>
      {stops.length ? (
        <p className="text-small text-fg-muted">Arrêts : {stops.join(" · ")}</p>
      ) : null}
      <p className="text-hint text-fg-muted">
        Raccourci : <kbd className="font-mono">Ctrl</kbd> + <kbd className="font-mono">Entrée</kbd>{" "}
        pour préparer l&apos;envoi.
      </p>
    </div>
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
