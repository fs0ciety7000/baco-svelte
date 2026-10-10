"use client";

import { Camera, KeyRound, MapPin, PlugZap, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  changeMyPassword,
  removeMyAvatar,
  saveMyProfile,
  uploadMyAvatar,
} from "@/app/(app)/equipe/actions";
import { setDutyDistricts } from "@/app/(app)/operations/actions";
import { Avatar } from "@/components/shell/avatar";
import { PasskeysCard } from "@/components/team/passkeys";
import { useShell } from "@/components/shell/shell-context";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { DUTY_DISTRICTS, DUTY_SHORT } from "@/lib/ops/log";
import { DISTRICT_SHORT, ROLE_LABEL } from "@/lib/team";
import { cn } from "@/lib/utils";
import type { MyActivity, MyProfile } from "@/server/data/team";

/** Recadre au centre en carré et réduit à 512 px (WebP, sinon JPEG) avant l'envoi : photo légère, jamais déformée. */
async function squareImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(512, side);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    out,
    out,
  );
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.86),
  );
  if (blob && blob.type === "image/webp") return blob;
  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.88),
  );
  if (!jpeg) throw new Error("Conversion impossible");
  return jpeg;
}

function PhotoCard({ profile }: { profile: MyProfile }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisis une image (JPEG, PNG, WebP).");
    start(async () => {
      try {
        const blob = await squareImage(file);
        const form = new FormData();
        form.set("avatar", new File([blob], "avatar", { type: blob.type }));
        const r = await uploadMyAvatar(form);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Photo enregistrée.");
        router.refresh();
      } catch {
        toast.error("Cette image n'a pas pu être lue.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  };
  const remove = () =>
    start(async () => {
      const r = await removeMyAvatar();
      if (!r.ok) return void toast.error(r.error);
      toast.success("Photo retirée.");
      router.refresh();
    });
  return (
    <Card className="lg:col-span-2">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <Avatar
          name={profile.name}
          email={profile.email}
          id={profile.id}
          avatar={profile.avatar}
          large
          className="size-20 text-h3"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-h3 font-semibold text-fg">{profile.name}</span>
          <span className="text-body text-fg-muted">
            {profile.fonction || ROLE_LABEL[profile.role] || "—"}
            {profile.district
              ? ` · ${DISTRICT_SHORT[profile.district] ?? ""} ${profile.district}`
              : ""}
          </span>
          <span className="text-small text-fg-muted">
            Ta photo est visible de tous les agents (Journal, Équipe, barre du haut).
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Choisir une photo"
            data-testid="avatar-input"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button variant="secondary" loading={pending} onClick={() => input.current?.click()}>
            <Camera aria-hidden /> {profile.avatar ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {profile.avatar ? (
            <Button variant="ghost" onClick={remove} disabled={pending}>
              <Trash2 aria-hidden /> Retirer
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DutyCard({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(initial);
  const [pending, start] = useTransition();
  const toggle = (d: string) => {
    const next = picked.includes(d) ? picked.filter((x) => x !== d) : [...picked, d];
    setPicked(next);
    start(async () => {
      const r = await setDutyDistricts(next);
      if (!r.ok) {
        setPicked(picked);
        return void toast.error(r.error);
      }
      router.refresh();
    });
  };
  return (
    <Card>
      <CardHeader eyebrow="// Aujourd'hui" title="Mes districts du jour" />
      <CardContent className="flex flex-col gap-3">
        <p className="text-small text-fg-muted">
          Urgences, perturbations iRail et retards des missions de ces districts te sont notifiés,
          pour la journée. Enregistré à chaque clic.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Districts du jour">
          {DUTY_DISTRICTS.map((d) => {
            const on = picked.includes(d);
            return (
              <button
                key={d}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={pending}
                onClick={() => toggle(d)}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-body transition-colors",
                  on
                    ? "border-accent bg-accent-soft text-fg"
                    : "border-border-strong bg-surface text-fg-muted hover:text-fg",
                )}
              >
                <MapPin aria-hidden className={cn("size-4", on && "text-accent")} />
                {DUTY_SHORT[d]} · {d}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityCard({ activity }: { activity: MyActivity }) {
  const stats: [string, number | null][] = [
    ["messages au Journal", activity.journal],
    ["bons de commande créés", activity.orders],
    ["blocs ALEA encodés", activity.alea],
  ];
  const shown = stats.filter(([, n]) => n !== null);
  if (!shown.length) return null;
  return (
    <Card>
      <CardHeader eyebrow="// 30 derniers jours" title="Mon activité" />
      <CardContent>
        <dl className="grid grid-cols-3 gap-3" data-testid="my-activity">
          {shown.map(([label, n]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="order-2 text-small text-fg-muted">{label}</dt>
              <dd className="order-1 font-mono text-h2 text-fg tabular">{n}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * Mon profil (enrichi le 10 oct. 2026) : photo, nom, fonction, téléphone pro ; districts du jour ; affichage et
 * notifications ; mot de passe et appareils connectés ; activité. Rôle, district de rattachement, e-mail et identifiant
 * restent gérés par un administrateur.
 */
export function ProfileForms({
  profile,
  activity,
  duty,
  canExtension,
  passkeys,
}: {
  profile: MyProfile;
  activity: MyActivity;
  duty: string[];
  canExtension: boolean;
  passkeys: boolean;
}) {
  const router = useRouter();
  const { ui, setUi } = useShell();
  const [pending, start] = useTransition();
  const [name, setName] = useState(profile.name);
  const [fonction, setFonction] = useState(profile.fonction);
  const [workPhone, setWorkPhone] = useState(profile.workPhone);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwPending, startPw] = useTransition();

  const save = () =>
    start(async () => {
      const r = await saveMyProfile({ name, fonction, workPhone });
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
      <PhotoCard profile={profile} />
      <Card>
        <CardHeader eyebrow="// Profil" title="Mes informations" />
        <CardContent className="flex flex-col gap-3">
          <Field label="Nom affiché" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Fonction">
            <Input value={fonction} onChange={(e) => setFonction(e.target.value)} maxLength={200} />
          </Field>
          <Field label="Téléphone professionnel" hint="Visible dans l'annuaire Équipe.">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={workPhone}
              onChange={(e) => setWorkPhone(e.target.value)}
              maxLength={40}
            />
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
            Rôle, district de rattachement, e-mail et identifiant sont gérés par un administrateur.
          </p>
          <div>
            <Button onClick={save} loading={pending} disabled={!name.trim()}>
              <Save aria-hidden /> Enregistrer
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <DutyCard initial={duty} />
        <ActivityCard activity={activity} />
      </div>
      <Card className="lg:col-span-2">
        <CardHeader eyebrow="// Préférences" title="Affichage et notifications" />
        <CardContent>
          <ThemeSwitcher value={ui} onChange={setUi} />
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
      {passkeys ? <PasskeysCard /> : null}
      {canExtension ? (
        <Card>
          <CardHeader eyebrow="// Sécurité" title="Appareils connectés" />
          <CardContent className="flex flex-col gap-3">
            <p className="text-small text-fg-muted">
              Navigateurs où l&apos;extension DICOS est reliée à ton compte : dernière synchro,
              version, révocation.
            </p>
            <div>
              <Button asChild variant="secondary">
                <Link href="/pmr/extension">
                  <PlugZap aria-hidden /> Gérer mes appareils
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
