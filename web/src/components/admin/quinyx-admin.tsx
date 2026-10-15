"use client";

import { Check, Link2Off, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  addQuinyxGroup,
  addQuinyxPlace,
  confirmQuinyxSuggestions,
  deleteQuinyxGroup,
  deleteQuinyxPlace,
  linkQuinyxAgent,
  updateQuinyxGroup,
  updateQuinyxPlace,
} from "@/app/(app)/admin/quinyx/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, Count } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filters";
import { Input, Select } from "@/components/ui/input";
import { Select as CustomSelect } from "@/components/ui/select";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { sinceLabel } from "@/lib/orders/time";
import { safeCall } from "@/lib/orders/safe-call";
import { QUINYX_DISTRICTS } from "@/lib/quinyx/model";
import type { QuinyxAgentRow, QuinyxGroupRow, QuinyxPlaceRow } from "@/server/data/quinyx";

type Res = { ok: true } | { ok: false; error: string };

function useAct() {
  const [pending, start] = useTransition();
  const act = (p: () => Promise<Res>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await safeCall(p());
      if (!r.ok) return void toast.error(r.error);
      if (ok) toast.success(ok);
      after?.();
    });
  return { pending, act };
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardContent className="flex flex-col gap-3 pt-2">
        <p className="text-small text-fg-muted">{hint}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function DistrictSelect(props: React.ComponentProps<typeof Select> & { allowEmpty?: boolean }) {
  const { allowEmpty, ...rest } = props;
  return (
    <Select {...rest}>
      {allowEmpty ? <option value="">Aucun</option> : null}
      {QUINYX_DISTRICTS.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </Select>
  );
}

export function QuinyxGroups({ groups }: { groups: QuinyxGroupRow[] }) {
  const { pending, act } = useAct();
  const [form, setForm] = useState({ groupId: "", label: "", district: "" });
  return (
    <Section
      title="Groupes Quinyx"
      hint="Plannings lus par l'extension (un groupe = une page « schedule » de Quinyx). Colle l'adresse de la page ou son numéro. Le district sert quand aucun lieu de la table ne correspond."
    >
      <ul className="flex flex-col gap-2" data-testid="quinyx-groups">
        {groups.map((g) => (
          <li
            key={g.id}
            className="grid gap-2 rounded-control bg-surface-2 p-3 md:grid-cols-[minmax(0,1fr)_8rem_auto] md:items-center"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">
                {g.label} <span className="tabular text-small text-fg-muted">n° {g.groupId}</span>
              </span>
              <span className="text-small text-fg-muted">
                {g.lastSync
                  ? `Synchronisé ${sinceLabel(new Date(g.lastSync))}${g.lastBy ? ` par ${g.lastBy}` : ""} · ${g.lastCount} prestation${g.lastCount > 1 ? "s" : ""} du ${g.lastFrom} au ${g.lastTo}`
                  : "Jamais synchronisé"}
              </span>
            </div>
            <DistrictSelect
              aria-label={`District par défaut de ${g.label}`}
              allowEmpty
              defaultValue={g.district}
              disabled={pending}
              onChange={(e) =>
                act(
                  () => updateQuinyxGroup(g.id, { district: e.target.value }),
                  "District enregistré.",
                )
              }
            />
            <span className="flex gap-2">
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => act(() => updateQuinyxGroup(g.id, { enabled: !g.enabled }))}
              >
                {g.enabled ? "Désactiver" : "Activer"}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Retirer le groupe ${g.label}`}
                disabled={pending}
                onClick={() => {
                  if (
                    confirm(
                      `Retirer le groupe « ${g.label} » ? Ses prestations sont retirées du planning.`,
                    )
                  )
                    act(() => deleteQuinyxGroup(g.id), "Groupe retiré.");
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </span>
          </li>
        ))}
        {groups.length === 0 ? (
          <li className="text-small text-fg-muted">
            Aucun groupe : l&apos;extension ne lira rien.
          </li>
        ) : null}
      </ul>
      <form
        className="grid gap-2 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_8rem_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          act(
            () => addQuinyxGroup(form),
            "Groupe ajouté.",
            () => setForm({ groupId: "", label: "", district: "" }),
          );
        }}
      >
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-small text-fg-muted">Adresse ou n° du groupe</span>
          <Input
            required
            value={form.groupId}
            maxLength={200}
            inputMode="url"
            placeholder="…/schedule/123456"
            onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            data-testid="quinyx-group-id"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-small text-fg-muted">Nom</span>
          <Input
            required
            value={form.label}
            maxLength={80}
            placeholder="PACO/RCCA Mons"
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            data-testid="quinyx-group-label"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-small text-fg-muted">District</span>
          <DistrictSelect
            allowEmpty
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
          />
        </label>
        <Button type="submit" variant="primary" disabled={pending} data-testid="quinyx-group-add">
          <Plus aria-hidden /> Ajouter
        </Button>
      </form>
    </Section>
  );
}

export function QuinyxPlaces({ places }: { places: QuinyxPlaceRow[] }) {
  const { pending, act } = useAct();
  const [form, setForm] = useState({ pattern: "", district: "DSO" });
  return (
    <Section
      title="Lieux → districts"
      hint="District d'une prestation : le lieu le plus long trouvé dans son libellé (« PACO_AM PACO Mons » → MONS ; « EXTRA - OCC SO » → OCC SO). Mots entiers, majuscules et accents ignorés."
    >
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="quinyx-places">
        {places.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-control bg-surface-2 p-2">
            <span className="min-w-0 flex-1 truncate font-medium">{p.pattern}</span>
            <DistrictSelect
              aria-label={`District de ${p.pattern}`}
              className="w-24"
              defaultValue={p.district}
              disabled={pending}
              onChange={(e) =>
                act(() => updateQuinyxPlace(p.id, e.target.value), "District enregistré.")
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Retirer ${p.pattern}`}
              disabled={pending}
              onClick={() => act(() => deleteQuinyxPlace(p.id))}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2 sm:flex sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          act(
            () => addQuinyxPlace(form),
            "Lieu ajouté.",
            () => setForm({ ...form, pattern: "" }),
          );
        }}
      >
        <label className="flex min-w-0 flex-col gap-1 sm:w-64">
          <span className="text-small text-fg-muted">Lieu (tel qu&apos;écrit dans Quinyx)</span>
          <Input
            required
            value={form.pattern}
            maxLength={40}
            placeholder="CHARLEROI"
            onChange={(e) => setForm({ ...form, pattern: e.target.value })}
            data-testid="quinyx-place-pattern"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-small text-fg-muted">District</span>
          <DistrictSelect
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
          />
        </label>
        <Button type="submit" variant="secondary" className="col-span-2" disabled={pending}>
          <Plus aria-hidden /> Ajouter le lieu
        </Button>
      </form>
    </Section>
  );
}

