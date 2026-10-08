"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addStation, deleteStation, reorderLine, updateStation } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { DISTRICT_SHORT } from "@/lib/team";
import type { LineStation } from "@/server/data/admin";

type Line = { line: string; district: string; stations: LineStation[] };
const DISTRICTS = ["", "Sud-Ouest", "Sud-Est", "Centre"];

/** Lignes et arrêts (ex-ligne_data) : arrêts dans l'ordre, district par gare ; sert aux commandes et aux districts. */
export function LineBoard({ lines }: { lines: Line[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState({ line: "", station: "", district: "" });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Refusé.");
      toast.success(done);
      router.refresh();
    });

  const move = (l: Line, i: number, d: -1 | 1) => {
    const ids = l.stations.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    run(() => reorderLine(l.line, ids), "Ordre enregistré.");
  };

  const shown = lines.filter(
    (l) =>
      !q ||
      l.line.toLowerCase().includes(q.toLowerCase()) ||
      l.stations.some((s) => s.station.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2 border border-border bg-surface p-3 sm:grid-cols-[8rem_1fr_10rem_auto] sm:items-end">
        <Field label="Ligne">
          <Input
            value={add.line}
            onChange={(e) => setAdd({ ...add, line: e.target.value })}
            maxLength={50}
          />
        </Field>
        <Field label="Gare à ajouter (en fin de ligne)">
          <Input
            value={add.station}
            onChange={(e) => setAdd({ ...add, station: e.target.value.toUpperCase() })}
            maxLength={200}
          />
        </Field>
        <Field label="District">
          <Select
            value={add.district}
            onChange={(e) => setAdd({ ...add, district: e.target.value })}
          >
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d ? `${DISTRICT_SHORT[d]} · ${d}` : "—"}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          onClick={() =>
            run(async () => {
              const r = await addStation(add);
              if (r.ok) {
                setOpen(add.line.trim());
                setAdd({ ...add, station: "" });
              }
              return r;
            }, "Gare ajoutée.")
          }
          loading={pending}
          disabled={!add.line.trim() || !add.station.trim()}
        >
          <Plus aria-hidden /> Ajouter
        </Button>
      </div>
      <Field label="Filtrer" className="max-w-sm">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ligne ou gare…" />
      </Field>
      {shown.length === 0 ? (
        <EmptyState title="Aucune ligne" />
      ) : (
        <ul className="flex flex-col gap-2" data-testid="lines">
          {shown.map((l) => (
            <li key={l.line} className="border border-border bg-surface">
              <button
                type="button"
                className="flex min-h-12 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left"
                aria-expanded={open === l.line}
                onClick={() => setOpen(open === l.line ? null : l.line)}
              >
                <span className="font-mono text-body font-semibold">L.{l.line}</span>
                <span className="text-small text-fg-muted">{l.stations.length} gare(s)</span>
                {l.district ? (
                  <Badge tone="info">{DISTRICT_SHORT[l.district] ?? l.district}</Badge>
                ) : null}
                <span className="ml-auto truncate text-small text-fg-muted">
                  {l.stations[0]?.station} → {l.stations.at(-1)?.station}
                </span>
              </button>
              {open === l.line ? (
                <ol className="flex flex-col border-t border-border">
                  {l.stations.map((s, i) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5"
                    >
                      <span className="w-8 font-mono text-small text-fg-muted tabular">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body">{s.station}</span>
                      <Select
                        aria-label={`District de ${s.station}`}
                        className="w-36"
                        value={s.district}
                        onChange={(e) =>
                          run(
                            () =>
                              updateStation(s.id, {
                                line: s.line,
                                station: s.station,
                                district: e.target.value,
                              }),
                            "District enregistré.",
                          )
                        }
                      >
                        {DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d ? DISTRICT_SHORT[d] : "—"}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Monter ${s.station}`}
                        disabled={i === 0 || pending}
                        onClick={() => move(l, i, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Descendre ${s.station}`}
                        disabled={i === l.stations.length - 1 || pending}
                        onClick={() => move(l, i, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Retirer ${s.station}`}
                        disabled={pending}
                        onClick={() =>
                          window.confirm(`Retirer ${s.station} de la ligne ${l.line} ?`) &&
                          run(() => deleteStation(s.id), "Gare retirée.")
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
