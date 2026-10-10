"use client";

import { CheckCircle2, KeyRound, Link2, Puzzle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { revokeAgentConnectorToken } from "@/app/(app)/admin/actions";
import { revokeConnectorToken, createConnectorToken } from "@/app/(app)/pmr/extension/actions";
import { CopyButton } from "@/components/pmr/copy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/status-badge";
import { toast } from "@/components/ui/toast";
import { isNewer } from "@/lib/pmr/extension-releases";
import type { ConnectorToken } from "@/server/extension";

// Connexion de l'extension DICOS au compte de l'agent (1.7.0) : le script `csm-link.js` de l'extension, actif sur cette
// page seulement, annonce sa version (`hello`) et reçoit le jeton personnel par postMessage (même origine).

type Detected = { version: string; configured: boolean; permission: boolean; prefix: string };
type Hello = {
  source: "csm-dicos-connector";
  type: string;
  version?: string;
  configured?: boolean;
  permission?: boolean;
  prefix?: string;
  ok?: boolean;
};

const fmt = new Intl.DateTimeFormat("fr-BE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Brussels",
});
const when = (iso: string | null) => (iso ? fmt.format(new Date(iso.replace(" ", "T"))) : "jamais");

function browserLabel(): string {
  const ua = navigator.userAgent;
  const name = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : "Navigateur";
  return `${name} · ${new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}`;
}

export function ExtensionConnect({
  latest,
  origin,
  tokens,
  canConnect,
}: {
  latest: string | null;
  origin: string;
  tokens: ConnectorToken[];
  /** Droit d'écrire les missions PMR (`deplacements:write`), exigé pour créer un jeton. */
  canConnect: boolean;
}) {
  const [detected, setDetected] = useState<Detected | null | "none">(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const configuredWaiter = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const d = event.data as Hello | null;
      if (!d || d.source !== "csm-dicos-connector") return;
      if (d.type === "hello" && typeof d.version === "string")
        setDetected({
          version: d.version,
          configured: !!d.configured,
          permission: !!d.permission,
          prefix: typeof d.prefix === "string" ? d.prefix : "",
        });
      if (d.type === "configured") configuredWaiter.current?.(!!d.ok);
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "csm-page", type: "ping" }, window.location.origin);
    const t = window.setTimeout(() => setDetected((cur) => cur ?? "none"), 1500);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(t);
    };
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const r = await createConnectorToken(browserLabel());
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const ok = await new Promise<boolean>((resolve) => {
        const t = window.setTimeout(() => resolve(false), 3000);
        configuredWaiter.current = (v) => {
          window.clearTimeout(t);
          resolve(v);
        };
        window.postMessage(
          { source: "csm-page", type: "configure", token: r.token },
          window.location.origin,
        );
      });
      configuredWaiter.current = null;
      // Reconnexion : l'ancien jeton de CE navigateur est révoqué (sinon il resterait valable).
      const previous =
        ok && detected && detected !== "none" && detected.prefix
          ? tokens.find((t) => t.prefix === detected.prefix && t.id !== r.id)
          : undefined;
      if (previous) await revokeConnectorToken(previous.id);
      if (ok) toast.success("Extension connectée à ton compte.");
      else setManual(r.token); // l'extension n'a pas répondu : copie à la main
    } finally {
      setBusy(false);
    }
  }, [detected, tokens]);

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      const r = await createConnectorToken(browserLabel());
      if (r.ok) setManual(r.token);
      else toast.error(r.error);
    } finally {
      setBusy(false);
    }
  }, []);

  const outdated = detected && detected !== "none" && latest && isNewer(latest, detected.version);

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="extension-detect"
        className="flex flex-col gap-3 rounded-box border border-border p-3"
      >
        {detected === null ? (
          <p className="text-body text-fg-muted">
            Recherche de l&apos;extension dans ce navigateur…
          </p>
        ) : detected === "none" ? (
          <>
            <p className="flex items-start gap-2 text-body">
              <Puzzle aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              <span>
                Extension non détectée dans ce navigateur (version 1.7.0 ou plus). Installe-la ou
                mets-la à jour, recharge cette page, puis connecte-la en un clic.
              </span>
            </p>
            {canConnect ? (
              <div>
                <Button variant="secondary" onClick={generate} loading={busy}>
                  <KeyRound aria-hidden />
                  Générer un jeton à coller à la main
                </Button>
              </div>
            ) : (
              <p className="text-small text-fg-muted">
                Connecter l&apos;extension demande le droit d&apos;écrire les missions PMR :
                demande-le à un administrateur.
              </p>
            )}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-body">
              <span className="font-medium">Extension {detected.version} détectée</span>
              {outdated ? (
                <Badge tone="warn">Mise à jour {latest} disponible</Badge>
              ) : (
                <Badge tone="ok">À jour</Badge>
              )}
              {detected.configured ? <Badge tone="ok">Connectée à ce CSM</Badge> : null}
            </div>
            {outdated ? (
              <p className="text-small text-warn">
                Télécharge la version {latest} ci-dessus et suis « Passer à une nouvelle version ».
              </p>
            ) : null}
            {detected.configured && !detected.permission ? (
              <p className="flex items-start gap-2 text-small text-warn">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                Dernière étape : ouvre l&apos;extension et clique « Autoriser CSM ».
              </p>
            ) : null}
            {canConnect ? (
              <div>
                <Button
                  variant={detected.configured ? "secondary" : "primary"}
                  onClick={connect}
                  loading={busy}
                >
                  <Link2 aria-hidden />
                  {detected.configured
                    ? "Reconnecter avec un nouveau jeton"
                    : "Connecter l'extension à mon compte"}
                </Button>
              </div>
            ) : (
              <p className="text-small text-fg-muted">
                Connecter l&apos;extension demande le droit d&apos;écrire les missions PMR :
                demande-le à un administrateur.
              </p>
            )}
          </>
        )}
        {manual ? (
          <div
            className="flex flex-col gap-2 rounded-box border border-warn/50 bg-surface-2 p-3"
            data-testid="manual-token"
          >
            <p className="text-small font-medium">
              Ton jeton (affiché une seule fois) : colle-le dans « Jeton de connecteur » de
              l&apos;extension, avec l&apos;URL CSM ci-dessous, puis « Enregistrer les réglages ».
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-control bg-surface px-1.5 py-0.5 font-mono text-small break-all">
                {manual}
              </code>
              <CopyButton text={manual} label="Copier le jeton" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-small">
              URL CSM : <code className="font-mono">{origin}</code>
              <CopyButton text={origin} label="Copier" />
            </div>
          </div>
        ) : null}
      </div>
      <TokenList tokens={tokens} />
    </div>
  );
}

