"use client";

import { ArrowDown, ArrowUp, GitBranch, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { resetLine, saveLineStations } from "@/app/(app)/reseau/lignes/actions";
import { StationInput } from "@/components/orders/station-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { canonicalStation, type StationRef } from "@/lib/stations/search";
import type { RailBranch, RailStation } from "@/lib/timetable/rail-segments";

// Éditeur des gares d'une ligne (Ressources › Lignes, 14 oct. 2026 ; remplace Admin › Lignes et arrêts) : tronc puis
// embranchements, ordre, ajout (nom du référentiel des gares), retrait, nouvel embranchement. Enregistrer marque la ligne
// « corrigée à la main » ; « Rétablir l'automatique » reprend les gares de l'import.

type Item = RailStation & { k: number };

export function LineEditor({
  id,
  name,
  stations,
  branches,
  manual,
  refs,
  onClose,
}: {
  id: string;
  name: string;
  stations: RailStation[];
  branches: RailBranch[];
  manual: boolean;
  refs: StationRef[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(name);
  const [items, setItems] = useState<Item[]>(() => stations.map((s, k) => ({ ...s, k })));
  const [from, setFrom] = useState<Record<number, string>>(() =>
    Object.fromEntries(branches.map((b) => [b.b, b.from])),
  );
  const [adding, setAdding] = useState<Record<number, string>>({});
  const [next, setNext] = useState(stations.length);
  // Embranchement ouvert sans gare encore : il n'existe qu'à partir du premier ajout.
  const [pendingBranch, setPendingBranch] = useState<number | null>(null);

  const segments = useMemo(() => {
    const nums = [...new Set(items.filter((s) => s.b).map((s) => s.b!))].sort((a, b) => a - b);
    return [0, ...nums.filter((n) => n > 0)];
  }, [items]);
  const trunk = items.filter((s) => !s.b);

  const of = (b: number) => items.filter((s) => (s.b ?? 0) === b);

  const move = (b: number, i: number, d: -1 | 1) => {
    const seg = of(b);
    const j = i + d;
    if (j < 0 || j >= seg.length) return;
    const a = seg[i]!;
    const c = seg[j]!;
    setItems((all) => {
      const out = [...all];
      const ia = out.indexOf(a);
      const ic = out.indexOf(c);
      out[ia] = c;
      out[ic] = a;
      return out;
    });
  };

  const add = (b: number) => {
    const raw = (adding[b] ?? "").trim();
    if (!raw) return;
    const n = canonicalStation(raw, refs) || raw;
    if (of(b).some((s) => s.n === n)) return void toast.error(`${n} est déjà sur ce tronçon.`);
    setItems((all) => {
      const seg = all.filter((s) => (s.b ?? 0) === b);
      const last = seg.at(-1);
      const at = last ? all.indexOf(last) + 1 : all.length;
      const out = [...all];
      out.splice(at, 0, { n, ...(b ? { b } : {}), k: next });
      return out;
    });
    setNext((x) => x + 1);
    setAdding((a) => ({ ...a, [b]: "" }));
  };

  const newBranch = () => {
    const b = Math.max(0, ...segments) + 1;
    setFrom((f) => ({ ...f, [b]: trunk[0]?.n ?? "" }));
    setAdding((a) => ({ ...a, [b]: "" }));
    setPendingBranch(b);
  };
  const shown =
    pendingBranch && !segments.includes(pendingBranch) ? [...segments, pendingBranch] : segments;

  const save = () =>
    start(async () => {
      const list: RailStation[] = items.map((it) => {
        const { k, ...s } = it;
        void k;
        return s;
      });
      const r = await saveLineStations({
        id,
        name: title,
        stations: list,
        branches: shown
          .filter((b) => b > 0)
          .map((b) => ({ b, from: from[b] ?? "", to: of(b).at(-1)?.n ?? "" })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Ligne enregistrée : les bons bus utilisent ces gares.");
      onClose();
      router.refresh();
    });

  const reset = () =>
    window.confirm(
      "Reprendre les gares de l'import (tes corrections sur cette ligne seront perdues) ?",
    ) &&
    start(async () => {
      const r = await resetLine(id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Ligne rétablie d'après le référentiel des trains.");
      onClose();
      router.refresh();
    });

  return (
    <div
      className="flex flex-col gap-4 rounded-box border border-(--card-frame) bg-surface p-3 shadow-rest"
      data-testid="line-editor"
    >
      <Field label="Nom de la ligne (extrémités)">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
      </Field>
      {shown.map((b) => {
        const seg = of(b);
        return (
          <section
            key={b}
            className="flex flex-col gap-2"
            aria-label={b ? `Embranchement ${b}` : "Tronc"}
          >
            <div className="flex flex-wrap items-end gap-2">
              <h3 className="text-small font-medium">{b ? `Embranchement ${b}` : "Tronc"}</h3>
              {b ? (
                <label className="flex min-w-0 items-center gap-2 text-small text-fg-muted">
                  depuis
                  <Select
                    aria-label={`Gare de bifurcation de l'embranchement ${b}`}
                    value={from[b] ?? ""}
                    onChange={(e) => setFrom((f) => ({ ...f, [b]: e.target.value }))}
                    className="w-48"
                  >
                    <option value="">— tronçon séparé —</option>
                    {trunk.map((s) => (
                      <option key={s.k} value={s.n}>
                        {s.n}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
            </div>
            <ol className="flex flex-col divide-y divide-border rounded-box border border-border">
              {seg.map((s, i) => (
                <li key={s.k} className="flex min-h-11 flex-wrap items-center gap-1 px-2 py-1">
                  <span className="w-6 font-mono text-small text-fg-muted tabular">{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words">{s.n}</span>
                  {typeof s.km === "number" ? (
                    <span className="font-mono text-small text-fg-muted tabular">
                      km {s.km.toLocaleString("fr-BE")}
                    </span>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Monter ${s.n}`}
                    disabled={i === 0 || pending}
                    onClick={() => move(b, i, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Descendre ${s.n}`}
                    disabled={i === seg.length - 1 || pending}
                    onClick={() => move(b, i, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Retirer ${s.n}`}
                    disabled={pending}
                    onClick={() => setItems((all) => all.filter((x) => x !== s))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 sm:max-w-sm">
                <StationInput
                  aria-label={
                    b ? `Gare à ajouter à l'embranchement ${b}` : "Gare à ajouter au tronc"
                  }
                  value={adding[b] ?? ""}
                  onChange={(v) => setAdding((a) => ({ ...a, [b]: v }))}
                  refs={refs}
                  placeholder="Gare à ajouter en fin de tronçon"
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => add(b)}
                disabled={!adding[b]?.trim() || pending}
              >
                <Plus aria-hidden /> Ajouter
              </Button>
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button variant="primary" onClick={save} loading={pending} data-testid="line-save">
          <Save aria-hidden /> Enregistrer
        </Button>
        <Button variant="secondary" onClick={newBranch} disabled={pending}>
          <GitBranch aria-hidden /> Nouvel embranchement
        </Button>
        {manual ? (
          <Button variant="secondary" onClick={reset} disabled={pending}>
            <RotateCcw aria-hidden /> Rétablir l&apos;automatique
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose} disabled={pending} className="md:ml-auto">
          <X aria-hidden /> Annuler
        </Button>
      </div>
    </div>
  );
}

/** Bouton « Modifier les gares » : l'éditeur remplace la liste tant qu'il est ouvert. */
export function LineEditToggle({
  children,
  ...props
}: Omit<Parameters<typeof LineEditor>[0], "onClose"> & { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <LineEditor {...props} onClose={() => setOpen(false)} />;
  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => setOpen(true)}
        data-testid="line-edit"
      >
        Modifier les gares
      </Button>
      {children}
    </div>
  );
}
