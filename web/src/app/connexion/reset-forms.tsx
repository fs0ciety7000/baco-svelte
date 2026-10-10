"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  confirmReset,
  requestReset,
  type NewPasswordState,
  type ResetState,
} from "./reset-actions";

export function RequestResetForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestReset, {});
  if (state.sent)
    return (
      <div className="flex flex-col gap-3" role="status" data-testid="reset-sent">
        <p className="text-body text-fg">
          Si un compte CSM utilise cette adresse, un e-mail vient de partir avec un lien valable 30
          minutes.
        </p>
        <p className="text-small text-fg-muted">
          Rien reçu après quelques minutes ? Regarde dans les courriers indésirables, puis contacte
          un administrateur.
        </p>
        <Link href="/connexion" className="link text-body">
          Retour à la connexion
        </Link>
      </div>
    );
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-mail du compte</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 text-base"
        />
      </div>
      <p role="alert" aria-live="polite" className="min-h-5 text-hint text-danger">
        {state.error}
      </p>
      <Button type="submit" variant="primary" loading={pending} className="h-11">
        Envoyer le lien
      </Button>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(confirmReset, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Nouveau mot de passe</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          className="h-11 text-base"
        />
        <span className="text-hint text-fg-muted">10 caractères au moins.</span>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirmer</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className="h-11 text-base"
        />
      </div>
      <p role="alert" aria-live="polite" className="min-h-5 text-hint text-danger">
        {state.error}
      </p>
      <Button type="submit" variant="primary" loading={pending} className="h-11">
        Enregistrer le mot de passe
      </Button>
    </form>
  );
}
