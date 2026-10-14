"use client";

import { KeyRound, Mail, Power, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  resetPassword,
  sendResetLink,
  setActive,
  setPermissions,
  updateUser,
} from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { PERMISSION_KEYS } from "@/lib/permissions";
import { DEFAULT_ROLES, roleMeta, type RoleMeta } from "@/lib/roles";
import type { AdminUser } from "@/server/data/admin";

import { DistrictPicker } from "./district-picker";
import { PermissionMatrix, type Tri } from "./permission-matrix";
import { PasswordReveal, roleOptions } from "./user-create";

const KNOWN = new Set(PERMISSION_KEYS);

/** Fiche d'un compte : identité, rôle et districts, droits par module (4 actions, 3 états), activation, mot de passe. */
export function UserEditor({
  user,
  isSelf,
  resetMail = false,
  roles = DEFAULT_ROLES,
  canAssignFull = false,
}: {
  user: AdminUser;
  isSelf: boolean;
  /** Rôles attribuables (collection `roles`, lot L3). */
  roles?: RoleMeta[];
  /** L'administrateur connecté peut attribuer Administrateur / Sysop (rôle `admin`). */
  canAssignFull?: boolean;
  /** Envoi d'e-mails réglé sur PocketBase (lien de réinitialisation possible). */
  resetMail?: boolean;
}) {
  const router = useRouter();
  const disabled = user.role === "disabled";
  const [f, setF] = useState({
    name: user.name,
    username: user.username,
    fonction: user.fonction,
    districts: user.districts,
    role: disabled ? user.disabledRole || "paco" : user.role,
  });
  const [perm, setPerm] = useState<Record<string, Tri>>(() => {
    const m: Record<string, Tri> = {};
    // Seules les clés du catalogue sont éditées ici ; les autres (reprises de BACO) sont gardées par le serveur.
    for (const k of user.grants) if (KNOWN.has(k)) m[k] = "accorde";
    for (const k of user.denies) if (KNOWN.has(k) && !m[k]) m[k] = "retire";
    return m;
  });
  const [pending, start] = useTransition();
  const [password, setPassword] = useState<string | null>(null);
  const role = f.role || "paco";
  const meta = roleMeta(role, roles) ?? {
    ...DEFAULT_ROLES.find((r) => r.key === "guest")!,
    key: role,
    label: role,
    perms: [],
  };
  const current = disabled ? user.disabledRole : user.role;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Refusé.");
      toast.success(done);
      router.refresh();
    });

  const savePerms = () =>
    run(
      () =>
        setPermissions(user.id, {
          grants: Object.keys(perm).filter((k) => perm[k] === "accorde"),
          denies: Object.keys(perm).filter((k) => perm[k] === "retire"),
        }),
      "Droits enregistrés.",
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h3 font-semibold">{user.name || user.username || user.email}</h2>
        {disabled ? <Badge tone="danger">Désactivé</Badge> : <Badge tone="ok">Actif</Badge>}
        <span className="text-small text-fg-muted break-all">{user.email}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Compte" title="Identité et rôle" />
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom affiché" required>
              <Input
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                maxLength={200}
              />
            </Field>
            <Field label="Identifiant">
              <Input
                value={f.username}
                onChange={(e) => setF({ ...f, username: e.target.value })}
                maxLength={100}
              />
            </Field>
            <Field
              label={disabled ? "Rôle à la réactivation" : "Rôle"}
              hint={isSelf ? "Tu ne peux pas changer ton propre rôle." : undefined}
            >
              <Select
                value={f.role}
                onChange={(e) => setF({ ...f, role: e.target.value })}
                disabled={isSelf}
              >
                {roleOptions(roles, canAssignFull, current).map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Districts"
              hint="Filtres et alertes par défaut ; n'importe quelle combinaison."
            >
              <DistrictPicker
                value={f.districts}
                onChange={(districts) => setF({ ...f, districts })}
              />
            </Field>
            <Field label="Fonction" className="sm:col-span-2">
              <Input
                value={f.fonction}
                onChange={(e) => setF({ ...f, fonction: e.target.value })}
                maxLength={200}
              />
            </Field>
            <div className="sm:col-span-2">
              <Button
                onClick={() => run(() => updateUser(user.id, f), "Compte enregistré.")}
                loading={pending}
                disabled={!f.name.trim() || disabled}
              >
                <Save aria-hidden /> Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader eyebrow="Sécurité" title="Accès" />
          <CardContent className="flex flex-col gap-3">
            <p className="text-small text-fg-muted">
              Un compte désactivé ne peut plus se connecter ; son rôle est gardé pour la
              réactivation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={disabled ? "primary" : "danger"}
                disabled={isSelf || pending}
                onClick={() =>
                  disabled
                    ? run(() => setActive(user.id, true, f.role), "Compte réactivé.")
                    : window.confirm(
                        "Désactiver ce compte ? L'agent ne pourra plus se connecter.",
                      ) && run(() => setActive(user.id, false), "Compte désactivé.")
                }
              >
                <Power aria-hidden /> {disabled ? "Réactiver" : "Désactiver le compte"}
              </Button>
              <Button
                variant="secondary"
                disabled={isSelf || pending || disabled}
                onClick={() =>
                  window.confirm("Générer un nouveau mot de passe provisoire ?") &&
                  start(async () => {
                    const r = await resetPassword(user.id);
                    if (!r.ok) return void toast.error(r.error);
                    setPassword(r.data.password);
                  })
                }
              >
                <KeyRound aria-hidden /> Réinitialiser le mot de passe
              </Button>
              <Button
                variant="secondary"
                disabled={isSelf || pending || disabled || !user.email || !resetMail}
                title={resetMail ? undefined : "Envoi d'e-mails non configuré"}
                onClick={() =>
                  window.confirm(`Envoyer un lien de réinitialisation à ${user.email} ?`) &&
                  run(() => sendResetLink(user.id), "Lien de réinitialisation envoyé.")
                }
              >
                <Mail aria-hidden /> Envoyer un lien par e-mail
              </Button>
            </div>
            {isSelf ? (
              <p className="text-hint text-fg-muted">
                Ton propre compte : change ton mot de passe dans « Mon profil ».
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          eyebrow="Droits"
          title="Droits par module"
          actions={
            <Button size="sm" onClick={savePerms} loading={pending} disabled={disabled}>
              <Save aria-hidden /> Enregistrer les droits
            </Button>
          }
        />
        <CardContent className="flex flex-col gap-4">
          {role === "screen" ? (
            <p className="text-body text-fg-muted" data-testid="screen-role-note">
              Compte « Écran » : aucun droit de module, même accordé. Il ne voit que l&apos;écran
              commun (/tv) : bons bus ouverts, missions PMR sans nom, trains en retard, ALEA,
              urgences et consignes ; ni taxis ni groupes. Ses districts règlent ce qu&apos;affiche
              l&apos;écran.
            </p>
          ) : (
            <PermissionMatrix role={meta} value={perm} onChange={setPerm} />
          )}
        </CardContent>
      </Card>
      {password ? <PasswordReveal password={password} onClose={() => setPassword(null)} /> : null}
    </div>
  );
}
