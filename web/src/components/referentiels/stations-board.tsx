"use client";

import { Check, Pencil, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { applyDistricts, setStationKind, setStationLines } from "@/app/(app)/reseau/gares/actions";
import { StationDistrict } from "@/components/referentiels/station-district";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/status-badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { lineLabel } from "@/lib/lines";
import { STATION_DISTRICT_LABEL, STATION_DISTRICTS } from "@/lib/timetable/stations";
import { pl } from "@/lib/utils";
import type { StationRow } from "@/server/data/timetable";

const KIND_LABEL: Record<string, string> = { gare: "Gare", pang: "PANG", etranger: "Étranger" };

const trainsHref = (gare: string) => `/reseau/horaires?vue=gare&gare=${encodeURIComponent(gare)}`;

/**
 * Ressources › Gares : liste avec sélection multiple (attribution d'un district en masse, validation des propositions),
 * district, lignes et type modifiables gare par gare (droit « Modifier les référentiels du réseau »).
 */
export function StationsBoard({ rows, canEdit }: { rows: StationRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("DSO");
  const withSuggestion = useMemo(() => rows.filter((r) => !r.district && r.suggested), [rows]);
  const chosen = rows.filter((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = (items: { id: string; district: string }[], label: string) =>
    start(async () => {
      if (!items.length) return;
      const res = await applyDistricts(items).catch(() => null);
      if (!res) return void toast.error("Serveur injoignable : réessaie.");
      if (!res.ok) return void toast.error(res.error);
      toast.success(
        `${label} : ${res.done} ${pl(res.done ?? 0, "gare")}${res.failed ? `, ${res.failed} refusée(s)` : ""}.`,
      );
      setSelected(new Set());
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <div
          className="flex flex-wrap items-center gap-2 rounded-box border border-(--card-frame) bg-surface px-3 py-2 shadow-rest"
          data-testid="stations-bulk"
        >
          <span className="text-small text-fg-muted">
            <span className="font-medium text-fg tabular">{chosen.length}</span>{" "}
            {pl(chosen.length, "sélectionnée")}
          </span>
          <Select
            aria-label="District à attribuer"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            className="w-44"
          >
            {STATION_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d} · {STATION_DISTRICT_LABEL[d]}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !chosen.length}
            onClick={() =>
              run(
                chosen.map((r) => ({ id: r.id, district: bulk })),
                `District ${bulk}`,
              )
            }
            data-testid="bulk-assign"
          >
            Attribuer à la sélection
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !chosen.some((r) => r.suggested && !r.district)}
            onClick={() =>
              run(
                chosen
                  .filter((r) => r.suggested && !r.district)
                  .map((r) => ({ id: r.id, district: r.suggested })),
                "Propositions validées",
              )
            }
            data-testid="bulk-validate"
          >
            Valider les propositions sélectionnées
          </Button>
          {withSuggestion.length ? (
            <Button
              size="sm"
              variant="primary"
              disabled={pending}
              className="ml-auto"
              onClick={() =>
                run(
                  withSuggestion.map((r) => ({ id: r.id, district: r.suggested })),
                  "Propositions validées",
                )
              }
              data-testid="validate-all"
            >
              Valider les {withSuggestion.length} propositions affichées
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="hidden md:block">
        <Table data-testid="stations-table">
          <THead>
            <tr>
              {canEdit ? (
                <Th className="w-10">
                  <Checkbox
                    aria-label="Tout sélectionner"
                    checked={rows.length > 0 && chosen.length === rows.length}
                    onCheckedChange={(v) =>
                      setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())
                    }
                  />
                </Th>
              ) : null}
              <Th>Gare</Th>
              <Th>Type</Th>
              <Th>Abrév.</Th>
              <Th>District</Th>
              <Th>Proposition</Th>
              <Th>Lignes</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((s) => (
              <Tr key={s.id} selected={selected.has(s.id)}>
                {canEdit ? (
                  <Td>
                    <Checkbox
                      aria-label={`Sélectionner ${s.name}`}
                      checked={selected.has(s.id)}
                      onCheckedChange={() => toggle(s.id)}
                    />
                  </Td>
                ) : null}
                <Td className="max-w-72">
                  <StationName s={s} />
                </Td>
                <Td>
                  <KindCell s={s} canEdit={canEdit} />
                </Td>
                <Td className="font-mono text-small">{s.abbr || "—"}</Td>
                <Td>
                  <DistrictCell s={s} canEdit={canEdit} />
                </Td>
                <Td className="max-w-64">
                  <SuggestionCell
                    s={s}
                    canEdit={canEdit}
                    pending={pending}
                    onApply={() => run([{ id: s.id, district: s.suggested }], s.name)}
                  />
                </Td>
                <Td className="max-w-72">
                  <LinesCell s={s} canEdit={canEdit} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((s) => (
          <li
            key={s.id}
            className="flex min-w-0 flex-col gap-2 rounded-box border border-(--card-frame) bg-surface px-3 py-2 shadow-rest"
            data-selected={selected.has(s.id) || undefined}
          >
            <div className="flex min-w-0 items-start gap-2">
              {canEdit ? (
                <Checkbox
                  aria-label={`Sélectionner ${s.name}`}
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                  className="mt-1"
                />
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <StationName s={s} />
                <span className="text-small text-fg-muted">
                  {KIND_LABEL[s.kind] ?? "—"}
                  {s.abbr ? ` · ${s.abbr}` : ""} · {s.country}
                </span>
              </div>
            </div>
            <DistrictCell s={s} canEdit={canEdit} />
            <SuggestionCell
              s={s}
              canEdit={canEdit}
              pending={pending}
              onApply={() => run([{ id: s.id, district: s.suggested }], s.name)}
            />
            <LinesCell s={s} canEdit={canEdit} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function StationName({ s }: { s: StationRow }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-2">
      <Link href={trainsHref(s.name)} className="link font-medium">
        {s.name}
      </Link>
      {s.nameNl ? <span className="text-small text-fg-muted">{s.nameNl}</span> : null}
      {!s.served ? (
        <span className="text-small text-fg-muted">(sans arrêt cette semaine)</span>
      ) : null}
    </span>
  );
}

function DistrictCell({ s, canEdit }: { s: StationRow; canEdit: boolean }) {
  if (canEdit)
    return <StationDistrict id={s.id} name={s.name} district={s.district} manual={s.manual} />;
  return s.district ? (
    <Badge tone="info">
      {s.district}
      {s.manual ? " · modifié" : ""}
    </Badge>
  ) : (
    <span className="text-small text-fg-muted">—</span>
  );
}

function SuggestionCell({
  s,
  canEdit,
  pending,
  onApply,
}: {
  s: StationRow;
  canEdit: boolean;
  pending: boolean;
  onApply: () => void;
}) {
  if (s.district || !s.suggested) return <span className="text-small text-fg-muted">—</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2" data-testid="station-suggestion">
      <Badge tone="warn" title={s.suggestion}>
        {s.suggested} ?
      </Badge>
      <span className="min-w-0 truncate text-small text-fg-muted" title={s.suggestion}>
        {s.suggestion}
      </span>
      {canEdit ? (
        <Button size="sm" variant="secondary" disabled={pending} onClick={onApply}>
          <Check aria-hidden className="size-4" /> Appliquer
        </Button>
      ) : null}
    </span>
  );
}

function KindCell({ s, canEdit }: { s: StationRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canEdit) return <span className="text-small">{KIND_LABEL[s.kind] ?? "—"}</span>;
  return (
    <CustomSelect
      aria-label={`Type de ${s.name}`}
      label={`Type de ${s.name}`}
      value={s.kind}
      disabled={pending}
      className="w-32"
      options={[
        ...(!s.kind ? [{ value: "", label: "—" }] : []),
        { value: "gare", label: "Gare" },
        { value: "pang", label: "PANG" },
        { value: "etranger", label: "Étranger" },
      ]}
      onValueChange={(kind) => {
        start(async () => {
          const res = await setStationKind({ id: s.id, kind }).catch(() => null);
          if (!res?.ok)
            return void toast.error(res && !res.ok ? res.error : "Serveur injoignable.");
          router.refresh();
        });
      }}
    />
  );
}

function LinesCell({ s, canEdit }: { s: StationRow; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(s.lines.join(", "));
  const save = (lines: string[] | "auto") =>
    start(async () => {
      const res = await setStationLines({ id: s.id, lines }).catch(() => null);
      if (!res) return void toast.error("Serveur injoignable : réessaie.");
      if (!res.ok) return void toast.error(res.error);
      setEditing(false);
      router.refresh();
    });
  if (editing)
    return (
      <form
        className="flex flex-wrap items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          save(
            value
              .split(/[\s,;]+/)
              .map((x) => x.replace(/^L\.?/i, "").trim())
              .filter(Boolean),
          );
        }}
      >
        <Input
          aria-label={`Lignes de ${s.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="96, 97"
          className="w-36"
          autoFocus
        />
        <Button
          size="sm"
          type="submit"
          variant="secondary"
          loading={pending}
          aria-label="Enregistrer les lignes"
        >
          <Check aria-hidden className="size-4" />
        </Button>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => setEditing(false)}
          aria-label="Annuler"
        >
          <X aria-hidden className="size-4" />
        </Button>
        {s.linesManual ? (
          <Button size="sm" type="button" variant="ghost" onClick={() => save("auto")}>
            Automatique
          </Button>
        ) : null}
      </form>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {s.lines.length ? (
        s.lines.map((l) => (
          <Link
            key={l}
            href={`/reseau/horaires?vue=ligne&ligne=${encodeURIComponent(l)}`}
            className="link font-mono text-small"
          >
            {lineLabel(l)}
          </Link>
        ))
      ) : (
        <span className="text-small text-fg-muted">—</span>
      )}
      {s.linesManual ? <span className="text-small text-fg-muted">(modifiées)</span> : null}
      {canEdit ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          aria-label={`Modifier les lignes de ${s.name}`}
        >
          <Pencil aria-hidden className="size-4" />
        </Button>
      ) : null}
    </span>
  );
}
