"use client";

import { ArrowDown, ArrowUp, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { reclassBacoMessages, saveJournalRules } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { RULE_SOURCES, type JournalRule, type RuleSource } from "@/lib/ops/journal-rules";
import { CATEGORY, LOG_CATEGORIES, type LogCategory } from "@/lib/ops/log";
import { safeCall } from "@/lib/orders/safe-call";

/** Éditeur des règles de tri automatique du Journal (Administration › Journal). */
export function JournalRulesEditor({ initial }: { initial: JournalRule[] }) {
  const [rules, setRules] = useState<JournalRule[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const update = (next: JournalRule[]) => {
    setRules(next);
    setDirty(true);
  };
  const set = (i: number, patch: Partial<JournalRule>) =>
    update(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j]!, next[i]!];
    update(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2" data-testid="journal-rules">
        {rules.map((r, i) => (
          <li
            key={i}
            className="grid gap-2 rounded-box border border-border bg-surface p-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,10rem)_auto] sm:items-end"
          >
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-small text-fg-muted">Source</span>
              <Select
                value={r.source}
                onChange={(e) => set(i, { source: e.target.value as RuleSource })}
              >
                {Object.entries(RULE_SOURCES).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-small text-fg-muted">Mots-clés (séparés par des virgules)</span>
              <Input
                value={r.match}
                maxLength={300}
                placeholder="vide = catégorie par défaut"
                onChange={(e) => set(i, { match: e.target.value })}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-small text-fg-muted">Catégorie</span>
              <Select
                value={r.category}
                onChange={(e) => set(i, { category: e.target.value as LogCategory })}
              >
                {LOG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY[c].label}
                  </option>
                ))}
              </Select>
            </label>
            <span className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Monter la règle"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Descendre la règle"
                disabled={i === rules.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Supprimer la règle"
                onClick={() => update(rules.filter((_, k) => k !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </span>
          </li>
        ))}
        {rules.length === 0 ? (
          <li className="text-small text-fg-muted">
            Aucune règle : catégories par défaut (iRail : perturbation, travaux, info).
          </li>
        ) : null}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          className="border border-border"
          disabled={rules.length >= 40}
          onClick={() => update([...rules, { source: "baco", match: "", category: "service" }])}
        >
          <Plus aria-hidden /> Ajouter une règle
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || pending}
          loading={pending}
          data-testid="journal-rules-save"
          onClick={() =>
            start(async () => {
              const res = await safeCall(saveJournalRules({ rules }));
              if (!res.ok) return void toast.error(res.error);
              setDirty(false);
              toast.success("Règles enregistrées : elles s'appliquent aux prochains messages.");
            })
          }
        >
          Enregistrer
        </Button>
        <Button
          variant="secondary"
          className="ml-auto"
          disabled={dirty || pending}
          title={dirty ? "Enregistre d'abord les règles" : undefined}
          onClick={() =>
            start(async () => {
              const res = await safeCall(reclassBacoMessages());
              if (!res.ok) return void toast.error(res.error);
              toast.success(
                `${res.data.changed} message${res.data.changed > 1 ? "s" : ""} reclassé${res.data.changed > 1 ? "s" : ""} sur ${res.data.total} repris de BACO.`,
              );
            })
          }
          data-testid="journal-reclass"
        >
          <RefreshCw aria-hidden /> Reclasser les messages BACO
        </Button>
      </div>
    </div>
  );
}