export function QuinyxAgents({
  agents,
  users,
}: {
  agents: QuinyxAgentRow[];
  users: { id: string; name: string }[];
}) {
  const { pending, act } = useAct();
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const todo = agents.filter((a) => !a.confirmed);
  const shown = filter === "todo" ? todo : agents;
  const pendingSuggestions = todo.filter((a) => a.suggestedId).length;
  const taken = useMemo(
    () => new Map(agents.filter((a) => a.userId).map((a) => [a.userId, a.name])),
    [agents],
  );
  return (
    <Section
      title="Agents Quinyx ↔ comptes CSM"
      hint="CSM propose le compte dont le nom complet est identique. Un agent n'apparaît dans « Mon planning », le widget et les districts du jour qu'une fois rattaché."
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip pressed={filter === "todo"} onClick={() => setFilter("todo")}>
          À rattacher <Count>{todo.length}</Count>
        </FilterChip>
        <FilterChip pressed={filter === "all"} onClick={() => setFilter("all")}>
          Tous <Count>{agents.length}</Count>
        </FilterChip>
        {pendingSuggestions ? (
          <Button
            variant="secondary"
            className="sm:ml-auto"
            disabled={pending}
            data-testid="quinyx-confirm-all"
            onClick={() => act(() => confirmQuinyxSuggestions(), "Propositions validées.")}
          >
            <Check aria-hidden /> Valider les {pendingSuggestions} proposition
            {pendingSuggestions > 1 ? "s" : ""}
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2" data-testid="quinyx-agents">
        {shown.map((a) => (
          <li
            key={a.id}
            className="grid gap-2 rounded-control bg-surface-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] md:items-center"
          >
            <div className="flex min-w-0 flex-col">
              <span className="font-medium">{a.name}</span>
              <span className="text-small text-fg-muted">
                {a.confirmed ? (
                  <Badge tone="ok">Rattaché à {a.userName || "un compte"}</Badge>
                ) : a.suggestedId ? (
                  <Badge tone="info">Proposé : {a.suggestedName}</Badge>
                ) : (
                  <Badge tone="warn">Aucun compte trouvé</Badge>
                )}
              </span>
            </div>
            <CustomSelect
              aria-label={`Compte CSM de ${a.name}`}
              label={`Compte CSM de ${a.name}`}
              defaultValue={a.userId || a.suggestedId}
              key={`${a.id}-${a.userId}-${a.suggestedId}`}
              disabled={pending}
              placeholder="Choisir un compte…"
              onValueChange={(v) => {
                if (v) act(() => linkQuinyxAgent(a.id, v), "Agent rattaché.");
              }}
              options={users.map((u) => ({
                value: u.id,
                label:
                  u.name +
                  (taken.has(u.id) && taken.get(u.id) !== a.name ? " (déjà rattaché)" : ""),
              }))}
            />
            <span className="flex gap-2">
              {!a.confirmed && a.suggestedId ? (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => act(() => linkQuinyxAgent(a.id, a.suggestedId), "Agent rattaché.")}
                >
                  <Check aria-hidden /> Valider
                </Button>
              ) : null}
              {a.userId ? (
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => act(() => linkQuinyxAgent(a.id, ""), "Rattachement retiré.")}
                >
                  <Link2Off aria-hidden /> Détacher
                </Button>
              ) : null}
            </span>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="text-small text-fg-muted">
            {agents.length
              ? "Tous les agents sont rattachés."
              : "Aucun agent reçu : lance une synchro depuis l'extension, onglet Quinyx ouvert."}
          </li>
        ) : null}
      </ul>
    </Section>
  );
}
