"use client";

import { KeyRound, Power, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resetPassword, setActive, setPermissions, updateUser } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { PERMISSION_CATALOG, roleHas, type Role } from "@/lib/permissions";

const KNOWN = new Set(PERMISSION_CATALOG.flatMap((g) => g.items.map((i) => i.key)));
import { ROLE_LABEL } from "@/lib/team";
import type { AdminUser } from "@/server/data/admin";

import { DISTRICT_CHOICES, PasswordReveal, ROLE_CHOICES } from "./user-create";

type Tri = "defaut" | "accorde" | "retire";

/** Fiche d'un compte : identité, rôle et district, droits à 3 états, activation, mot de passe. */
export function UserEditor({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const router = useRouter();
  const disabled = user.role === "disabled";
  const [f, setF] = useState({
    name: user.name,
    username: user.username,
    fonction: user.fonction,
    district: user.district,
    role: disabled ? user.disabledRole || "user" : user.role,
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
  const role = (f.role || "user") as Role;

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
          <CardHeader eyebrow="// Compte" title="Identité et rôle" />
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
              hint={isSelf ? "Vous ne pouvez pas changer votre propre rôle." : undefined}
            >
              <Select
                value={f.role}
                onChange={(e) => setF({ ...f, role: e.target.value })}
                disabled={isSelf}
              >
                {ROLE_CHOICES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="District" hint="Donne le droit d'écrire la B201.">
              <Select value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })}>
                {DISTRICT_CHOICES.map((d) => (
                  <option key={d} value={d}>
                    {d || "Aucun"}
                  </option>
                ))}
              </Select>
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
          <CardHeader eyebrow="// Sécurité" title="Accès" />
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
            </div>
            {isSelf ? (
              <p className="text-hint text-fg-muted">
                Votre propre compte : changez votre mot de passe dans « Mon profil ».
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader
          eyebrow="// Droits"
          title="Droits par module"
          actions={
            <Button size="sm" onClick={savePerms} loading={pending} disabled={disabled}>
              <Save aria-hidden /> Enregistrer les droits
            </Button>
          }
        />
        <CardContent className="flex flex-col gap-4">
          <p className="text-small text-fg-muted">
            « Rôle » suit le défaut du rôle {ROLE_LABEL[role]} (indiqué entre parenthèses) ; «
            Accordé » et « Retiré » s&apos;imposent à lui. Les administrateurs et sysops ont tous
            les droits.
          </p>
          {PERMISSION_CATALOG.map((g) => (
            <fieldset key={g.group} className="flex flex-col gap-1">
              <legend className="label-mono pb-1 text-fg-muted">{g.group}</legend>
              {g.items.map((it) => {
                const value = perm[it.key] ?? "defaut";
                const byRole = roleHas(role, it.key);
                return (
                  <div
                    key={it.key}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-1.5"
                  >
                    <span className="text-body">
                      {it.label}{" "}
                      <span className="text-small text-fg-muted">
                        ({byRole ? "oui" : "non"} par le rôle)
                      </span>
                    </span>
                    <Select
                      aria-label={`Droit ${it.label}`}
                      className="w-40"
                      value={value}
                      onChange={(e) => setPerm({ ...perm, [it.key]: e.target.value as Tri })}
                    >
                      <option value="defaut">Rôle</option>
                      <option value="accorde">Accordé</option>
                      <option value="retire">Retiré</option>
                    </Select>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </CardContent>
      </Card>
      {password ? <PasswordReveal password={password} onClose={() => setPassword(null)} /> : null}
    </div>
  );
}
