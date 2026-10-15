"use client";

import { useCallback } from "react";

import { useAutoRetry } from "@/lib/use-auto-retry";

// Erreur du gabarit racine (rare) : page autonome, sans le design system qui n'est peut-être pas chargé. Couleurs lues
// dans les jetons du thème quand la feuille de style est là, sinon valeurs de repli de Signal · Nuit (v4).
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  // Le gabarit racine a échoué (redéploiement en cours) : rechargement complet dès que l'application répond.
  const reload = useCallback(() => window.location.reload(), []);
  const left = useAutoRetry(reload);
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--bg, #0C0E12)",
          color: "var(--fg, #EBEDF0)",
          fontFamily: "system-ui, sans-serif",
          padding: 16,
        }}
      >
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>CSM est momentanément indisponible</h1>
          <p style={{ color: "var(--fg-muted, #AFB3B9)" }}>
            {left !== null
              ? `CSM est peut-être en cours de mise à jour. Nouvel essai automatique dans ${left} s.`
              : "Le serveur ne répond toujours pas. Réessaie dans quelques instants."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 16px",
              border: "1px solid var(--border-strong, #686C73)",
              borderRadius: "var(--r-control, 6px)",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
