"use client";

import { useEffect, useState } from "react";

/**
 * Nouvel essai automatique après une erreur de page (14 oct. 2026) : pendant un redéploiement, PocketBase ou le serveur web
 * redémarre ~30 s et la page tombait sur « momentanément indisponible ». On interroge `/api/health` toutes les 5 s (au plus
 * 2 min) et on relance l'affichage dès que l'application et PocketBase répondent. Renvoie les secondes avant le prochain essai.
 */
export function useAutoRetry(retry: () => void, { every = 5, maxTries = 24 } = {}): number | null {
  const [left, setLeft] = useState<number | null>(every);
  useEffect(() => {
    let tries = 0;
    let remaining = every;
    let stopped = false;
    const tick = window.setInterval(async () => {
      if (stopped) return;
      remaining -= 1;
      if (remaining > 0) return void setLeft(remaining);
      tries += 1;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const body = (await r.json().catch(() => null)) as {
          ok?: boolean;
          pocketbase?: boolean;
        } | null;
        if (r.ok && body?.ok && body.pocketbase !== false) {
          stopped = true;
          window.clearInterval(tick);
          retry();
          return;
        }
      } catch {
        // Serveur encore injoignable : on attend le prochain essai.
      }
      if (tries >= maxTries) {
        stopped = true;
        window.clearInterval(tick);
        return void setLeft(null);
      }
      remaining = every;
      setLeft(remaining);
    }, 1000);
    return () => {
      stopped = true;
      window.clearInterval(tick);
    };
  }, [retry, every, maxTries]);
  return left;
}
