"use client";

import { MapPinned, Pencil, Plus, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import {
  loadEquipmentEvents,
  saveEquipment,
  saveZone,
  setEquipmentState,
} from "@/app/(app)/pmr/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Segmented, Timeline } from "@/components/ui/form-kit";
import { Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/status-badge";
import { ListCard, Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { safeCall } from "@/lib/orders/safe-call";
import { formatShortDay, pbDate } from "@/lib/orders/time";
import {
  ASSISTANCE_LABEL,
  EQUIPMENT_STATE,
  EQUIPMENT_STATES,
  expiry,
  type EquipmentInput,
  type EquipmentState,
} from "@/lib/pmr/model";
import type { Equipment, PmrEvent, Zone } from "@/server/data/pmr";

const toneVar = { ok: "var(--ok)", danger: "var(--danger)", warn: "var(--warn)" };
const at = new Intl.DateTimeFormat("fr-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function StateBadge({ state }: { state: EquipmentState }) {
  return <Badge tone={EQUIPMENT_STATE[state].tone}>{EQUIPMENT_STATE[state].label}</Badge>;
}

function ExpiryBadge({ validUntil, today }: { validUntil: string; today: string }) {
  const e = expiry(validUntil, today);
  if (e === "unknown") return <span className="text-fg-muted">—</span>;
  return (
    <Badge tone={e === "expired" ? "danger" : e === "soon" ? "warn" : "neutral"}>
      {e === "expired" ? "Dépassée" : e === "soon" ? "Bientôt" : "Valide"} ·{" "}
      {formatShortDay(validUntil).slice(3)}
    </Badge>
  );
}

const toInput = (e?: Equipment | null): EquipmentInput => ({
  station: e?.station ?? "",
  platform: e?.platform ?? "",
  zone: e?.zone ?? "",
  assistance: (e?.assistance as EquipmentInput["assistance"]) ?? "",
  ramp_type: e?.rampType ?? "",
  ramp_id: e?.rampId ?? "",
  state: e?.state ?? "ok",
  repair_requested: e?.repairRequested ?? false,
  padlock: e?.padlock ?? "",
  valid_until: e?.validUntil ?? "",
  ramp_note: e?.rampNote ?? "",
  station_restrictions: e?.stationRestrictions ?? "",
  station_info: e?.stationInfo ?? "",
});

/** Rampes et matériel : état par tout agent `pmr:write`, création / modification par les coordinateurs. */
export function EquipmentBoard({
  rows,
  zones,
  today,
  canWrite,
  coordinator,
}: {
  rows: Equipment[];
  zones: Zone[];
  today: string;
  canWrite: boolean;
  coordinator: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Equipment | null>(null);
  const [events, setEvents] = useState<PmrEvent[] | null>(null);
  const [stateFor, setStateFor] = useState<Equipment | null>(null);
  const [editFor, setEditFor] = useState<Equipment | "new" | null>(null);
  const [zonesOpen, setZonesOpen] = useState(false);
  const wanted = useRef<string | null>(null);

  const loadEvents = useCallback(async (id: string) => {
    wanted.current = id;
    const res = await safeCall(loadEquipmentEvents(id));
    if (wanted.current === id) setEvents(res.ok ? res.data : []);
  }, []);
  const show = (e: Equipment) => {
    setOpen(e);
    setEvents(null);
    void loadEvents(e.id);
  };
  const current = open ? (rows.find((r) => r.id === open.id) ?? open) : null;

  return (
    <>
      {coordinator ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setEditFor("new")}>
            <Plus aria-hidden /> Nouvelle rampe
          </Button>
          <Button variant="secondary" onClick={() => setZonesOpen(true)}>
            <MapPinned aria-hidden /> Zones
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title="Aucun matériel" description="Rien dans cette vue." />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Gare</Th>
                  <Th>Quai</Th>
                  <Th>Zone</Th>
                  <Th>Assistance</Th>
                  <Th>Rampe</Th>
                  <Th>Validité</Th>
                  <Th>État</Th>
                  <Th>Action</Th>
                </tr>
              </THead>
              <tbody data-testid="equipment-table">
                {rows.map((e) => (
                  <Tr
                    key={e.id}
                    statusColor={toneVar[EQUIPMENT_STATE[e.state].tone]}
                    className="cursor-pointer"
                    onClick={() => show(e)}
                  >
                    <Td className="font-mono font-medium">
                      <button
                        type="button"
                        className="cursor-pointer focus-visible:outline-1 focus-visible:outline-accent"
                        aria-label={`Ouvrir la rampe ${e.station} ${e.platform}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          show(e);
                        }}
                      >
                        {e.station}
                      </button>
                    </Td>
                    <Td>{e.platform || "—"}</Td>
                    <Td className="font-mono text-fg-muted">{e.zoneCode || "—"}</Td>
                    <Td>{ASSISTANCE_LABEL[e.assistance] ?? "—"}</Td>
                    <Td className="max-w-40 truncate">
                      {[e.rampType, e.rampId].filter(Boolean).join(" · ") || "—"}
                    </Td>
                    <Td>
                      <ExpiryBadge validUntil={e.validUntil} today={today} />
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <StateBadge state={e.state} />
                        {e.repairRequested ? (
                          <Wrench aria-label="Réparation demandée" className="size-4 text-warn" />
                        ) : null}
                      </span>
                    </Td>
                    <Td onClick={(ev) => ev.stopPropagation()}>
                      {canWrite ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="border border-border"
                          onClick={() => setStateFor(e)}
                        >
                          Changer l&apos;état
                        </Button>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden" data-testid="equipment-cards">
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="block w-full cursor-pointer text-left"
                  onClick={() => show(e)}
                >
                  <ListCard
                    statusColor={toneVar[EQUIPMENT_STATE[e.state].tone]}
                    title={`${e.station}${e.platform ? ` · quai ${e.platform}` : ""}`}
                    meta={`${e.zoneCode || "—"} · ${ASSISTANCE_LABEL[e.assistance] ?? "assistance ?"}${e.repairRequested ? " · réparation demandée" : ""}${expiry(e.validUntil, today) === "expired" ? " · validité dépassée" : ""}`}
                    aside={<StateBadge state={e.state} />}
                  />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={!!current}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
            setEvents(null);
            wanted.current = null;
          }
        }}
        eyebrow="// Rampe et matériel"
        title={
          current
            ? `${current.station}${current.platform ? ` · quai ${current.platform}` : ""}`
            : "Matériel"
        }
        description={
          current
            ? `${current.zoneCode || "zone ?"} · ${ASSISTANCE_LABEL[current.assistance] ?? "assistance ?"}`
            : undefined
        }
        footer={
          current && canWrite ? (
            <div className="flex w-full flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => setStateFor(current)}
                data-testid="equipment-state"
              >
                Changer l&apos;état
              </Button>
              {coordinator ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => setEditFor(current)}
                >
                  <Pencil aria-hidden /> Modifier
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {current ? (
          <div className="flex flex-col gap-5" data-testid="equipment-panel">
            <span className="flex flex-wrap items-center gap-2">
              <StateBadge state={current.state} />
              {current.repairRequested ? <Badge tone="warn">Réparation demandée</Badge> : null}
              <ExpiryBadge validUntil={current.validUntil} today={today} />
            </span>
            {current.stateNote ? <p className="text-body">État : {current.stateNote}</p> : null}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
              <dt className="text-small text-fg-muted">Rampe</dt>
              <dd>{[current.rampType, current.rampId].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-small text-fg-muted">Cadenas</dt>
              <dd>{current.padlock || "—"}</dd>
              <dt className="text-small text-fg-muted">Remarque rampe</dt>
              <dd className="whitespace-pre-line">{current.rampNote || "—"}</dd>
              <dt className="text-small text-fg-muted">Restrictions gare</dt>
              <dd className="whitespace-pre-line">{current.stationRestrictions || "—"}</dd>
              <dt className="text-small text-fg-muted">Infos gare</dt>
              <dd className="whitespace-pre-line">{current.stationInfo || "—"}</dd>
            </dl>
            <section className="flex flex-col gap-3" aria-label="Historique">
              <h3 className="label-mono text-fg-muted">Historique</h3>
              {events === null ? (
                <p className="text-small text-fg-muted">Chargement…</p>
              ) : events.length === 0 ? (
                <p className="text-small text-fg-muted">
                  Aucun changement depuis la reprise de BACO.
                </p>
              ) : (
                <Timeline
                  items={events.map((ev) => {
                    const d = pbDate(ev.at);
                    const title =
                      ev.field === "state"
                        ? `${ev.from ? `${EQUIPMENT_STATE[ev.from as EquipmentState]?.label ?? ev.from} → ` : "Création · "}${EQUIPMENT_STATE[ev.to as EquipmentState]?.label ?? ev.to}`
                        : `Réparation demandée : ${ev.to === "true" ? "oui" : "non"}`;
                    return {
                      id: ev.id,
                      title,
                      meta: `${ev.by}${d ? ` · ${at.format(d)}` : ""}`,
                      note: ev.note && ev.note !== "création" ? ev.note : undefined,
                      color:
                        ev.field === "state"
                          ? toneVar[EQUIPMENT_STATE[ev.to as EquipmentState]?.tone ?? "ok"]
                          : "var(--warn)",
                    };
                  })}
                />
              )}
            </section>
          </div>
        ) : null}
      </Sheet>

      {stateFor ? (
        <StateDialog
          item={stateFor}
          onClose={() => setStateFor(null)}
          onDone={() => {
            setStateFor(null);
            if (open) void loadEvents(open.id);
            router.refresh();
          }}
        />
      ) : null}
      {editFor ? (
        <EquipmentDialog
          item={editFor === "new" ? null : editFor}
          zones={zones}
          onClose={() => setEditFor(null)}
          onDone={() => {
            setEditFor(null);
            router.refresh();
          }}
        />
      ) : null}
      {zonesOpen ? (
        <ZonesDialog
          zones={zones}
          onClose={() => setZonesOpen(false)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function StateDialog({
  item,
  onClose,
  onDone,
}: {
  item: Equipment;
  onClose: () => void;
  onDone: () => void;
}) {
  // Part de l'état et de la précision actuels (cocher seulement « réparation » ne change pas l'état).
  const [state, setState] = useState<EquipmentState>(item.state);
  const [note, setNote] = useState(item.stateNote);
  const [repair, setRepair] = useState(item.repairRequested);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={`État · ${item.station}${item.platform ? ` quai ${item.platform}` : ""}`}
        description="Gardé dans l'historique de la rampe."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await safeCall(setEquipmentState({ id: item.id, state, note, repair }));
              if (!res.ok) return void toast.error(res.error);
              toast.success("État enregistré.");
              onDone();
            });
          }}
        >
          <Segmented
            label="État"
            value={state}
            onChange={(v: EquipmentState) => {
              setState(v);
              // Nouvel état : la précision de l'ancien ne suit pas (sauf si l'agent l'a déjà réécrite).
              if (v !== item.state && note === item.stateNote) setNote("");
              if (v === item.state && !note) setNote(item.stateNote);
            }}
            options={EQUIPMENT_STATES.map((s) => ({ value: s, label: EQUIPMENT_STATE[s].label }))}
          />
          <Field label="Motif / précision" hint="Facultatif">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
            <Checkbox checked={repair} onCheckedChange={(v) => setRepair(v === true)} /> Réparation
            demandée
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Retour
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EquipmentDialog({
  item,
  zones,
  onClose,
  onDone,
}: {
  item: Equipment | null;
  zones: Zone[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState(toInput(item));
  const [pending, start] = useTransition();
  const set = <K extends keyof EquipmentInput>(k: K, v: EquipmentInput[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={item ? "Modifier la rampe" : "Nouvelle rampe"} className="max-w-2xl">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await safeCall(saveEquipment(item?.id ?? null, f));
              if (!res.ok) return void toast.error(res.error);
              toast.success("Rampe enregistrée.");
              onDone();
            });
          }}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Gare" required>
              <Input
                value={f.station}
                onChange={(e) => set("station", e.target.value.toUpperCase())}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Quai">
              <Input
                value={f.platform}
                onChange={(e) => set("platform", e.target.value)}
                maxLength={50}
              />
            </Field>
            <Field label="Zone">
              <Select value={f.zone} onChange={(e) => set("zone", e.target.value)}>
                <option value="">—</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.code}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assistance">
              <Select
                value={f.assistance}
                onChange={(e) => set("assistance", e.target.value as EquipmentInput["assistance"])}
              >
                <option value="">—</option>
                {Object.entries(ASSISTANCE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type de rampe">
              <Input
                value={f.ramp_type}
                onChange={(e) => set("ramp_type", e.target.value)}
                maxLength={100}
              />
            </Field>
            <Field label="N° de rampe">
              <Input
                value={f.ramp_id}
                onChange={(e) => set("ramp_id", e.target.value)}
                maxLength={50}
              />
            </Field>
            <Field label="Cadenas">
              <Input
                value={f.padlock}
                onChange={(e) => set("padlock", e.target.value)}
                maxLength={100}
              />
            </Field>
            <Field label="Validité (fin)">
              <Input
                type="date"
                value={f.valid_until}
                onChange={(e) => set("valid_until", e.target.value)}
              />
            </Field>
            <Field label="État">
              <Select
                value={f.state}
                onChange={(e) => set("state", e.target.value as EquipmentState)}
              >
                {EQUIPMENT_STATES.map((s) => (
                  <option key={s} value={s}>
                    {EQUIPMENT_STATE[s].label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-body">
            <Checkbox
              checked={f.repair_requested}
              onCheckedChange={(v) => set("repair_requested", v === true)}
            />{" "}
            Réparation demandée
          </label>
          <Field label="Remarque rampe">
            <Textarea
              value={f.ramp_note}
              onChange={(e) => set("ramp_note", e.target.value)}
              maxLength={2000}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Restrictions gare">
              <Textarea
                value={f.station_restrictions}
                onChange={(e) => set("station_restrictions", e.target.value)}
                maxLength={2000}
              />
            </Field>
            <Field label="Infos gare">
              <Textarea
                value={f.station_info}
                onChange={(e) => set("station_info", e.target.value)}
                maxLength={2000}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ZonesDialog({
  zones,
  onClose,
  onDone,
}: {
  zones: Zone[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [edit, setEdit] = useState<Zone | "new" | null>(null);
  const [f, setF] = useState({ code: "", label: "", district: "", stations: "" });
  const [pending, start] = useTransition();
  const pick = (z: Zone | "new") => {
    setEdit(z);
    setF(
      z === "new"
        ? { code: "", label: "", district: "", stations: "" }
        : { code: z.code, label: z.label, district: z.district, stations: z.stations.join(", ") },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Zones PMR"
        description="Gares de chaque zone (déduction de la zone à la saisie) et district de rattachement."
      >
        {edit === null ? (
          <div className="flex flex-col gap-2">
            {zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => pick(z)}
                className="flex min-h-11 cursor-pointer flex-col items-start border border-border px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="font-mono text-body text-fg">
                  {z.code} {z.label ? `· ${z.label}` : ""} {z.district ? `· ${z.district}` : ""}
                </span>
                <span className="text-small text-fg-muted">{z.stations.length} gare(s)</span>
              </button>
            ))}
            <Button variant="secondary" className="self-start" onClick={() => pick("new")}>
              <Plus aria-hidden /> Nouvelle zone
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await safeCall(saveZone(edit === "new" ? null : edit.id, f));
                if (!res.ok) return void toast.error(res.error);
                toast.success("Zone enregistrée.");
                setEdit(null);
                onDone();
              });
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code" required>
                <Input
                  value={f.code}
                  onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })}
                  maxLength={10}
                  required
                />
              </Field>
              <Field label="Libellé">
                <Input
                  value={f.label}
                  onChange={(e) => setF({ ...f, label: e.target.value })}
                  maxLength={100}
                />
              </Field>
              <Field label="District" className="col-span-2">
                <Select
                  value={f.district}
                  onChange={(e) => setF({ ...f, district: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="Sud-Ouest">Sud-Ouest</option>
                  <option value="Sud-Est">Sud-Est</option>
                  <option value="Centre">Centre</option>
                </Select>
              </Field>
            </div>
            <Field label="Gares" hint="Codes PtCar ou noms, séparés par des virgules">
              <Textarea
                value={f.stations}
                onChange={(e) => setF({ ...f, stations: e.target.value })}
                maxLength={5000}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEdit(null)}>
                Retour
              </Button>
              <Button type="submit" variant="primary" loading={pending}>
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
