"use client";

import { ArrowLeft, ChevronRight, History, Lock, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { revertRoleChange, saveRole } from "@/app/(app)/admin/roles/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox, Switch } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { ActionBar, Segmented } from "@/components/ui/form-kit";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ROLE_COLOR_LABEL, type RoleColor } from "@/lib/roles";
import {
  dependentsOf,
  diffLabel,
  diffPerms,
  formatWhen,
  historySentences,
  impactSentence,
  isVisible,
  labelOf,
  ordered,
  requirementsOf,
  revertPatch,
  searchEntries,
  sensitiveIn,
  setTask,
  TASK_GROUPS,
  taskSummary,
  toggle,
  type TaskGroup,
} from "@/lib/roles-editor";
import { cn, pl } from "@/lib/utils";
import type { AdminRole, RoleAgent, RoleHistoryRow } from "@/server/data/roles";

import { DeleteRole } from "./delete-role";
import {
  CatalogNote,
  ColorPicker,
  DiffChips,
  PermPreview,
  RoleDot,
  SensitiveBadge,
  type Mark,
} from "./role-bits";

type Draft = { label: string; description: string; color: RoleColor; perms: string[] };

/**
 * Éditeur d'un rôle (lot L4, CADRAGE-ROLES-V3 §4.1) : sections par tâche métier avec résumé, interrupteurs en phrases,
 * dépendances ajoutées et expliquées, recherche ; aperçu en direct (« Ce rôle peut… ») et changements non enregistrés ;
 * comparaison avec un autre rôle ; enregistrement avec récapitulatif (confirmation renforcée pour un droit sensible) et
 * toast « Annuler » ; historique avec « Annuler ce changement ». Un rôle verrouillé s'affiche en lecture seule.
 */
export function RoleEditor({
  role,
  others,
  agents,
  history,
  canAssignFull,
  selfHasRole,
}: {
  role: AdminRole;
  others: AdminRole[];
  agents: RoleAgent[];
  history: RoleHistoryRow[];
  canAssignFull: boolean;
  selfHasRole: boolean;
}) {
  const router = useRouter();
  const base: Draft = useMemo(
    () => ({
      label: role.label,
      description: role.description,
      color: role.color,
      perms: ordered(role.perms),
    }),
    [role],
  );
  const [d, setD] = useState<Draft>(base);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set([TASK_GROUPS[0]?.id ?? ""]));
  const [tab, setTab] = useState<"droits" | "resultat">("droits");
  const [compare, setCompare] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, start] = useTransition();
  const locked = role.locked;
  const active = agents.filter((a) => !a.disabled).length;

  const diff = diffPerms(base.perms, d.perms);
  const metaChanged =
    d.label.trim() !== base.label ||
    d.description.trim() !== base.description ||
    d.color !== base.color;
  const dirty = metaChanged || diff.added.length > 0 || diff.removed.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const marks: Partial<Record<string, Mark>> = {};
  for (const k of diff.added) marks[k] = "added";
  for (const k of diff.removed) marks[k] = "removed";

  const explain = (alsoOn: string[], alsoOff: string[], key?: string) => {
    if (alsoOn.length)
      toast.info(
        `${alsoOn.map((k) => `« ${labelOf(k)} »`).join(", ")} ${alsoOn.length > 1 ? "ont été activés" : "a été activé"}${key ? ` : nécessaire pour « ${labelOf(key)} »` : " (nécessaire)"}.`,
      );
    if (alsoOff.length)
      toast.info(
        `${alsoOff.map((k) => `« ${labelOf(k)} »`).join(", ")} ${alsoOff.length > 1 ? "ont été coupés" : "a été coupé"}${key ? ` : dépend de « ${labelOf(key)} »` : " (dépendait d'un droit coupé)"}.`,
      );
  };

  const flip = (key: string, on: boolean) => {
    const t = toggle(d.perms, key, on);
    setD({ ...d, perms: ordered(t.next) });
    explain(t.alsoOn, t.alsoOff, key);
  };

  const flipTask = (id: string, on: boolean) => {
    const t = setTask(d.perms, id, on);
    setD({ ...d, perms: ordered(t.next) });
    explain(t.alsoOn, t.alsoOff);
  };

  const filtered = query.trim()
    ? TASK_GROUPS.map((g) => ({ ...g, entries: searchEntries(query, g.entries) })).filter(
        (g) => g.entries.length,
      )
    : TASK_GROUPS;

  const doSave = () =>
    start(async () => {
      const r = await saveRole(role.id, {
        label: d.label,
        description: d.description,
        color: d.color,
        perms: d.perms,
        expectedUpdated: role.updated,
      });
      if (!r.ok) return void toast.error(r.error);
      setConfirm(false);
      const { previous, updated } = r.data;
      toast.success("Rôle enregistré.", {
        duration: 10_000,
        action: {
          label: "Annuler",
          onClick: () =>
            void saveRole(role.id, { ...previous, expectedUpdated: updated }).then((u) => {
              if (!u.ok) return void toast.error(u.error);
              toast.success("Changement annulé.");
              router.refresh();
            }),
        },
      });
      router.refresh();
    });

  const other = others.find((o) => o.key === compare);
  const vs = other ? diffPerms(other.perms.filter(isVisible), d.perms) : null;

  return (
    <section className="flex flex-col gap-4" aria-label={`Rôle ${role.label}`}>
      <Link
        href="/admin/roles"
        className="inline-flex min-h-11 items-center gap-1 self-start text-small link"
      >
        <ArrowLeft aria-hidden className="size-4" /> Rôles
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-h2 font-semibold">
            <RoleDot color={d.color} className="size-3" />
            <span className="min-w-0 break-words">{role.label}</span>
            {locked ? <Lock aria-label="Non modifiable" className="size-5 text-fg-muted" /> : null}
          </h2>
          <p className="text-small text-fg-muted">
            {role.basedOnLabel ? (
              <>
                Créé à partir de <strong className="text-fg">{role.basedOnLabel}</strong> ·{" "}
              </>
            ) : role.system ? (
              "Rôle fourni par CSM · "
            ) : null}
            <span data-testid="role-agent-count">
              {active} {pl(active, "agent")}
            </span>
            {role.updated && role.updatedByName
              ? ` · modifié le ${formatWhen(role.updated)} par ${role.updatedByName}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-small text-fg-muted">Comparer avec</span>
            <Select
              value={compare}
              onValueChange={(v) => setCompare(v)}
              className="w-48"
              options={[
                { value: "", label: "—" },
                ...others.map((o) => ({ value: o.key, label: o.label })),
              ]}
            />
          </label>
          <Button
            variant="secondary"
            onClick={() => setHistoryOpen(true)}
            data-testid="role-history"
          >
            <History aria-hidden /> Historique
          </Button>
          {role.system ? null : (
            <DeleteRole
              role={role}
              agents={agents}
              targets={others.filter((o) => canAssignFull || !["admin", "sysop"].includes(o.key))}
              selfHasRole={selfHasRole}
            />
          )}
        </div>
      </header>

      <Segmented
        label="Affichage"
        className="lg:hidden"
        value={tab}
        onChange={setTab}
        options={[
          { value: "droits", label: "Droits" },
          {
            value: "resultat",
            label: dirty && diffLabel(diff) ? `Résultat (${diffLabel(diff)})` : "Résultat",
          },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={cn("flex min-w-0 flex-col gap-4", tab === "resultat" && "hidden lg:flex")}>
          {locked ? (
            <p
              className="flex items-start gap-2 rounded-box border border-border bg-surface-2 px-3 py-2 text-body text-fg-muted"
              data-testid="role-locked"
            >
              <Lock aria-hidden className="mt-1 size-4 shrink-0" />
              {["admin", "sysop"].includes(role.key)
                ? "Ce rôle a tous les droits, administration comprise : il est fixé par CSM."
                : "Ce rôle a un fonctionnement propre (poste partagé, compte désactivé…) : ses droits sont fixés par CSM."}
            </p>
          ) : (
            <Card>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field label="Nom du rôle" required>
                  <Input
                    value={d.label}
                    onChange={(e) => setD({ ...d, label: e.target.value })}
                    maxLength={60}
                  />
                </Field>
                <Field label="Description">
                  <Input
                    value={d.description}
                    onChange={(e) => setD({ ...d, description: e.target.value })}
                    maxLength={300}
                  />
                </Field>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-small font-medium text-fg">Couleur</span>
                  <ColorPicker value={d.color} onChange={(color) => setD({ ...d, color })} />
                </div>
              </CardContent>
            </Card>
          )}

          <label className="relative">
            <span className="sr-only">Chercher un droit</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted"
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un droit (ex. supprimer, PMR, Journal)"
              className="pl-9"
              data-testid="role-search"
            />
          </label>

          <div className="chamfer flex flex-col" data-testid="role-tasks">
            {filtered.length === 0 ? (
              <p className="p-4 text-body text-fg-muted">
                Aucun droit ne correspond à « {query} ».
              </p>
            ) : (
              filtered.map((g, i) => (
                <TaskSection
                  key={g.id}
                  group={g}
                  full={TASK_GROUPS.find((t) => t.id === g.id) ?? g}
                  perms={d.perms}
                  open={!!query.trim() || open.has(g.id)}
                  first={i === 0}
                  locked={locked}
                  onOpen={(o) => {
                    const next = new Set(open);
                    if (o) next.add(g.id);
                    else next.delete(g.id);
                    setOpen(next);
                  }}
                  onFlip={flip}
                  onTask={(on) => flipTask(g.id, on)}
                />
              ))
            )}
          </div>
          <CatalogNote />
        </div>

        <aside
          className={cn(
            "flex min-w-0 flex-col gap-3 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto",
            tab !== "resultat" && "hidden lg:flex",
          )}
          aria-label="Résultat"
        >
          <Card>
            <CardContent className="flex flex-col gap-3">
              <h3 className="text-body-lg font-semibold">Ce rôle…</h3>
              {dirty ? (
                <div
                  className="flex flex-col gap-2 rounded-box border border-info/40 bg-[color-mix(in_oklab,var(--info)_10%,var(--surface))] p-3"
                  data-testid="role-unsaved"
                >
                  <p className="text-small font-semibold text-fg">
                    Changements non enregistrés
                    {diffLabel(diff) ? ` : ${diffLabel(diff)}` : ""}
                  </p>
                  <DiffChips diff={diff} />
                  {metaChanged ? (
                    <p className="text-small text-fg-muted">
                      Nom, description ou couleur modifiés.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {vs && other ? (
                <div
                  className="flex flex-col gap-2 rounded-box border border-border p-3"
                  data-testid="role-compare"
                >
                  <p className="text-small font-semibold text-fg">Différences avec {other.label}</p>
                  {vs.added.length === 0 && vs.removed.length === 0 ? (
                    <p className="text-small text-fg-muted">Mêmes droits.</p>
                  ) : (
                    <>
                      {vs.added.length ? (
                        <CompareList
                          title={`Seulement ${d.label.trim() || role.label}`}
                          keys={vs.added}
                        />
                      ) : null}
                      {vs.removed.length ? (
                        <CompareList title={`Seulement ${other.label}`} keys={vs.removed} />
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
              <PermPreview perms={d.perms} marks={marks} testId="role-preview" />
            </CardContent>
          </Card>
        </aside>
      </div>

      {locked ? null : (
        <ActionBar data-testid="role-savebar">
          <span
            className="min-w-0 basis-full text-small text-fg-muted sm:basis-auto sm:flex-1"
            aria-live="polite"
          >
            {dirty
              ? `${diff.added.length} ${pl(diff.added.length, "ajout")}, ${diff.removed.length} ${pl(diff.removed.length, "retrait")} · ${active} ${pl(active, "agent")} ${pl(active, "concerné")}`
              : "Aucun changement"}
          </span>
          <Button
            variant="ghost"
            className="flex-1 sm:flex-none"
            disabled={!dirty || pending}
            onClick={() => setD(base)}
          >
            <span className="sm:hidden">Annuler</span>
            <span className="hidden sm:inline">Annuler les changements</span>
          </Button>
          <Button
            variant="primary"
            className="flex-1 sm:flex-none"
            disabled={!dirty || d.label.trim().length < 2}
            onClick={() => setConfirm(true)}
            data-testid="role-save"
          >
            Enregistrer
          </Button>
        </ActionBar>
      )}

      <SaveDialog
        open={confirm}
        onOpenChange={setConfirm}
        label={d.label.trim() || role.label}
        diff={diff}
        metaChanged={metaChanged}
        agents={active}
        pending={pending}
        onConfirm={doSave}
      />
      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        role={role}
        rows={history}
        locked={locked}
        dirty={dirty}
      />
    </section>
  );
}

function CompareList({ title, keys }: { title: string; keys: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-hint text-fg-muted">{title}</p>
      <ul className="flex flex-col gap-0.5">
        {keys.map((k) => (
          <li key={k} className="text-small text-fg">
            {labelOf(k)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TaskSection({
  group,
  full,
  perms,
  open,
  first,
  locked,
  onOpen,
  onFlip,
  onTask,
}: {
  group: TaskGroup;
  full: TaskGroup;
  perms: string[];
  open: boolean;
  first: boolean;
  locked: boolean;
  onOpen: (o: boolean) => void;
  onFlip: (key: string, on: boolean) => void;
  onTask: (on: boolean) => void;
}) {
  const s = taskSummary(full, perms);
  const id = `tache-${group.id.replace(/\./g, "-")}`;
  const set = new Set(perms);
  return (
    <section className={cn(!first && "border-t border-border")} data-testid={`task-${group.id}`}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => onOpen(!open)}
          className="flex min-h-12 w-full cursor-pointer items-center gap-2 px-4 py-2 text-left hover:bg-surface-2"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-fg-muted transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1 text-body font-semibold text-fg">
            {full.label}
            <span className="ml-2 text-hint font-normal text-fg-muted">{full.group}</span>
          </span>
          <span
            className={cn(
              "shrink-0 text-small",
              s.kind === "none" ? "text-fg-subtle" : s.kind === "all" ? "text-ok" : "text-fg-muted",
            )}
            data-testid="task-summary"
          >
            {s.label}
          </span>
        </button>
      </h3>
      {open ? (
        <div id={id} className="flex flex-col pb-2">
          {locked ? null : (
            <div className="flex flex-wrap gap-2 px-4 pb-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={s.kind === "all"}
                onClick={() => onTask(true)}
              >
                Tout activer
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={s.kind === "none"}
                onClick={() => onTask(false)}
              >
                Tout couper
              </Button>
            </div>
          )}
          {group.entries.map((e) => {
            const on = set.has(e.key);
            const needed = on ? dependentsOf(e.key).filter((k) => set.has(k)) : [];
            const missing = on
              ? []
              : requirementsOf(e.key).filter((k) => !set.has(k) && isVisible(k));
            return (
              <label
                key={e.key}
                className={cn(
                  "flex min-h-11 items-center gap-3 px-4 py-2 pl-10",
                  locked ? "cursor-default" : "cursor-pointer hover:bg-surface-2",
                )}
                data-testid={`perm-${e.key}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-body text-fg">
                    {e.label}
                    {e.level === "sensible" ? <SensitiveBadge /> : null}
                  </span>
                  <span className="text-small text-fg-muted">{e.sentence}</span>
                  {needed.length ? (
                    <span className="text-small text-info">
                      Nécessaire pour : {needed.map(labelOf).join(", ")}
                    </span>
                  ) : null}
                  {missing.length ? (
                    <span className="text-small text-fg-muted">
                      Active aussi : {missing.map(labelOf).join(", ")}
                    </span>
                  ) : null}
                </span>
                <Switch
                  checked={on}
                  disabled={locked}
                  onCheckedChange={(v) => onFlip(e.key, v)}
                  aria-label={e.label}
                  className="pointer-coarse:h-7 pointer-coarse:w-12"
                />
              </label>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SaveDialog({
  open,
  onOpenChange,
  label,
  diff,
  metaChanged,
  agents,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  label: string;
  diff: { added: string[]; removed: string[] };
  metaChanged: boolean;
  agents: number;
  pending: boolean;
  onConfirm: () => void;
}) {
  const sensitive = sensitiveIn(diff.added);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (!open) setAck(false);
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        eyebrow="Récapitulatif"
        title={`Enregistrer « ${label} » ?`}
        description={impactSentence(diff, agents)}
      >
        <div className="flex flex-col gap-3" data-testid="role-save-summary">
          <DiffChips diff={diff} />
          {metaChanged ? (
            <p className="text-small text-fg-muted">
              Le nom, la description ou la couleur changent aussi.
            </p>
          ) : null}
          {sensitive.length ? (
            <div className="flex flex-col gap-2 rounded-box border border-warn/50 bg-[color-mix(in_oklab,var(--warn)_10%,var(--surface))] p-3">
              <p className="text-small text-fg">
                <strong>Droit sensible ajouté</strong> : {sensitive.map(labelOf).join(", ")}. Ces
                droits donnent accès à des données personnelles, à la suppression ou à la
                modération.
              </p>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body">
                <Checkbox
                  checked={ack}
                  onCheckedChange={(v) => setAck(v === true)}
                  data-testid="role-sensitive-ack"
                />
                Je confirme donner ces droits
                {agents ? ` à ${agents} ${pl(agents, "agent")}` : ""}.
              </label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Revenir
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={pending}
            disabled={sensitive.length > 0 && !ack}
            data-testid="role-save-confirm"
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({
  open,
  onOpenChange,
  role,
  rows,
  locked,
  dirty,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: AdminRole;
  rows: RoleHistoryRow[];
  locked: boolean;
  dirty: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const colorLabel = (c: string) => ROLE_COLOR_LABEL[c as RoleColor] ?? c;
  const items = rows
    .map((r) => ({ ...r, sentences: historySentences(r.action, r.changes, colorLabel) }))
    .filter((r) => r.sentences.length);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        eyebrow={role.label}
        title="Historique du rôle"
        description="Chaque changement, du plus récent au plus ancien."
        className="max-w-xl"
      >
        {items.length === 0 ? (
          <p className="text-body text-fg-muted">
            Aucun changement enregistré depuis la mise en service des rôles.
          </p>
        ) : (
          <ol className="flex flex-col gap-3" data-testid="role-history-list">
            {items.map((r) => {
              const canRevert = !locked && !!revertPatch(r.action, r.changes);
              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-1 border-b border-border pb-3 last:border-0"
                >
                  <p className="text-small text-fg-muted">
                    {formatWhen(r.at)} · <strong className="text-fg">{r.userName}</strong>
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {r.sentences.map((s, i) => (
                      <li key={i} className="text-body text-fg">
                        {s}
                      </li>
                    ))}
                  </ul>
                  {canRevert ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="self-start"
                      loading={pending}
                      onClick={() => {
                        if (
                          dirty &&
                          !window.confirm(
                            "Tes changements non enregistrés seront perdus. Continuer ?",
                          )
                        )
                          return;
                        if (
                          !window.confirm(
                            "Annuler ce changement ? Les valeurs d'avant seront rétablies.",
                          )
                        )
                          return;
                        start(async () => {
                          const res = await revertRoleChange(role.id, r.id);
                          if (!res.ok) return void toast.error(res.error);
                          toast.success("Changement annulé.");
                          onOpenChange(false);
                          router.refresh();
                        });
                      }}
                    >
                      Annuler ce changement
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}
