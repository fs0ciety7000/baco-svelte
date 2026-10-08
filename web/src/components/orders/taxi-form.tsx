"use client";

import {
  Copy,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Save,
  Search,
  Send,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import {
  createPmrClient,
  duplicateOrder,
  findPmrClients,
  saveTaxiOrder,
} from "@/app/(app)/commandes/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ActionBar, AutosaveIndicator, FormSection, Segmented } from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import {
  BILLING,
  checkTaxiForSend,
  parseEmails,
  PMR_CAUSES,
  PMR_TYPES,
  type TaxiDraft,
} from "@/lib/orders/schemas";
import { isEditable, type Status } from "@/lib/orders/status";
import { useAutosave } from "@/lib/orders/use-autosave";

import { TemplateDialog } from "./bus-form";
import { SendDialog } from "./send-dialog";
import { StartPanel, type StartPanelProps } from "./start-panel";
import { TransitionButtons } from "./transitions";

type Client = { id: string; lastName: string; firstName: string; phone: string; type: string };

export type TaxiFormProps = {
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
    stations: string[];
  };
  officeEmail: string;
  start?: Omit<StartPanelProps, "kind">;
};

const STATION_LIST = "gares-taxi";

export function TaxiForm(props: TaxiFormProps) {
  const { reference, canWrite } = props;
  const router = useRouter();
  const [d, setD] = useState<TaxiDraft>(props.initial);
  const [client, setClient] = useState<Client | null>(props.client);
  const [sendOpen, setSendOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, start] = useTransition();
  const editable = canWrite && isEditable(props.status);
  const set = useCallback(
    <K extends keyof TaxiDraft>(k: K, v: TaxiDraft[K]) => setD((x) => ({ ...x, [k]: v })),
    [],
  );

  const onCreated = useCallback((id: string) => {
    window.history.replaceState(null, "", `/commandes/taxi/nouveau?id=${id}`);
  }, []);
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

  const company = reference.companies.find((c) => c.id === d.taxi_company);
  const to = parseEmails([...(company?.emails ?? []), d.taxi_email]).join("; ");
  const missing = useMemo(() => checkTaxiForSend(d, { companyEmail: to }), [d, to]);
  const err = (f: string) => (showErrors ? missing.find((m) => m.field === f)?.message : undefined);

  // Aller-retour : le retour est pré-rempli à l'inverse de l'aller.
  const setRoundTrip = (on: boolean) =>
    setD((x) => ({
      ...x,
      round_trip: on,
      return_day: on ? x.return_day || x.trip_day : "",
      return_from: on ? x.return_from || x.to_station : "",
      return_to: on ? x.return_to || x.from_station : "",
    }));

  const prepareSend = async () => {
    setShowErrors(true);
    await autosave.flush();
    setSendOpen(true);
  };
  const duplicate = () =>
    start(async () => {
      if (!orderId) return;
      await autosave.flush();
      const res = await duplicateOrder({ kind: "taxi", id: orderId });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Copie créée (brouillon daté d'aujourd'hui).");
      router.push(`/commandes/taxi/${res.data.id}`);
    });

  const summary = {
    trajet:
      d.from_station || d.to_station
        ? `${d.trip_day} ${d.trip_time} · ${d.from_station || "?"} → ${d.to_station || "?"}${d.round_trip ? " · A-R" : ""}`
        : "",
    passager: d.is_pmr
      ? `PMR${client ? ` · ${client.lastName} ${client.firstName}` : ""}`
      : `${d.passengers} passager(s)`,
    fournisseur: company?.name ?? d.taxi_email,
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
            <span className="label-mono text-fg-muted" data-testid="order-number">
              {number ? `Taxi n° ${number}` : "Nouveau bon taxi"}
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
        {!orderId && props.start && editable ? <StartPanel kind="taxi" {...props.start} /> : null}

        <fieldset disabled={!editable} className="contents">
          <FormSection
            index={1}
            title="Trajet"
            summary={summary.trajet}
            state={
              err("trip") || err("from_station") || err("to_station") || err("return")
                ? "error"
                : undefined
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" required error={err("trip")}>
                <Input
                  type="date"
                  value={d.trip_day}
                  onChange={(e) => set("trip_day", e.target.value)}
                />
              </Field>
              <Field label="Heure de prise en charge" required>
                <Input
                  type="time"
                  value={d.trip_time}
                  onChange={(e) => set("trip_time", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Départ" required error={err("from_station")}>
                <Input
                  list={STATION_LIST}
                  value={d.from_station}
                  onChange={(e) => set("from_station", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Via">
                <Input
                  list={STATION_LIST}
                  value={d.via_station}
                  onChange={(e) => set("via_station", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Arrivée" required error={err("to_station")}>
                <Input
                  list={STATION_LIST}
                  value={d.to_station}
                  onChange={(e) => set("to_station", e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
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
                    <Input
                      type="date"
                      value={d.return_day}
                      onChange={(e) => set("return_day", e.target.value)}
                    />
                  </Field>
                  <Field label="Heure du retour">
                    <Input
                      type="time"
                      value={d.return_time}
                      onChange={(e) => set("return_time", e.target.value)}
                    />
                  </Field>
                  <Field label="Départ du retour">
                    <Input
                      list={STATION_LIST}
                      value={d.return_from}
                      onChange={(e) => set("return_from", e.target.value)}
                    />
                  </Field>
                  <Field label="Arrivée du retour">
                    <Input
                      list={STATION_LIST}
                      value={d.return_to}
                      onChange={(e) => set("return_to", e.target.value)}
                    />
                  </Field>
                </div>
              </fieldset>
            ) : null}
          </FormSection>

          <FormSection
            index={2}
            title="Passager"
            summary={summary.passager}
            state={err("pmr_client") || err("pmr_count") || err("pmr_reason") ? "error" : undefined}
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
                      pmr_type: c?.type || x.pmr_type,
                    }));
                  }}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Type">
                    <Select value={d.pmr_type} onChange={(e) => set("pmr_type", e.target.value)}>
                      <option value="">—</option>
                      {PMR_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
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
                  <Select value={d.pmr_reason} onChange={(e) => set("pmr_reason", e.target.value)}>
                    <option value="">Choisir…</option>
                    {PMR_CAUSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
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
            <Field label="Référence / relation">
              <Input
                value={d.relation_number}
                onChange={(e) => set("relation_number", e.target.value)}
                maxLength={100}
              />
            </Field>
          </FormSection>

          <FormSection
            index={3}
            title="Fournisseur"
            summary={summary.fournisseur}
            state={err("taxi_company") || err("taxi_email") ? "error" : undefined}
          >
            <Field
              label="Société de taxi"
              required
              error={err("taxi_company")}
              hint={
                company
                  ? company.emails.join("; ") || "Pas d'adresse : saisissez-la ci-dessous."
                  : undefined
              }
            >
              <Select value={d.taxi_company} onChange={(e) => set("taxi_company", e.target.value)}>
                <option value="">Choisir une société…</option>
                {reference.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.places.length ? ` — ${c.places.slice(0, 2).join(", ")}` : ""}
                  </option>
                ))}
              </Select>
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
                  <a
                    key={p + i}
                    className="mr-3 text-accent underline-offset-2 hover:underline"
                    href={`tel:${p.replace(/\s/g, "")}`}
                  >
                    {p}
                  </a>
                ))}
              </p>
            ) : null}
          </FormSection>

          <FormSection
            index={4}
            title="Facturation et motif"
            summary={d.billing}
            defaultOpen={!props.orderId}
          >
            <Field label="Facturation">
              <Select value={d.billing} onChange={(e) => set("billing", e.target.value)}>
                {BILLING.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Motif / remarques">
              <Textarea
                value={d.reason}
                onChange={(e) => set("reason", e.target.value)}
                maxLength={2000}
              />
            </Field>
            {props.status !== "brouillon" ? (
              <Field label="Heure confirmée par le taxi" className="max-w-48">
                <Input
                  type="time"
                  value={d.confirmed_time}
                  onChange={(e) => set("confirmed_time", e.target.value)}
                />
              </Field>
            ) : null}
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
              kind="taxi"
              id={orderId}
              status={props.status}
              statusBeforeCancel={props.statusBeforeCancel}
              coordinator={props.coordinator}
              before={autosave.flush}
              exclude={["envoye"]}
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
                    href={`/api/commandes/taxi/${orderId}/pdf`}
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
                  href="/commandes/taxi"
                >
                  Retour à la liste
                </Link>
              </div>
            ) : null}
          </div>
        </ActionBar>
      </form>

      <aside
        className="hidden flex-col gap-3 border border-border bg-surface p-4 lg:sticky lg:top-20 lg:flex"
        aria-label="Aperçu du bon"
      >
        <p className="label-mono text-fg-muted">Aperçu du bon {number ? `n° ${number}` : ""}</p>
        <p className="display text-h3 text-fg">
          {d.from_station || "Départ"} → {d.to_station || "Arrivée"}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-small">
          <dt className="text-fg-muted">Prise en charge</dt>
          <dd className="tabular">{d.trip_day ? `${d.trip_day} ${d.trip_time}` : "—"}</dd>
          {d.via_station ? (
            <>
              <dt className="text-fg-muted">Via</dt>
              <dd>{d.via_station}</dd>
            </>
          ) : null}
          <dt className="text-fg-muted">Retour</dt>
          <dd className="tabular">{d.round_trip ? `${d.return_day} ${d.return_time}` : "Non"}</dd>
          <dt className="text-fg-muted">Passager</dt>
          <dd>{summary.passager}</dd>
          <dt className="text-fg-muted">Taxi</dt>
          <dd>{company?.name ?? "—"}</dd>
          <dt className="text-fg-muted">Facturation</dt>
          <dd>{d.billing}</dd>
        </dl>
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

/** Recherche liée à la fiche client PMR (pas de copie libre du nom, audit G2). */
function PmrClientPicker({
  client,
  canPmr,
  error,
  onChange,
}: {
  client: Client | null;
  canPmr: boolean;
  error?: string;
  onChange: (c: Client | null) => void;
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
      const res = await findPmrClients(q);
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
            href="/pmr/clients"
            className="inline-flex items-center gap-1 text-small text-accent underline-offset-2 hover:underline"
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
      <p className="text-small text-fg-muted">Vous n&apos;avez pas accès aux fiches clients PMR.</p>
    );
  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Client PMR"
        required
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
          className="flex max-h-64 flex-col overflow-y-auto border border-border"
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
              const res = await createPmrClient(f);
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
              <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                <option value="">—</option>
                {PMR_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
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
