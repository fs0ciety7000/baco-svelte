"use client";

import { Eye, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { toast } from "@/components/ui/toast";
import {
  READ_ONLY_HEADER,
  READ_ONLY_HIT_COOKIE,
  STOP_PATH,
  isBlockedRead,
  readOnlyMessage,
} from "@/lib/impersonation";

/**
 * Bandeau « Voir en tant que » (14 oct. 2026) : fixe en haut de toutes les pages (shell, /tv, maintenance), couleur
 * `warn`. Signale toute écriture refusée (403 du middleware, ou écriture PocketBase refusée dans une Server Action :
 * cookie `csm_ro_hit`) par un toast, et bloque les liens d'export avant même la requête. « Revenir à mon compte » =
 * formulaire HTML vers la route de fin (fonctionne sans JavaScript).
 */
export function ActingBanner({
  name,
  role,
  stale = false,
  expiresAt = null,
}: {
  name: string;
  role: string;
  /** Mode terminé (jeton expiré, droits changés) mais cookie encore présent : seulement le bouton de retour. */
  stale?: boolean;
  /** Fin du jeton de la cible (ms epoch) : la page est rechargée à l'échéance (retour au compte de l'admin). */
  expiresAt?: number | null;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!expiresAt) return;
    const t = setTimeout(
      () => window.location.reload(),
      Math.max(0, expiresAt - Date.now()) + 1000,
    );
    return () => clearTimeout(t);
  }, [expiresAt]);

  useEffect(() => {
    const message = readOnlyMessage(stale ? null : name);
    const warn = () =>
      toast.warning(message, {
        id: "csm-readonly",
        description: "Reviens à ton compte pour modifier quoi que ce soit.",
      });
    const original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await original(...args);
      try {
        if (res.status === 403 && res.headers.get(READ_ONLY_HEADER)) warn();
        else if (
          document.cookie.split("; ").some((c) => c.startsWith(`${READ_ONLY_HIT_COOKIE}=`))
        ) {
          document.cookie = `${READ_ONLY_HIT_COOKIE}=; Max-Age=0; path=/`;
          warn();
        }
      } catch {
        // Jamais bloquant.
      }
      return res;
    };
    // Exports, PDF, .eml, feuilles de route : refusés en lecture seule (le serveur répondrait 403).
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      try {
        const url = new URL(a.href, window.location.href);
        if (url.origin === window.location.origin && isBlockedRead(url.pathname)) {
          e.preventDefault();
          e.stopPropagation();
          toast.warning(message, {
            id: "csm-readonly",
            description: "Exports et documents nominatifs indisponibles dans ce mode.",
          });
        }
      } catch {
        // Lien illisible : laissé au navigateur.
      }
    };
    document.addEventListener("click", onClick, true);
    setReady(true);
    return () => {
      window.fetch = original;
      document.removeEventListener("click", onClick, true);
    };
  }, [name, stale]);

  return (
    <div
      role="status"
      data-testid="acting-banner"
      data-ready={ready ? "" : undefined}
      data-print="hide"
      className="fixed inset-x-0 top-0 z-[70] flex h-(--acting-h) items-center gap-2 border-b-2 border-warn bg-[color-mix(in_oklab,var(--warn)_24%,var(--surface))] px-3 text-small text-fg md:gap-3 md:px-4"
    >
      <Eye aria-hidden className="size-4 shrink-0 text-warn" />
      <p className="min-w-0 flex-1 truncate font-medium">
        {stale ? (
          "Le mode « Voir en tant que » est terminé."
        ) : (
          <>
            <span className="hidden sm:inline">Tu vois CSM en tant que </span>
            <span className="sm:hidden">En tant que </span>
            <strong className="font-semibold">{name}</strong>
            {role ? <span> ({role})</span> : null}
            <span className="hidden sm:inline"> — lecture seule</span>
          </>
        )}
      </p>
      <form action={STOP_PATH} method="post" className="shrink-0">
        <button
          type="submit"
          data-testid="acting-stop"
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border border-warn bg-surface px-3 font-semibold text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn"
        >
          <LogOut aria-hidden className="size-4" />
          <span className="sm:hidden">Revenir</span>
          <span className="hidden sm:inline">Revenir à mon compte</span>
        </button>
      </form>
    </div>
  );
}
