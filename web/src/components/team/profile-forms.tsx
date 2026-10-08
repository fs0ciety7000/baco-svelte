"use client";

import { KeyRound, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { changeMyPassword, saveMyProfile } from "@/app/(app)/equipe/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { DISTRICT_SHORT, ROLE_LABEL } from "@/lib/team";
import type { MyProfile } from "@/server/data/team";

/** Mon profil : nom et fonction modifiables ; rôle, district, e-mail en lecture (gérés par un administrateur). */
export function ProfileForms({ profile }: { profile: MyProfile }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(profile.name);
  const [fonction, setFonction] = useState(profile.fonction);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwPending, startPw] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveMyProfile({ name, fonction });
      if (r.ok) {
        toast.success("Profil enregistré.");
        router.refresh();
      } else toast.error(r.error);
    });
  const changePw = () =>
    startPw(async () => {
      const r = await changeMyPassword(pw);
      if (r.ok) {
        toast.success("Mot de passe modifié.");
        setPw({ current: "", next: "", confirm: "" });
      } else toast.error(r.error);
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader eyebrow="// Profil" title="Mes informations" />
        <CardContent className="flex flex-col gap-3">
          <Field label="Nom affiché" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Fonction">
            <Input value={fonction} onChange={(e) => setFonction(e.target.value)} maxLength={200} />
          </Field>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body">
            <dt className="text-small text-fg-muted">E-mail</dt>
            <dd className="break-all">{profile.email || "—"}</dd>
            <dt className="text-small text-fg-muted">Identifiant</dt>
            <dd className="font-mono">{profile.username || "—"}</dd>
            <dt className="text-small text-fg-muted">Rôle</dt>
            <dd>{ROLE_LABEL[profile.role] ?? profile.role}</dd>
            <dt className="text-small text-fg-muted">District</dt>
            <dd>
              {profile.district
                ? `${DISTRICT_SHORT[profile.district] ?? ""} · ${profile.district}`
                : "—"}
            </dd>
          </dl>
          <p className="text-hint text-fg-muted">
            Rôle, district et e-mail sont gérés par un administrateur.
          </p>
          <div>
            <Button onClick={save} loading={pending} disabled={!name.trim()}>
              <Save aria-hidden /> Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader eyebrow="// Sécurité" title="Mot de passe" />
        <CardContent className="flex flex-col gap-3">
          <Field label="Mot de passe actuel" required>
            <Input
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })}
            />
          </Field>
          <Field label="Nouveau mot de passe" required hint="10 caractères au moins.">
            <Input
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
            />
          </Field>
          <Field label="Confirmer le nouveau mot de passe" required>
            <Input
              type="password"
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            />
          </Field>
          <div>
            <Button
              variant="secondary"
              onClick={changePw}
              loading={pwPending}
              disabled={!pw.current || pw.next.length < 10 || pw.next !== pw.confirm}
            >
              <KeyRound aria-hidden /> Changer le mot de passe
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
