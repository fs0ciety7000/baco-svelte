"use client";

// Erreur du gabarit racine (rare) : page autonome, sans le design system qui n'est peut-être pas chargé.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#0B0A09",
          color: "#EDE6DA",
          fontFamily: "system-ui, sans-serif",
          padding: 16,
        }}
      >
        <main style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20 }}>CSM est momentanément indisponible</h1>
          <p style={{ color: "#B1AA9E" }}>
            Le serveur redémarre peut-être. Réessaie dans quelques secondes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 44,
              padding: "0 16px",
              border: "1px solid #EDE6DA",
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
