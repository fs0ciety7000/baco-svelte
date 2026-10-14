"use client";

import { Lightbulb, Minus, Plus, Save, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { setPermissions } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { FULL_ROLE_KEYS, type RoleMeta } from "@/lib/roles";
import {
  addAdjustment,
  adjustmentHasEffect,
  adjustmentsOf,
  effectivePerms,
  entry,
  labelOf,
  ordered,
  searchEntries,
  splitAdjustments,
  type Adjust,
} from "@/lib/roles-editor";
import { cn, pl } from "@/lib/utils";

import { PermissionMatrix, type Tri } from "./permission-matrix";
import { PermPreview, SensitiveBadge, type Mark } from "./roles/role-bits";

/**
 * Droits d'un agent (rôles v3, lot L5, CADRAGE-ROLES-V3 §4.2) : son rôle + des « ajustements » en phrases (« En plus de son
 * rôle : … » / « Retiré : … »), chacun retirable ; « Ce que cette personne peut faire » (ajustements surlignés) ; suggestion
 * de créer un rôle quand d'autres agents ont les mêmes ajustements ; la grille 3 états reste en « Vue experte ». Stockage
 * inchangé : `grants` / `denies` par `setPermissions` (droits hors catalogue conservés par le serveur).
 */
export function AgentRights({
  userId,
  firstName,
  grants,
  denies,
  role,
  roleChanged,
  disabled,
  peers,
}: {
  userId: string;
  firstName: string;
  grants: string[];
  denies: string[];
  /** Rôle choisi dans la fiche (peut différer du rôle enregistré tant que la fiche n'est pas enregistrée). */
  role: RoleMeta;
  roleChanged: boolean;
  disabled: boolean;
  /** Autres agents actifs ayant exactement le même rôle et les mêmes ajustements. */
  peers: number;
}) {
  const router = useRouter();
  const saved = useMemo(() => adjustmentsOf(grants, denies), [grants, denies]);
  const [adj, setAdj] = useState<Record<string, Adjust>>(saved);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<"ajustements" | "resultat">("ajustements");
  const [pending, start] = useTransition();
  const full = FULL_ROLE_KEYS.includes(role.key);
  const rolePerms = role.perms;
  const perms = effectivePerms(role.key, rolePerms, adj);
  const keys = ordered(Object.keys(adj));
  const dirty = JSON.stringify(splitAdjustments(adj)) !== JSON.stringify(splitAdjustments(saved));
  const changes =
    keys.filter((k) => saved[k] !== adj[k]).length +
    Object.keys(saved).filter((k) => !(k in adj)).length;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const marks: Partial<Record<string, Mark>> = {};
  for (const k of keys) if (adjustmentHasEffect(rolePerms, k, adj[k]!)) marks[k] = adj[k];

  const add = (key: string, kind: Adjust) => {
    const r = addAdjustment(adj, rolePerms, key, kind);
    setAdj(r.next);
    if (r.alsoPlus.length)
      toast.info(
        `Ajouté aussi : ${r.alsoPlus.map((k) => `« ${labelOf(k)} »`).join(", ")} (nécessaire pour « ${labelOf(key)} »).`,
      );
  };
  const remove = (key: string) => {
    const next = { ...adj };
    delete next[key];
    setAdj(next);
  };

  const save = () =>
    start(async () => {
      const r = await setPermissions(userId, splitAdjustments(adj));
      if (!r.ok) return void toast.error(r.error);
      toast.success("Ajustements enregistrés.");
      router.refresh();
    });

  const tri: Record<string, Tri> = {};
  for (const k of keys) tri[k] = adj[k] === "plus" ? "accorde" : "retire";

  if (role.key === "screen") {
    return (
      <Card>
        <CardHeader eyebrow="Droits" title="Ce que cette personne peut faire" />
        <CardContent>
          <p className="text-body text-fg-muted" data-testid="screen-role-note">
            Compte « Écran » : aucun droit de module, même accordé. Il ne voit que l&apos;écran
            commun (/tv) : bons bus ouverts, missions PMR sans nom, trains en retard, ALEA, urgences
            et consignes ; ni taxis ni groupes. Ses districts règlent ce qu&apos;affiche
            l&apos;écran.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="agent-rights">
      <Segmented
        label="Affichage des droits"
        className="lg:hidden"
        value={tab}
        onChange={setTab}
        options={[
          { value: "ajustements", label: "Ajustements" },
          { value: "resultat", label: "Résultat" },
        ]}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={cn("flex min-w-0 flex-col gap-4", tab === "resultat" && "hidden lg:flex")}>
          <Card>
            <CardHeader eyebrow="Droits" title="Ajustements pour cette personne" />
            <CardContent className="flex flex-col gap-3">
              {full ? (
                <p className="text-body text-fg-muted">
                  {role.label} : tous les droits, sans exception. Aucun ajustement possible.
                </p>
              ) : (
                <>
                  <p className="text-small text-fg-muted">
                    S&apos;ajoutent à son rôle <strong className="text-fg">{role.label}</strong> ou
                    en retirent un droit.
                    {roleChanged
                      ? " Rôle modifié dans la fiche : enregistre-la pour qu'il compte."
                      : ""}
                  </p>
                  <Button
                    variant="secondary"
                    className="self-stretch sm:self-start"
                    disabled={disabled}
                    onClick={() => setAdding(true)}
                    data-testid="add-adjustment"
                  >
                    <Plus aria-hidden /> Ajouter un ajustement
                  </Button>
                  {keys.length === 0 ? (
                    <p
                      className="rounded-box border border-dashed border-border px-3 py-4 text-center text-small text-fg-muted"
                      data-testid="no-adjustment"
                    >
                      Aucun ajustement : cette personne a exactement les droits de son rôle.
                    </p>
                  ) : (
                    <ul className="flex flex-col" data-testid="adjustments">
                      {keys.map((k) => {
                        const kind = adj[k]!;
                        const e = entry(k);
                        const effect = adjustmentHasEffect(rolePerms, k, kind);
                        return (
                          <li
                            key={k}
                            className="flex items-start gap-2 border-t border-border py-2 first:border-t-0"
                            data-testid={`adjustment-${k}`}
                          >
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="flex flex-wrap items-center gap-2 text-body text-fg">
                                <Badge tone={kind === "plus" ? "ok" : "danger"}>
                                  {kind === "plus" ? "En plus" : "Retiré"}
                                </Badge>
                                {labelOf(k)}
                                {e?.level === "sensible" ? <SensitiveBadge /> : null}
                              </span>
                              <span className="text-small text-fg-muted">
                                {effect
                                  ? e?.sentence
                                  : kind === "plus"
                                    ? "Sans effet : son rôle donne déjà ce droit."
                                    : "Sans effet : son rôle ne donne pas ce droit."}
                              </span>
                            </span>
                            <Button
                              variant="ghost"
                              className="shrink-0 px-2 sm:px-4"
                              disabled={disabled}
                              onClick={() => remove(k)}
                              aria-label={`Retirer l'ajustement « ${labelOf(k)} »`}
                            >
                              <X aria-hidden /> Retirer
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
              {!full && dirty ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="min-w-0 flex-1 text-small text-fg-muted" aria-live="polite">
                    {changes} {pl(changes, "changement")} non {pl(changes, "enregistré")}
                  </span>
                  <Button variant="ghost" disabled={pending} onClick={() => setAdj(saved)}>
                    Annuler
                  </Button>
                  <Button
                    variant="primary"
                    onClick={save}
                    loading={pending}
                    disabled={disabled}
                    data-testid="save-adjustments"
                  >
                    <Save aria-hidden /> Enregistrer les ajustements
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {!full && !dirty && keys.length > 0 && peers > 0 && !roleChanged ? (
            <p
              className="flex flex-wrap items-center gap-2 rounded-box border border-border bg-surface-2 px-3 py-2 text-small text-fg"
              data-testid="role-suggestion"
            >
              <Lightbulb aria-hidden className="size-4 shrink-0 text-warn" />
              {peers} {pl(peers, "autre agent a", "autres agents ont")} les mêmes ajustements.
              <Link href={`/admin/roles?depuis=${userId}`} className="link">
                Créer un rôle à partir de ces ajustements
              </Link>
            </p>
          ) : null}

          {full ? null : (
            <details className="chamfer group" data-testid="expert-view">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-body font-medium">
                Vue experte : grille des droits par module
              </summary>
              <div className="px-4 pb-4">
                <PermissionMatrix
                  role={role}
                  value={tri}
                  onChange={(next) => {
                    const out: Record<string, Adjust> = {};
                    for (const [k, v] of Object.entries(next))
                      if (v !== "defaut") out[k] = v === "accorde" ? "plus" : "moins";
                    setAdj(out);
                  }}
                />
              </div>
            </details>
          )}
        </div>

        <aside
          className={cn(
            "min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto",
            tab !== "resultat" && "hidden lg:block",
          )}
          aria-label="Ce que cette personne peut faire"
        >
          <Card>
            <CardContent className="flex flex-col gap-3">
              <h3 className="text-body-lg font-semibold">{firstName} peut…</h3>
              <PermPreview perms={perms} marks={marks} testId="agent-preview" />
            </CardContent>
          </Card>
        </aside>
      </div>

      <AddAdjustment
        open={adding}
        onOpenChange={setAdding}
        perms={perms}
        adj={adj}
        onAdd={(k, kind) => {
          add(k, kind);
          setAdding(false);
        }}
      />
    </div>
  );
}

/** « Ajouter un ajustement » : même liste de phrases que l'éditeur de rôles, avec recherche. */
function AddAdjustment({
  open,
  onOpenChange,
  perms,
  adj,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  perms: string[];
  adj: Record<string, Adjust>;
  onAdd: (key: string, kind: Adjust) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const has = new Set(perms);
  const list = searchEntries(q).filter((e) => !adj[e.key]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        eyebrow="Ajustement"
        title="Ajouter un ajustement"
        description="Donne un droit en plus de son rôle, ou retire-lui un droit de son rôle."
        className="max-w-xl"
      >
        <label className="relative mb-3 block">
          <span className="sr-only">Chercher un droit</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher un droit (ex. supprimer, PMR, Journal)"
            className="pl-9"
            autoFocus
            data-testid="adjustment-search"
          />
        </label>
        {list.length === 0 ? (
          <p className="text-body text-fg-muted">Aucun droit ne correspond.</p>
        ) : (
          <ul className="flex flex-col" data-testid="adjustment-choices">
            {list.map((e) => {
              const on = has.has(e.key);
              return (
                <li
                  key={e.key}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-body text-fg">
                      {e.label}
                      {e.level === "sensible" ? <SensitiveBadge /> : null}
                    </span>
                    <span className="text-small text-fg-muted">
                      {on ? "A ce droit aujourd'hui." : "N'a pas ce droit aujourd'hui."}
                    </span>
                  </span>
                  {on ? (
                    <Button variant="secondary" size="sm" onClick={() => onAdd(e.key, "moins")}>
                      <Minus aria-hidden /> Retirer ce droit
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => onAdd(e.key, "plus")}>
                      <Plus aria-hidden /> Donner en plus
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