/**
 * Appareils connectés (jetons de l'extension). `admin` : révocation par l'administration (tout agent) ;
 * avec `owner` renseigné, le propriétaire est affiché avec un lien vers sa fiche.
 */
export function TokenList({
  tokens,
  admin = false,
  title = "Mes appareils connectés",
  empty = "Aucun appareil connecté à ton compte pour l'instant.",
}: {
  tokens: ConnectorToken[];
  admin?: boolean;
  title?: string;
  empty?: string;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!tokens.length)
    return (
      <div className="flex flex-col gap-1">
        {title ? <p className="text-body font-semibold">{title}</p> : null}
        <p className="text-small text-fg-muted">{empty}</p>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {title ? <p className="text-body font-semibold">{title}</p> : null}
      <ul
        className="flex flex-col divide-y divide-border rounded-box border border-border"
        data-testid="connector-tokens"
      >
        {tokens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 text-body font-medium">
                {t.lastUsed ? <CheckCircle2 aria-hidden className="size-4 text-ok" /> : null}
                {t.label || "Extension DICOS"}
              </span>
              {t.owner ? (
                <Link
                  href={`/admin/utilisateurs/${t.owner.id}`}
                  className="text-small link"
                  data-testid="token-owner"
                >
                  {t.owner.name}
                </Link>
              ) : null}
              <span className="text-small text-fg-muted">
                <span className="font-mono">{t.prefix}…</span> · créé le {when(t.created)} ·
                dernière synchro {when(t.lastUsed)}
                {t.lastVersion ? ` · v${t.lastVersion}` : ""}
              </span>
            </div>
            <Button
              size="sm"
              variant={confirm === t.id ? "danger" : "ghost"}
              loading={busy === t.id}
              onClick={async () => {
                if (confirm !== t.id) {
                  setConfirm(t.id);
                  return;
                }
                setBusy(t.id);
                const r = admin
                  ? await revokeAgentConnectorToken(t.id)
                  : await revokeConnectorToken(t.id);
                setBusy(null);
                setConfirm(null);
                if (r.ok)
                  toast.success(
                    "Jeton révoqué : l'extension ne pourra plus envoyer d'ici une minute.",
                  );
                else toast.error(r.error);
              }}
            >
              {confirm === t.id ? "Confirmer la révocation" : "Révoquer"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
