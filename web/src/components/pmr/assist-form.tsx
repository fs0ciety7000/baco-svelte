"use client";

import { ClipboardPaste, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { createAssists, updateAssist } from "@/app/(app)/pmr/actions";
import { PmrClientPicker, type Client } from "@/components/orders/taxi-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ActionBar, FormSection, Segmented } from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { periodOf, PERIODS } from "@/lib/orders/time";
import { parseDicos } from "@/lib/pmr/dicos";
import { PMR_TYPE_CODES, PMR_TYPE_LABEL, type AssistInput } from "@/lib/pmr/model";

type Zone = { id: string; code: string; label: string; stations: string[] };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();

/**
 * Création (une ou plusieurs prestations, « Coller depuis DICOS ») ou modification d'une prestation PMR.
 * Le texte collé n'est jamais enregistré : seuls les champs reconnus le sont (aucun nom en texte libre).
 */
export function AssistForm({
  mode,
  assistId,
  initial,
  initialClient,
  zones,
  canPmr,
  defaultDay,
}: {
  mode: "create" | "edit";
  assistId?: string;
  initial: AssistInput[];
  initialClient: Client | null;
  zones: Zone[];
  canPmr: boolean;
  defaultDay: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AssistInput[]>(initial);
  const [client, setClient] = useState<Client | null>(initialClient);
  const [paste, setPaste] = useState("");
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const blank = (): AssistInput => ({
    day: rows[0]?.day ?? defaultDay,
    time: "",
    direction: "",
    train: "",
    station: rows[0]?.station ?? "",
    zone: rows[0]?.zone ?? "",
    dicos_ref: rows[0]?.dicos_ref ?? "",
    pax: rows[0]?.pax ?? 1,
    pmr_type: rows[0]?.pmr_type ?? "",
    client: "",
    note: "",
  });

  const zoneOf = (station: string) =>
    zones.find((z) => z.stations.some((s) => norm(s) === norm(station)))?.id ?? "";
  const set = (i: number, patch: Partial<AssistInput>) =>
    setRows((r) =>
      r.map((x, j) => {
        if (j !== i) return x;
        const next = { ...x, ...patch };
        // Gare changée : zone déduite du référentiel, vide si la gare n'y figure pas (jamais l'ancienne zone).
        if (patch.station !== undefined && patch.zone === undefined)
          next.zone = zoneOf(patch.station);
        return next;
      }),
    );

  const analysed = useMemo(() => (paste.trim() ? parseDicos(paste) : null), [paste]);
  const applyPaste = () => {
    if (!analysed) return;
    const base = rows[0] ?? blank();
    const segs = analysed.segments.length
      ? analysed.segments
      : [{ direction: "" as const, train: "", time: "" }];
    setRows(
      segs.map((s) => ({
        ...base,
        time: s.time,
        direction: s.direction,
        train: s.train,
        dicos_ref: analysed.ref || base.dicos_ref,
        pax: analysed.pax,
        pmr_type: (PMR_TYPE_CODES as readonly string[]).includes(analysed.type)
          ? (analysed.type as AssistInput["pmr_type"])
          : base.pmr_type,
      })),
    );
    setPaste("");
    toast.success(
      `${segs.length} prestation(s) préparée(s) depuis DICOS. Vérifiez la gare ; le texte collé n'est pas conservé.`,
    );
  };

  const save = (another: boolean) => {
    // « Et une autre » et Ctrl+Entrée passent aussi par les contrôles du formulaire (gare obligatoire…).
    if (formRef.current && !formRef.current.reportValidity()) return;
    start(async () => {
      const items = rows.map((r) => ({ ...r, client: client?.id ?? "" }));
      const res = await safeCall(
        mode === "edit" && assistId ? updateAssist(assistId, items[0]) : createAssists(items),
      );
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        mode === "edit"
          ? "Prestation enregistrée."
          : `${items.length} prestation(s) enregistrée(s).`,
      );
      if (another) {
        // Autre voyageur : on ne garde que la date (pas la réf. DICOS, le type ni le nombre du précédent).
        setRows([{ ...blank(), station: "", zone: "", dicos_ref: "", pax: 1, pmr_type: "" }]);
        setClient(null);
        router.refresh();
      } else router.push(`/pmr?du=${items[0]?.day ?? defaultDay}`);
    });
  };

  return (
    <form
      ref={formRef}
      className="flex max-w-[45rem] flex-col gap-3"
      aria-label={mode === "edit" ? "Modifier la prestation" : "Nouvelle prestation PMR"}
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && mode === "create") {
          e.preventDefault();
          save(true);
        }
      }}
    >
      {mode === "create" ? (
        <FormSection index={1} title="Coller depuis DICOS" summary="Facultatif">
          <Field
            label="Ligne DICOS"
            hint="Ex. fictif : 1234-56-78-9012 1 CRF OUT E2134 à 16h42 — un aller-retour donne deux prestations. Les noms ne sont pas repris."
          >
            <Textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              className="min-h-20"
              data-testid="dicos-paste"
            />
          </Field>
          {analysed ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-small text-fg-muted" data-testid="dicos-preview">
                Reconnu : {analysed.ref || "réf. ?"} · {analysed.pax} × {analysed.type || "type ?"}{" "}
                ·{" "}
                {analysed.segments.length
                  ? analysed.segments
                      .map(
                        (s) =>
                          `${s.direction === "arrivee" ? "IN" : s.direction === "depart" ? "OUT" : "?"} ${s.train} ${s.time}`,
                      )
                      .join(" / ")
                  : "aucun horaire"}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={applyPaste}
                data-testid="dicos-apply"
              >
                <ClipboardPaste aria-hidden /> Remplir
              </Button>
            </div>
          ) : null}
        </FormSection>
      ) : null}

      {rows.map((r, i) => (
        <FormSection
          key={i}
          index={mode === "create" ? i + 2 : 1}
          title={rows.length > 1 ? `Assistance ${i + 1}` : "Assistance"}
          summary={`${r.day} ${r.time} · ${r.station || "gare ?"}`}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Date" required>
              <Input
                type="date"
                value={r.day}
                onChange={(e) => set(i, { day: e.target.value })}
                required
              />
            </Field>
            <Field
              label="Heure"
              hint={r.time ? PERIODS.find((p) => p.id === periodOf(r.time))?.label : undefined}
            >
              <Input
                type="time"
                value={r.time}
                onChange={(e) => set(i, { time: e.target.value })}
              />
            </Field>
            <Field label="Train" className="col-span-2 sm:col-span-1">
              <Input
                value={r.train}
                onChange={(e) => set(i, { train: e.target.value.toUpperCase() })}
                maxLength={20}
                inputMode="text"
              />
            </Field>
          </div>
          <Segmented
            label="Sens"
            value={r.direction || "aucun"}
            onChange={(v) => set(i, { direction: v === "aucun" ? "" : v })}
            options={[
              { value: "arrivee", label: "Arrivée (IN)" },
              { value: "depart", label: "Départ (OUT)" },
              { value: "aucun", label: "—" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gare" required hint="Code PtCar (ex. FMS) ou nom">
              <Input
                value={r.station}
                onChange={(e) => set(i, { station: e.target.value.toUpperCase() })}
                maxLength={100}
                required
              />
            </Field>
            <Field label="Zone">
              <Select value={r.zone} onChange={(e) => set(i, { zone: e.target.value })}>
                <option value="">—</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code}
                    {z.label ? ` · ${z.label}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Réf. DICOS" className="col-span-2 sm:col-span-1">
              <Input
                value={r.dicos_ref}
                onChange={(e) => set(i, { dicos_ref: e.target.value })}
                placeholder="1234-56-78-9012"
                inputMode="numeric"
                maxLength={20}
              />
            </Field>
            <Field label="Nombre">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={r.pax}
                onChange={(e) => set(i, { pax: Number(e.target.value) || 1 })}
              />
            </Field>
            <Field label="Type">
              <Select
                value={r.pmr_type}
                onChange={(e) => set(i, { pmr_type: e.target.value as AssistInput["pmr_type"] })}
              >
                <option value="">—</option>
                {PMR_TYPE_CODES.map((t) => (
                  <option key={t} value={t}>
                    {t} · {PMR_TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Remarque" hint="Sans nom ni donnée de santé : le client se lie ci-dessous.">
            <Input
              value={r.note}
              onChange={(e) => set(i, { note: e.target.value })}
              maxLength={1000}
            />
          </Field>
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
            >
              <Trash2 aria-hidden /> Retirer cette assistance
            </Button>
          ) : null}
        </FormSection>
      ))}

      {mode === "create" ? (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => setRows((r) => [...r, blank()])}
          disabled={rows.length >= 20}
        >
          <Plus aria-hidden /> Ajouter une assistance (même voyageur)
        </Button>
      ) : null}

      <FormSection
        index={mode === "create" ? rows.length + 2 : 2}
        title="Client (facultatif)"
        summary={client ? `${client.lastName} ${client.firstName}` : "Aucun"}
      >
        <PmrClientPicker client={client} canPmr={canPmr} onChange={setClient} required={false} />
      </FormSection>

      <ActionBar>
        <Button type="submit" variant="primary" loading={pending} data-testid="assist-save">
          <Save aria-hidden /> Enregistrer
        </Button>
        {mode === "create" ? (
          <Button type="button" variant="secondary" onClick={() => save(true)} disabled={pending}>
            <span className="hidden sm:inline">Enregistrer et en ajouter une autre</span>
            <span className="sm:hidden">Et une autre</span>
          </Button>
        ) : null}
        <Button type="button" variant="ghost" className="ml-auto" onClick={() => router.back()}>
          Annuler
        </Button>
      </ActionBar>
    </form>
  );
}
