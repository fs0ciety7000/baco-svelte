"use client";

import { Check, Minus, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ACTION_LABEL,
  ACTIONS,
  PERMISSION_MODULES,
  roleHas,
  type Action,
  type Role,
} from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/team";
import { cn } from "@/lib/utils";

/** État d'un droit pour un compte : hérité du rôle, accordé (grants) ou retiré (denies). */
export type Tri = "defaut" | "accorde" | "retire";

const NEXT: Record<Tri, Tri> = { defaut: "accorde", accorde: "retire", retire: "defaut" };
const STATE_LABEL: Record<Tri, string> = {
  defaut: "hérité du rôle",
  accorde: "accordé",
  retire: "retiré",
};

/**
 * Droits par module (rôles v2, 11 oct. 2026) : quatre actions (lecture, écriture, modification, suppression), chacune
 * héritée du rôle ou imposée au compte. Un clic fait tourner « hérité → accordé → retiré ». Les administrateurs et
 * sysops ont tout : la grille est alors en lecture seule.
 */
export function PermissionMatrix({
  role,
  value,
  onChange,
}: {
  role: Role;
  value: Record<string, Tri>;
  onChange: (next: Record<string, Tri>) => void;
}) {
  const full = role === "admin" || role === "sysop";
  const overrides = Object.values(value).filter((v) => v !== "defaut").length;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-small text-fg-muted">
          {full
            ? `${ROLE_LABEL[role]} : tous les droits, sans exception.`
            : `Chaque case hérite du rôle ${ROLE_LABEL[role]} ; un clic l'accorde, un deuxième la retire, un troisième la rend au rôle.`}
        </p>
        {!full && overrides > 0 ? (
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            <RotateCcw aria-hidden /> Tout rendre au rôle ({overrides})
          </Button>
        ) : null}
      </div>
      <Legend />
      {PERMISSION_MODULES.map((g) => (
        <fieldset key={g.group} className="flex min-w-0 flex-col">
          <legend className="label-mono pb-2 text-fg-muted">{g.group}</legend>
          <div
            aria-hidden
            className="hidden border-b border-border pb-1 text-hint text-fg-muted sm:grid sm:grid-cols-[minmax(0,1fr)_repeat(4,7rem)] sm:gap-2"
          >
            <span>Module</span>
            {ACTIONS.map((a) => (
              <span key={a} className="text-center">
                {ACTION_LABEL[a]}
              </span>
            ))}
          </div>
          {g.modules.map((m) => (
            <div
              key={m.key}
              className="grid grid-cols-4 items-center gap-2 border-b border-border py-2 sm:grid-cols-[minmax(0,1fr)_repeat(4,7rem)]"
            >
              <div className="col-span-4 min-w-0 sm:col-span-1">
                <div className="text-body text-fg">{m.label}</div>
                {m.hint ? <div className="text-hint text-fg-muted">{m.hint}</div> : null}
              </div>
              {ACTIONS.map((a) =>
                m.actions.includes(a) ? (
                  <Cell
                    key={a}
                    module={m.label}
                    action={a}
                    byRole={roleHas(role, `${m.key}:${a}`)}
                    state={full ? "defaut" : (value[`${m.key}:${a}`] ?? "defaut")}
                    disabled={full}
                    onCycle={() => {
                      const key = `${m.key}:${a}`;
                      const next = NEXT[value[key] ?? "defaut"];
                      const copy = { ...value };
                      if (next === "defaut") delete copy[key];
                      else copy[key] = next;
                      onChange(copy);
                    }}
                  />
                ) : (
                  <span
                    key={a}
                    aria-hidden
                    className="hidden text-center text-hint text-fg-subtle sm:block"
                  >
                    —
                  </span>
                ),
              )}
            </div>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function Cell({
  module,
  action,
  byRole,
  state,
  disabled,
  onCycle,
}: {
  module: string;
  action: Action;
  byRole: boolean;
  state: Tri;
  disabled: boolean;
  onCycle: () => void;
}) {
  const allowed = state === "accorde" || (state === "defaut" && byRole);
  const Icon = allowed ? Check : Minus;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onCycle}
      aria-label={`${module} — ${ACTION_LABEL[action]} : ${allowed ? "autorisé" : "refusé"} (${STATE_LABEL[state]})`}
      title={STATE_LABEL[state]}
      data-state={state}
      className={cn(
        "flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border px-1 text-hint transition-colors disabled:cursor-default",
        state === "defaut" &&
          (allowed
            ? "border-border bg-surface-2 text-fg"
            : "border-dashed border-border text-fg-subtle"),
        state === "accorde" && "border-ok bg-ok/10 text-ok",
        state === "retire" && "border-danger bg-danger/10 text-danger",
        !disabled && "hover:border-fg-muted",
      )}
    >
      <span className="sm:hidden">{ACTION_LABEL[action]}</span>
      <span className="flex items-center gap-1">
        <Icon className="size-4" aria-hidden strokeWidth={2.5} />
        {state !== "defaut" ? (
          <span className="font-medium">{state === "accorde" ? "Accordé" : "Retiré"}</span>
        ) : null}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-hint text-fg-muted" aria-label="Légende">
      <li className="flex items-center gap-1.5">
        <span className="grid size-5 place-items-center rounded-control border border-border bg-surface-2 text-fg">
          <Check className="size-3" aria-hidden />
        </span>
        Hérité : autorisé
      </li>
      <li className="flex items-center gap-1.5">
        <span className="grid size-5 place-items-center rounded-control border border-dashed border-border text-fg-subtle">
          <Minus className="size-3" aria-hidden />
        </span>
        Hérité : refusé
      </li>
      <li className="flex items-center gap-1.5">
        <span className="grid size-5 place-items-center rounded-control border border-ok bg-ok/10 text-ok">
          <Check className="size-3" aria-hidden />
        </span>
        Accordé au compte
      </li>
      <li className="flex items-center gap-1.5">
        <span className="grid size-5 place-items-center rounded-control border border-danger bg-danger/10 text-danger">
          <Minus className="size-3" aria-hidden />
        </span>
        Retiré au compte
      </li>
    </ul>
  );
}
