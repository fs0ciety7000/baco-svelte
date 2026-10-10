"use client";

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import {
  deleteMyPasskey,
  listMyPasskeys,
  passkeyLogin,
  passkeyLoginOptions,
  passkeyRegistrationOptions,
  registerPasskey,
  type MyPasskey,
} from "@/app/passkey-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatShortDay, pbDate, sinceLabel } from "@/lib/orders/time";

// Passkeys (décision du 10 oct. 2026) : Windows Hello, Touch ID, téléphone… Le mot de passe reste en secours.

const cancelled = (e: unknown) =>
  e instanceof Error && (e.name === "NotAllowedError" || e.name === "AbortError");

/** Nom proposé : système de l'appareil (aucune donnée envoyée ailleurs). */
function guessName(): string {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iPhone / iPad"
      : /Mac/.test(ua)
        ? "Mac"
        : /Android/.test(ua)
          ? "Android"
          : "Appareil";
  const nav = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox/.test(ua)
      ? "Firefox"
      : /Chrome/.test(ua)
        ? "Chrome"
        : /Safari/.test(ua)
          ? "Safari"
          : "";
  return nav ? `${os} · ${nav}` : os;
}

export function PasskeyLoginButton({ next }: { next?: string }) {
  const [supported, setSupported] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  if (!supported) return null;
  const go = () =>
    start(async () => {
      setError("");
      const opts = await passkeyLoginOptions();
      if (!opts.ok) return setError(opts.error);
      try {
        const res = await startAuthentication({ optionsJSON: opts.data });
        const r = await passkeyLogin(res);
        if (!r.ok) return setError(r.error);
        const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        window.location.assign(dest);
      } catch (e) {
        if (!cancelled(e)) setError("Passkey indisponible sur cet appareil.");
      }
    });
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        onClick={go}
        loading={pending}
        className="h-11"
        data-testid="passkey-login"
      >
        <Fingerprint aria-hidden /> Connexion par passkey
      </Button>
      {error ? (
        <p role="alert" className="text-hint text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PasskeysCard() {
  const [supported, setSupported] = useState(true);
  const [items, setItems] = useState<MyPasskey[] | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const load = async () => {
    const r = await listMyPasskeys();
    if (r.ok) setItems(r.data);
  };
  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    setName(guessName());
    void load();
  }, []);
  const add = () =>
    start(async () => {
      const opts = await passkeyRegistrationOptions();
      if (!opts.ok) return void toast.error(opts.error);
      try {
        const res = await startRegistration({ optionsJSON: opts.data });
        const r = await registerPasskey(res, name);
        if (!r.ok) return void toast.error(r.error);
        toast.success("Passkey ajoutée : tu peux t'en servir pour te connecter.");
        await load();
      } catch (e) {
        if (cancelled(e)) return;
        toast.error(
          e instanceof Error && e.name === "InvalidStateError"
            ? "Cet appareil a déjà une passkey CSM."
            : "Passkey non créée sur cet appareil.",
        );
      }
    });
  const remove = (p: MyPasskey) =>
    start(async () => {
      const r = await deleteMyPasskey(p.id);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Passkey supprimée.");
      await load();
    });
  return (
    <Card>
      <CardHeader eyebrow="// Sécurité" title="Passkeys" />
      <CardContent className="flex flex-col gap-3">
        <p className="text-small text-fg-muted">
          Connexion sans mot de passe avec Windows Hello, Touch ID, Face ID ou ton téléphone. Ton
          mot de passe reste valable en secours.
        </p>
        {items?.length ? (
          <ul className="flex flex-col gap-1.5" data-testid="passkey-list">
            {items.map((p) => {
              const used = pbDate(p.lastUsed);
              return (
                <li key={p.id} className="flex items-center gap-3 border border-border px-3 py-2">
                  <KeyRound aria-hidden className="size-4 shrink-0 text-fg-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body text-fg">{p.name}</span>
                    <span className="text-small text-fg-muted">
                      Ajoutée le {formatShortDay(p.created.slice(0, 10))}
                      {used ? ` · utilisée ${sinceLabel(used)}` : " · jamais utilisée"}
                      {p.synced ? " · synchronisée" : ""}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Supprimer la passkey ${p.name}`}
                    onClick={() => remove(p)}
                    disabled={pending}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : items ? (
          <p className="text-small text-fg-muted">Aucune passkey pour l&apos;instant.</p>
        ) : null}
        {supported ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-small text-fg-muted">Nom de cet appareil</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
            <Button variant="secondary" onClick={add} loading={pending} data-testid="passkey-add">
              <Fingerprint aria-hidden /> Ajouter une passkey
            </Button>
          </div>
        ) : (
          <p className="text-small text-warn">Ce navigateur ne gère pas les passkeys.</p>
        )}
      </CardContent>
    </Card>
  );
}
